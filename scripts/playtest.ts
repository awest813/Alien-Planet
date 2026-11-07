// Playtest harness: 100 simulated players, each with a play style, on a spread of seeds, difficulties
// and map sizes. They play headless while invariants are checked: no crashes, no impossible state
// (NaN needs, people or items inside walls, leaked reservations, prisoners off their beds), no jobs
// stuck for a day, and a save that loads into exactly the same game.
//
//   npx tsx scripts/playtest.ts [days=16] [from=0] [to=100] [only=persona]
import { writeFileSync } from 'node:fs';
import { MAP_SIZES } from '../src/sim/constants';
import { FEATURES, NONE, RECIPES, featureDef, featureId, terrainDef } from '../src/sim/defs';
import { deserialize, serialize } from '../src/sim/serialize';
import { Simulation, TICKS_PER_HOUR } from '../src/sim/simulation';
import { Difficulty } from '../src/sim/storyteller';
import { Command, DesignationKind, ScheduleSlot, Stance, WORK_TYPES } from '../src/sim/types';
import { GROW_ZONE, STOCKPILE_ZONE } from '../src/sim/world';
import { Rng } from '../src/sim/rng';
import { itemDef, itemId } from '../src/sim/defs';
const itemDefName = (i: number) => itemDef(i).key;

const arg = (name: string, fallback: number) =>
  Number(process.argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback);
const DAYS = arg('days', 16);
const FROM = arg('from', 0);
const TO = arg('to', 100);
const ONLY = process.argv.find((a) => a.startsWith('only='))?.slice(5);
// "players=3,20,40" plays just those.
const PLAYERS = process.argv
  .find((a) => a.startsWith('players='))
  ?.slice(8)
  .split(',')
  .map(Number);

const PERSONAS = [
  'builder', // a sensible colony, by the book
  'farmer', // big fields, little else
  'militarist', // walls, traps, drafts at every raid, focus fire
  'neglectful', // a stockpile and then nothing
  'micromanager', // forever changing priorities and schedules
  'chaos', // random orders of every kind, anywhere
  'artist', // sculptures, instruments, flowers, galleries
  'warden', // prisoner beds and capturing everyone
  'savescummer', // saves and reloads constantly
  'demolisher', // builds, then tears things down and cancels
] as const;
type Persona = (typeof PERSONAS)[number];

const DIFFICULTIES: Difficulty[] = ['peaceful', 'standard', 'harsh'];
const crop = (key: string) => GROW_ZONE + featureId(key);
const BUILDABLE = FEATURES.filter((f) => f.build && !f.natural);

interface Report {
  player: number;
  persona: Persona;
  seed: number;
  difficulty: Difficulty;
  size: number;
  alive: number;
  total: number;
  day: number;
  crash?: string;
  problems: Map<string, number>;
  idleHours: number;
  colonistHours: number;
  deaths: string[];
}

function findSite(sim: Simulation, w: number, h: number, avoid: Set<number>): { x: number; y: number } | null {
  const world = sim.world;
  const anchor = (sim.living()[0] ?? sim.colonists[0]).tile;
  const cx = world.xOf(anchor);
  const cy = world.yOf(anchor);
  const home = sim.regionOf(anchor);
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = Math.max(1, cy - 30); y + h < Math.min(world.height - 1, cy + 30); y++) {
    for (let x = Math.max(1, cx - 30); x + w < Math.min(world.width - 1, cx + 30); x++) {
      const d = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
      if (best && d >= best.d) {
        continue;
      }
      let ok = true;
      for (let ty = y; ty < y + h && ok; ty++) {
        for (let tx = x; tx < x + w && ok; tx++) {
          const i = world.idx(tx, ty);
          const f = world.feature[i];
          ok =
            !avoid.has(i) &&
            sim.regionOf(i) === home &&
            terrainDef(world.terrain[i]).buildable &&
            (f === NONE || !!FEATURES[f - 1].harvest) &&
            world.blueprint[i] === NONE;
        }
      }
      if (ok) {
        best = { x, y, d };
      }
    }
  }
  return best;
}

function claim(avoid: Set<number>, sim: Simulation, x: number, y: number, w: number, h: number): void {
  for (let ty = y - 1; ty <= y + h; ty++) {
    for (let tx = x - 1; tx <= x + w; tx++) {
      if (sim.world.inBounds(tx, ty)) {
        avoid.add(sim.world.idx(tx, ty));
      }
    }
  }
}

// A by-the-book start: wood and food orders, a hut with beds and a fire, a stockpile and a field.
function basics(sim: Simulation, avoid: Set<number>, rect: (x0: number, y0: number, x1: number, y1: number) => void) {
  const w = sim.world;
  const c = sim.colonists[0];
  const cx = w.xOf(c.tile);
  const cy = w.yOf(c.tile);
  sim.apply({ type: 'designate', rect: { x0: cx - 14, y0: cy - 14, x1: cx + 14, y1: cy + 14 }, kind: 'chop' });
  sim.apply({ type: 'designate', rect: { x0: cx - 18, y0: cy - 18, x1: cx + 18, y1: cy + 18 }, kind: 'forage' });
  // Seven rows of hut and one clear row in front of the door.
  const hut = findSite(sim, 9, 8, avoid);
  if (hut) {
    claim(avoid, sim, hut.x, hut.y, 9, 8);
    const walls: number[] = [];
    for (let y = hut.y; y < hut.y + 7; y++) {
      for (let x = hut.x; x < hut.x + 9; x++) {
        if (x === hut.x || y === hut.y || x === hut.x + 8 || y === hut.y + 6) {
          walls.push(w.idx(x, y));
        }
      }
    }
    sim.apply({ type: 'build', feature: featureId('woodWall'), tiles: walls });
    sim.apply({ type: 'build', feature: featureId('door'), tiles: [w.idx(hut.x + 4, hut.y + 6)] });
    sim.apply({
      type: 'build',
      feature: featureId('bed'),
      tiles: sim.colonists.map((_, k) => w.idx(hut.x + 1 + (k % 7), hut.y + 1 + Math.floor(k / 7))),
    });
    sim.apply({ type: 'build', feature: featureId('campfire'), tiles: [w.idx(hut.x + 7, hut.y + 4)] });
  }
  const stock = findSite(sim, 5, 3, avoid);
  if (stock) {
    claim(avoid, sim, stock.x, stock.y, 5, 3);
    rect(stock.x, stock.y, stock.x + 4, stock.y + 2);
  }
  const farm = findSite(sim, 6, 4, avoid);
  if (farm) {
    claim(avoid, sim, farm.x, farm.y, 6, 4);
    sim.apply({
      type: 'zone',
      rect: { x0: farm.x, y0: farm.y, x1: farm.x + 5, y1: farm.y + 3 },
      zone: crop('potatoPlant'),
    });
  }
  return hut;
}

function placeOne(sim: Simulation, avoid: Set<number>, key: string): number | null {
  const spot = findSite(sim, 1, 1, avoid);
  if (!spot) {
    return null;
  }
  claim(avoid, sim, spot.x, spot.y, 1, 1);
  const tile = sim.world.idx(spot.x, spot.y);
  sim.apply({ type: 'build', feature: featureId(key), tiles: [tile] });
  return tile;
}

// ---- Invariants ----

function check(sim: Simulation, problems: Map<string, number>, hourly: boolean): void {
  const w = sim.world;
  const note = (p: string) => problems.set(p, (problems.get(p) ?? 0) + 1);
  for (const c of sim.colonists) {
    if (c.health.dead) {
      continue;
    }
    if (!w.inBounds(w.xOf(c.tile), w.yOf(c.tile)) || c.tile < 0 || c.tile >= w.size) {
      note('colonist off the map');
      continue;
    }
    for (const [k, v] of Object.entries(c.needs)) {
      if (!Number.isFinite(v) || v < -1e-9 || v > 1 + 1e-9) {
        note(`need ${k} out of range (${v})`);
      }
    }
    if (!Number.isFinite(c.mood)) {
      note('mood is not a number');
    }
    for (const [k, v] of Object.entries(c.skills)) {
      if (!Number.isFinite(v) || v < 0 || v > 20) {
        note(`skill ${k} out of range (${v})`);
      }
    }
    for (const work of WORK_TYPES) {
      const p = c.priorities[work];
      if (!Number.isInteger(p) || p < 0 || p > 4) {
        note(`priority ${work} invalid (${p})`);
      }
    }
    if (!w.isPassable(c.tile)) {
      note(`living colonist inside an impassable tile (${featureDef(w.feature[c.tile])?.key ?? 'terrain'})`);
    }
    if (!Number.isFinite(c.health.bloodLoss) || c.health.injuries.some((i) => !Number.isFinite(i.severity))) {
      note('health is not a number');
    }
    if (c.carrying && (!(c.carrying.count > 0) || !Number.isInteger(c.carrying.count))) {
      note(`carrying a bad count (${c.carrying.count})`);
    }
  }
  // Reservations held by someone who isn't on a job that could hold them.
  for (const [key, owner] of sim.reservations) {
    const c = sim.colonists[owner];
    if (!c || c.health.dead) {
      note(`reservation ${key.replace(/\d+/g, '#')} held by the dead or missing`);
    } else if (!c.reserved.includes(key)) {
      note(`reservation ${key.replace(/\d+/g, '#')} not in its holder's list`);
    }
  }
  if (hourly) {
    for (let i = 0; i < w.size; i++) {
      const count = w.itemCount[i];
      if (w.itemType[i] === NONE ? count !== 0 : !(count > 0) || !Number.isInteger(count)) {
        note(`bad item stack (${count})`);
      }
      if (w.itemType[i] !== NONE && !w.isPassable(i)) {
        note(`items inside an impassable tile (${featureDef(w.feature[i])?.key ?? 'terrain'})`);
      }
      if (w.filth[i] !== 0 && (!w.isPassable(i) || w.isOpenWater(i))) {
        note('mess on an impassable or open-water tile');
      }
    }
    for (const p of sim.captives) {
      if (p.tile < 0 || p.tile >= w.size) {
        note('captive off the map');
      } else if (p.state === 'prisoner' && w.feature[p.tile] !== featureId('prisonerBed')) {
        note('prisoner not on a prisoner bed');
      } else if (p.state === 'downed' && !w.isPassable(p.tile)) {
        note('downed raider inside an impassable tile');
      }
      if (!Number.isFinite(p.food) || !Number.isFinite(p.resistance)) {
        note('captive state is not a number');
      }
    }
    for (const a of sim.animals) {
      if (!Number.isFinite(a.hp)) {
        note('animal hp is not a number');
      }
    }
    for (const e of sim.enemies) {
      if (!Number.isFinite(e.hp)) {
        note('raider hp is not a number');
      }
    }
    const totals = sim.resourceTotals();
    if (totals.some((t) => !Number.isFinite(t.total) || t.total < 0)) {
      note('resource totals broken');
    }
  }
}

// Plain data for comparing two saves.
const canonical = (sim: Simulation) =>
  JSON.stringify(serialize(sim), (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v));

// ---- One player ----

function play(player: number): Report {
  const persona = PERSONAS[player % PERSONAS.length];
  const seed = 1000 + player * 7717;
  const difficulty = DIFFICULTIES[Math.floor(player / PERSONAS.length) % 3];
  const size = MAP_SIZES[Math.floor(player / (PERSONAS.length * 3)) % MAP_SIZES.length].size;
  let sim = Simulation.newColony(seed, difficulty, size);
  // The player's own whims, separate from the game's dice.
  const rng = new Rng(seed ^ 0x5eed);
  const w = () => sim.world;
  const avoid = new Set<number>();
  const problems = new Map<string, number>();
  const report: Report = {
    player,
    persona,
    seed,
    difficulty,
    size,
    alive: 0,
    total: 0,
    day: 1,
    problems,
    idleHours: 0,
    colonistHours: 0,
    deaths: [],
  };
  const note = (p: string) => problems.set(p, (problems.get(p) ?? 0) + 1);
  const stockpile = (x0: number, y0: number, x1: number, y1: number) =>
    sim.apply({ type: 'zone', rect: { x0, y0, x1, y1 }, zone: STOCKPILE_ZONE });
  const randomRect = (span = 12) => {
    const x = rng.int(0, w().width - 1);
    const y = rng.int(0, w().height - 1);
    return {
      x0: x,
      y0: y,
      x1: Math.min(w().width - 1, x + rng.int(0, span)),
      y1: Math.min(w().height - 1, y + rng.int(0, span)),
    };
  };
  const nearHome = (r: number) => {
    const c = sim.living()[0] ?? sim.colonists[0];
    const x = Math.max(0, Math.min(w().width - 1, w().xOf(c.tile) + rng.int(-r, r)));
    const y = Math.max(0, Math.min(w().height - 1, w().yOf(c.tile) + rng.int(-r, r)));
    return w().idx(x, y);
  };
  // Who's been doing the same thing in the same place for how long.
  const sameSince = new Map<number, { key: string; since: number }>();

  if (persona !== 'chaos') {
    stockpileFirst();
  }
  function stockpileFirst() {
    if (persona === 'neglectful') {
      const c = sim.colonists[0];
      stockpile(w().xOf(c.tile) + 2, w().yOf(c.tile) + 2, w().xOf(c.tile) + 5, w().yOf(c.tile) + 4);
      return;
    }
    basics(sim, avoid, stockpile);
    if (persona === 'farmer') {
      for (const key of ['potatoPlant', 'healrootPlant', 'cottonPlant', 'potatoPlant']) {
        const field = findSite(sim, 8, 5, avoid);
        if (field) {
          claim(avoid, sim, field.x, field.y, 8, 5);
          sim.apply({
            type: 'zone',
            rect: { x0: field.x, y0: field.y, x1: field.x + 7, y1: field.y + 4 },
            zone: crop(key),
          });
        }
      }
    }
  }

  const research = [
    'hearths',
    'cropRotation',
    'tailoring',
    'archery',
    'fieldMedicine',
    'fortifications',
    'electricity',
  ];
  try {
    for (let hour = 0; hour < DAYS * 24; hour++) {
      // ---- The player's turn, once an hour ----
      const day = sim.day;
      report.day = day;
      if (sim.departed) {
        break;
      }
      if (hour === 30 && persona !== 'neglectful' && persona !== 'chaos') {
        placeOne(sim, avoid, 'stove');
        placeOne(sim, avoid, 'researchBench');
        placeOne(sim, avoid, 'table');
        sim.apply({ type: 'bill', recipe: RECIPES.find((r) => r.key === 'cookMeal')!.id, target: 20 });
      }
      if (hour % 24 === 0 && persona !== 'neglectful') {
        const next = research.find((k) => !sim.isResearched(k));
        sim.apply({ type: 'research', project: next ?? null });
      }
      switch (persona) {
        case 'militarist':
          if (hour === 60) {
            for (let k = 0; k < 6; k++) {
              placeOne(sim, avoid, 'spikeTrap');
            }
            placeOne(sim, avoid, 'sandbags');
          }
          break;
        case 'artist':
          if (hour === 40 || hour === 120 || hour === 200) {
            for (const key of ['sculptureSmall', 'flowerPot', 'lute', 'banner', 'drum', 'chessTable']) {
              if (FEATURES.some((f) => f.key === key)) {
                placeOne(sim, avoid, key);
              }
            }
          }
          break;
        case 'warden':
          if (hour === 36) {
            for (let k = 0; k < 3; k++) {
              placeOne(sim, avoid, 'prisonerBed');
            }
          }
          if (sim.captives.some((p) => p.state === 'downed' && !p.capture)) {
            sim.apply({ type: 'capture', rect: { x0: 0, y0: 0, x1: w().width - 1, y1: w().height - 1 }, add: true });
          }
          // Now and then, a change of heart.
          if (rng.chance(0.01)) {
            const held = sim.captives.filter((p) => p.state === 'prisoner');
            if (held.length > 0) {
              sim.apply({ type: 'release', captive: rng.pick(held).id });
            }
          }
          break;
        case 'micromanager':
          for (let k = 0; k < 4; k++) {
            const c = rng.pick(sim.colonists);
            sim.apply({ type: 'priority', colonist: c.id, work: rng.pick([...WORK_TYPES]), value: rng.int(0, 4) });
            sim.apply({
              type: 'schedule',
              colonist: c.id,
              hour: rng.int(0, 23),
              slot: rng.pick<ScheduleSlot>(['A', 'W', 'J', 'S']),
            });
          }
          break;
        case 'demolisher':
          if (hour > 48 && rng.chance(0.15)) {
            const r = nearHome(10);
            sim.apply({
              type: 'designate',
              rect: { x0: w().xOf(r), y0: w().yOf(r), x1: w().xOf(r) + rng.int(0, 4), y1: w().yOf(r) + rng.int(0, 4) },
              kind: 'deconstruct',
            });
          }
          if (rng.chance(0.1)) {
            const r = nearHome(10);
            sim.apply({
              type: 'cancel',
              rect: { x0: w().xOf(r), y0: w().yOf(r), x1: w().xOf(r) + 3, y1: w().yOf(r) + 3 },
            });
          }
          if (rng.chance(0.1)) {
            placeOne(sim, avoid, rng.pick(['woodWall', 'bed', 'table', 'campfire', 'woodFloor']));
          }
          break;
        case 'chaos':
          for (let k = 0; k < 3; k++) {
            chaos();
          }
          break;
        case 'savescummer':
          if (hour % 3 === 0) {
            const before = canonical(sim);
            sim = deserialize(structuredClone(serialize(sim)));
            if (canonical(sim) !== before) {
              note('save and load changed the game');
            }
          }
          break;
        default:
          break;
      }

      // ---- An hour of play, with the draft handled like a player would ----
      for (let t = 0; t < TICKS_PER_HOUR; t++) {
        if (t % 40 === 0 && (persona === 'militarist' || persona === 'builder' || persona === 'warden')) {
          const fighting = sim.enemies.some((e) => !e.fleeing && e.hp > 0) && sim.raid?.arrivedTick !== undefined;
          for (const c of sim.living()) {
            const fit = fighting && !c.health.downed;
            if (c.drafted !== fit) {
              sim.apply({ type: 'draft', colonist: c.id, drafted: fit });
            }
          }
          if (fighting && persona === 'militarist') {
            const target = sim.enemies.find((e) => e.hp > 0 && !e.fleeing);
            if (target) {
              sim.apply({ type: 'focus', colonist: -1, enemy: target.id });
            }
          }
        }
        sim.step();
        if (t % 50 === 0) {
          check(sim, problems, false);
        }
      }
      check(sim, problems, true);
      // SAVEAT=12 SAVEDIR=dir: keep a save of each colony at that day, for loading into the browser.
      if (process.env.SAVEAT && hour === Number(process.env.SAVEAT) * 24) {
        writeFileSync(
          `${process.env.SAVEDIR ?? '.'}/p${player}.json`,
          JSON.stringify(serialize(sim), (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v)),
        );
      }
      if (process.env.BUILD && hour % 24 === 12) {
        const ww = sim.world;
        const count = (key: string) =>
          [...ww.tilesWith('features')].filter((i) => ww.feature[i] === featureId(key)).length;
        const bps = [...ww.tilesWith('blueprints')];
        console.log(
          `  d${sim.day}: walls ${count('woodWall')} doors ${count('door')} beds ${count('bed')} blueprints ${bps.length} ` +
            `wood ${sim.stockOf(itemId('wood'))} rooms ${sim.allRooms().filter((r) => r.enclosed).length} ` +
            `waiting ${[...new Set(bps.map((i) => (ww.blueprintNeeds(i).length > 0 ? 'materials' : ww.feature[i] !== NONE ? 'blocked:' + featureDef(ww.feature[i]).key : 'buildable')))].join(',')} ` +
            `prio construct ${sim.colonists.map((c) => c.priorities.construction).join('')} ` +
            `fires ${[...ww.tilesWith('features')]
              .filter((i) => ww.feature[i] === featureId('campfire'))
              .map((i) => ww.fuel[i].toFixed(0))
              .join(',')}`,
        );
      }
      if (process.env.WHERE && sim.day >= Number(process.env.WHERE) && Math.floor(sim.hour) === 23) {
        const ww = sim.world;
        console.log(
          `  d${sim.day} 23h gathering ${sim.gathering?.kind ?? '-'} raid ${!!sim.raid} weather ${sim.weather.kind} ` +
            sim
              .living()
              .map(
                (c) =>
                  `${c.name}@${ww.xOf(c.tile)},${ww.yOf(c.tile)} ${c.job?.type}/${c.job?.target}${c.sleeping ? ' zz' : ''} bed?${ww.feature[c.tile] === featureId('bed')}`,
              )
              .join(' | '),
        );
        const beds = [...ww.tilesWith('features')].filter((i) => ww.feature[i] === featureId('bed'));
        console.log(
          '   regions: colonists',
          sim
            .living()
            .map((c) => sim.regionOf(c.tile))
            .join(','),
          'beds',
          beds.map((i) => sim.regionOf(i)).join(','),
          'bed holds',
          beds.map((i) => sim.reservations.get(`b${i}`) ?? '-').join(','),
          'door',
          [...ww.tilesWith('features')]
            .filter((i) => ww.feature[i] === featureId('door'))
            .map((i) => `${ww.xOf(i)},${ww.yOf(i)} region ${sim.regionOf(i)}`)
            .join(' '),
        );
        for (const d of [...ww.tilesWith('features')].filter((i) => ww.feature[i] === featureId('door'))) {
          console.log(
            '   around door',
            ww
              .neighbors(d)
              .map(
                (n) =>
                  `${ww.xOf(n)},${ww.yOf(n)}:${ww.feature[n] ? featureDef(ww.feature[n]).key : terrainDef(ww.terrain[n]).key}${ww.blueprint[n] ? '+bp ' + featureDef(ww.blueprint[n]).key : ''} pass ${ww.isPassable(n)} r${sim.regionOf(n)}`,
              )
              .join(' '),
          );
        }
        console.log(
          '   beds at',
          [...ww.tilesWith('features')]
            .filter((i) => ww.feature[i] === featureId('bed'))
            .map((i) => `${ww.xOf(i)},${ww.yOf(i)} indoors ${sim.isIndoors(i)}`)
            .join(' '),
        );
      }
      if (process.env.TRACE && sim.day >= Number(process.env.TRACE)) {
        const out = sim.outdoorTemperature().toFixed(0);
        console.log(
          `  d${sim.day} ${Math.floor(sim.hour)}h out ${out}°C ` +
            sim
              .living()
              .map(
                (c) =>
                  `${c.name}:${c.job?.type ?? '-'} ${sim.isIndoors(c.tile) ? 'in' : 'OUT'} ${sim.temperatureAt(c.tile).toFixed(0)}° hypo ${c.health.hypothermia.toFixed(2)} ${c.apparel ? itemDefName(c.apparel.item) : 'naked'}`,
              )
              .join(' | '),
        );
      }

      // Who's stuck: the same job on the same tile for a whole day (sleep and rest excepted).
      for (const c of sim.living()) {
        report.colonistHours++;
        if (!c.job && !c.drafted && !c.health.downed) {
          report.idleHours++;
        }
        const key = `${c.job?.type ?? 'none'}@${c.tile}`;
        const was = sameSince.get(c.id);
        if (!was || was.key !== key) {
          sameSince.set(c.id, { key, since: hour });
        } else if (
          hour - was.since >= 24 &&
          c.job &&
          !['sleep', 'rest', 'warmUp', 'shelter'].includes(c.job.type) &&
          !c.drafted &&
          !c.health.downed
        ) {
          note(`stuck on '${c.job.type}' for a day`);
          sameSince.set(c.id, { key, since: hour });
        }
      }

      // Every few days: the same save loaded twice must play out identically. (Jobs aren't saved, so a
      // loaded game re-plans and won't match the original; it must still be deterministic.)
      if (hour % 96 === 50) {
        const save = serialize(sim);
        const a = deserialize(structuredClone(save));
        const b = deserialize(structuredClone(save));
        for (let t = 0; t < TICKS_PER_HOUR * 3; t++) {
          a.step();
          b.step();
        }
        if (canonical(a) !== canonical(b)) {
          note('the same save played out two different ways');
        }
        if (canonical(a) === canonical(sim)) {
          note('a loaded game did not advance');
        }
      }
    }
  } catch (err) {
    const e = err as Error;
    report.crash = `${e.message}\n${(e.stack ?? '').split('\n').slice(1, 6).join('\n')}`;
  }
  report.deaths = sim.storyLog
    .filter((e) => / has died of /.test(e.text))
    .map((e) => `d${e.day} ${e.text.replace(/^.* has died of /, '').replace(/\.$/, '')}`);
  report.alive = sim.living().length;
  report.total = sim.colonists.length;
  return report;

  // A random order of any kind, anywhere: the click-happy player.
  function chaos(): void {
    const kinds: (() => Command)[] = [
      () => ({
        type: 'designate',
        rect: randomRect(),
        kind: rng.pick<DesignationKind>(['mine', 'chop', 'forage', 'deconstruct']),
      }),
      () => ({ type: 'cancel', rect: randomRect() }),
      () => ({
        type: 'zone',
        rect: randomRect(6),
        zone: rng.pick([0, STOCKPILE_ZONE, crop('potatoPlant'), crop('cottonPlant'), crop('healrootPlant')]),
      }),
      () => ({
        type: 'build',
        feature: rng.pick(BUILDABLE).id,
        tiles: Array.from({ length: rng.int(1, 6) }, () => nearHome(15)),
      }),
      () => ({
        type: 'priority',
        colonist: rng.pick(sim.colonists).id,
        work: rng.pick([...WORK_TYPES]),
        value: rng.int(0, 4),
      }),
      () => ({
        type: 'schedule',
        colonist: rng.pick(sim.colonists).id,
        hour: rng.int(0, 23),
        slot: rng.pick<ScheduleSlot>(['A', 'W', 'J', 'S']),
      }),
      () => ({ type: 'bill', recipe: rng.pick(RECIPES).id, target: rng.int(0, 30) }),
      () => ({ type: 'draft', colonist: rng.pick(sim.colonists).id, drafted: rng.chance(0.5) }),
      () => ({ type: 'move', colonist: rng.pick(sim.colonists).id, tile: nearHome(20) }),
      () => ({
        type: 'stance',
        colonist: rng.pick(sim.colonists).id,
        stance: rng.pick<Stance>(['cover', 'hold', 'charge']),
      }),
      () => ({
        type: 'focus',
        colonist: rng.chance(0.5) ? -1 : rng.pick(sim.colonists).id,
        enemy: sim.enemies[0]?.id ?? -1,
      }),
      () => ({ type: 'hunt', rect: randomRect(20), add: rng.chance(0.7) }),
      () => ({ type: 'tame', rect: randomRect(20), add: rng.chance(0.7) }),
      () => ({ type: 'capture', rect: randomRect(30), add: rng.chance(0.8) }),
      () => ({ type: 'release', captive: sim.captives[0]?.id ?? -1 }),
      () => ({ type: 'research', project: rng.chance(0.2) ? null : rng.pick(research) }),
      () => ({ type: 'festivals', on: rng.chance(0.7) }),
      () => ({ type: 'shipChoice', board: rng.chance(0.5) }),
      () => ({ type: 'sellArt', tile: nearHome(10) }),
    ];
    sim.apply(rng.pick(kinds)());
  }
}

// ---- Run them all ----

const started = performance.now();
const reports: Report[] = [];
for (let p = FROM; p < TO; p++) {
  if ((ONLY && PERSONAS[p % PERSONAS.length] !== ONLY) || (PLAYERS && !PLAYERS.includes(p))) {
    continue;
  }
  const r = play(p);
  reports.push(r);
  const issues = [...r.problems].map(([k, n]) => `${k} ×${n}`).join('; ');
  console.log(
    `#${String(p).padStart(3)} ${r.persona.padEnd(12)} ${r.difficulty.padEnd(8)} ${String(r.size).padStart(3)}  ` +
      `day ${String(r.day).padStart(2)}  alive ${r.alive}/${r.total}  idle ${((100 * r.idleHours) / Math.max(1, r.colonistHours)).toFixed(0)}%` +
      (r.crash ? `  CRASH: ${r.crash}` : '') +
      (issues ? `  ISSUES: ${issues}` : '') +
      (r.deaths.length > 0 ? `\n      deaths: ${r.deaths.join(', ')}` : ''),
  );
}
const crashed = reports.filter((r) => r.crash);
const all = new Map<string, number>();
for (const r of reports) {
  for (const [k] of r.problems) {
    all.set(k, (all.get(k) ?? 0) + 1);
  }
}
console.log(
  `\n${reports.length} players, ${DAYS} days each, in ${((performance.now() - started) / 1000).toFixed(0)}s: ` +
    `${crashed.length} crashed, ${reports.filter((r) => r.problems.size > 0).length} saw problems, ` +
    `${reports.filter((r) => r.alive === 0).length} colonies lost`,
);
for (const [k, n] of [...all].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n} player(s): ${k}`);
}
