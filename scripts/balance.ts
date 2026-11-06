// Headless balance harness: an "autoplayer" runs a sensible colony on many seeds and prints
// survival, combat, health, mood and social statistics.
//
//   npx tsx scripts/balance.ts [days=20] [seeds=8] [passive] [peaceful|harsh] [trace] [size=64] [seed=N] [start=K] [nohunt] [flow]
//
// "passive" never drafts during raids, to measure the worst case; "peaceful" and "harsh" pick the
// storyteller difficulty (standard otherwise); "trace" prints the colony whenever someone dies;
// "size=96" or "size=128" plays on a bigger map; "seed=N" replays one colony; "start=K" skips the
// first K seeds; "nohunt" leaves the wildlife alone. With DEBUG=1 in the environment, a trace also
// shows research, production, bills, rooms and heaters.
import { colonistTarget, lineOfSight } from '../src/sim/combat';
import {
  ANIMALS,
  FEATURES,
  NONE,
  RECIPES,
  featureDef,
  featureId,
  itemDef,
  itemId,
  terrainDef,
  weaponDef,
} from '../src/sim/defs';
import { painOf } from '../src/sim/health';
import { OBJECTIVES, Simulation, TICKS_PER_HOUR } from '../src/sim/simulation';
import { mutualOpinion } from '../src/sim/social';
import { Difficulty } from '../src/sim/storyteller';
import { GROW_ZONE, STOCKPILE_ZONE } from '../src/sim/world';

const days = Number(process.argv[2] ?? 20);
const seeds = Number(process.argv[3] ?? 8);
const passive = process.argv.includes('passive');
const trace = process.argv.includes('trace');
const noHunt = process.argv.includes('nohunt');
// "flow" prints a day-by-day table of food, materials and wildlife, averaged over the seeds.
const flow = process.argv.includes('flow');
// Nutrition a colonist eats in a day (as the top bar's "days of food" counts it).
const DAILY_NUTRITION = 1.4;
const mapSize = Number(process.argv.find((a) => a.startsWith('size='))?.slice(5) ?? 64);
const difficulty: Difficulty = process.argv.includes('harsh')
  ? 'harsh'
  : process.argv.includes('peaceful')
    ? 'peaceful'
    : 'standard';

const crop = (key: string) => GROW_ZONE + featureId(key);
const RESEARCH_ORDER = [
  'hearths',
  'cropRotation',
  'tailoring',
  'archery',
  'fieldMedicine',
  'insulation',
  'bedding',
  'fortifications',
  'electricity',
  'refrigeration',
  'solarPower',
  'sunLamps',
];

// Finds the nearest w×h rectangle to the colonists where every tile can take a blueprint.
function findSite(sim: Simulation, w: number, h: number, avoid: Set<number>): { x: number; y: number } | null {
  const world = sim.world;
  const cx = world.xOf(sim.colonists[0].tile);
  const cy = world.yOf(sim.colonists[0].tile);
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 1; y + h < world.height - 1; y++) {
    for (let x = 1; x + w < world.width - 1; x++) {
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
            terrainDef(world.terrain[i]).buildable &&
            terrainDef(world.terrain[i]).fertility > 0 &&
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

interface Result {
  seed: number;
  living: number;
  total: number;
  deaths: string[];
  raids: number;
  raidKills: number;
  diseaseCases: number;
  diseaseDeaths: number;
  breaks: number;
  avgMood: number;
  minMood: number;
  friendDay: number;
  rivals: number;
  lovers: number;
  starvingHours: number;
  starvingByDay: Record<number, number>;
  objectives: number;
  research: number;
  // Day Tailoring (and so parkas) arrived; -1 if never.
  tailoringDay: number;
  frost: number;
  events: Record<string, number>;
  // One row per day at dawn, for the "flow" report.
  daily: Record<string, number>[];
  // Summed mood from each thought over every colonist-hour, and how many colonist-hours were counted.
  moodBy: Record<string, number>;
  colonistHours: number;
  // Colonist-hours with the recreation need under 30%.
  joyLowHours: number;
  // Impressiveness of each enclosed room at the end, by role.
  rooms: { role: string; impressiveness: number }[];
}

// Every enclosed room on the map, once each.
function roomsAtEnd(sim: Simulation): { role: string; impressiveness: number }[] {
  const seen = new Map<number, { role: string; impressiveness: number }>();
  for (let i = 0; i < sim.world.size; i++) {
    const r = sim.roomAt(i);
    if (r && r.enclosed && !seen.has(r.id)) {
      seen.set(r.id, { role: r.role, impressiveness: r.impressiveness });
    }
  }
  return [...seen.values()];
}

// What the "flow" report tracks each dawn.
const FLOW_STOCKS = ['wood', 'stone', 'stoneBlocks', 'cloth', 'leather', 'herbalMedicine', 'silver'];
const FLOW_MADE = ['potatoes', 'berries', 'rawMeat', 'rawFish', 'meal', 'fineMeal', 'milk', 'egg', 'wood', 'stone'];
function snapshot(sim: Simulation): Record<string, number> {
  const totals = sim.resourceTotals();
  const nutrition = totals.reduce((sum, t) => sum + itemDef(t.item).nutrition * t.total, 0);
  const living = Math.max(1, sim.living().length);
  const row: Record<string, number> = {
    living: sim.living().length,
    foodDays: nutrition / (living * DAILY_NUTRITION),
    meals: sim.stockOf(itemId('meal')) + sim.stockOf(itemId('fineMeal')),
    crops: sim.countFeature((f) => !!featureDef(f).crop),
    wild: sim.animals.filter((a) => !a.tame).length,
    prey: sim.animals.filter((a) => !a.tame && !ANIMALS[a.kind].preys).length,
    predators: sim.animals.filter((a) => !a.tame && !!ANIMALS[a.kind].preys).length,
    tame: sim.animals.filter((a) => a.tame).length,
    trees: sim.countFeature((f) => featureDef(f).key === 'tree'),
    hunger: sim.living().filter((c) => c.needs.food < 0.25).length,
  };
  for (const key of FLOW_STOCKS) {
    row[key] = sim.stockOf(itemId(key));
  }
  for (const key of FLOW_MADE) {
    row[`+${key}`] = sim.stats.produced[key] ?? 0;
  }
  return row;
}

function play(seed: number): Result {
  const sim = Simulation.newColony(seed, difficulty, mapSize);
  const w = sim.world;
  const avoid = new Set<number>();
  const at = (x: number, y: number) => w.idx(x, y);
  const cx = w.xOf(sim.colonists[0].tile);
  const cy = w.yOf(sim.colonists[0].tile);

  // Like a sensible player, make the best researcher research first, so tailoring (parkas) and
  // hearths arrive well before winter.
  const researcher = [...sim.colonists].sort((a, b) => b.skills.research - a.skills.research)[0];
  sim.apply({ type: 'priority', colonist: researcher.id, work: 'research', value: 1 });

  // Day 1: chop and forage nearby, mine a little, a stockpile, and a 9x7 hut with a door, beds and a fire.
  sim.apply({ type: 'designate', rect: { x0: cx - 15, y0: cy - 15, x1: cx + 15, y1: cy + 15 }, kind: 'chop' });
  sim.apply({ type: 'designate', rect: { x0: cx - 20, y0: cy - 20, x1: cx + 20, y1: cy + 20 }, kind: 'forage' });
  sim.apply({ type: 'designate', rect: { x0: cx - 10, y0: cy - 10, x1: cx + 10, y1: cy + 10 }, kind: 'mine' });
  const hut = findSite(sim, 9, 7, avoid);
  // Up to twelve beds in two rows, clear of the door, fire and armchair.
  const bedSlots = [...[1, 2, 3, 4, 5, 6, 7].map((k) => [k, 1]), ...[1, 2, 3, 4, 5].map((k) => [k, 2])];
  let bedsBuilt = 0;
  if (hut) {
    claim(avoid, sim, hut.x, hut.y, 9, 7);
    const walls: number[] = [];
    for (let y = hut.y; y < hut.y + 7; y++) {
      for (let x = hut.x; x < hut.x + 9; x++) {
        if (x === hut.x || y === hut.y || x === hut.x + 8 || y === hut.y + 6) {
          walls.push(at(x, y));
        }
      }
    }
    sim.apply({ type: 'build', feature: featureId('woodWall'), tiles: walls });
    sim.apply({ type: 'build', feature: featureId('door'), tiles: [at(hut.x + 4, hut.y + 6)] });
    sim.apply({
      type: 'build',
      feature: featureId('bed'),
      tiles: bedSlots.slice(0, sim.colonists.length).map(([bx, by]) => at(hut.x + bx, hut.y + by)),
    });
    bedsBuilt = sim.colonists.length;
    sim.apply({ type: 'build', feature: featureId('campfire'), tiles: [at(hut.x + 7, hut.y + 3)] });
  }
  const stock = findSite(sim, 5, 3, avoid);
  if (stock) {
    claim(avoid, sim, stock.x, stock.y, 5, 3);
    sim.apply({
      type: 'zone',
      rect: { x0: stock.x, y0: stock.y, x1: stock.x + 4, y1: stock.y + 2 },
      zone: STOCKPILE_ZONE,
    });
  }

  let builtDay2 = false;
  let secondFarm = false;
  let hearthPlaced = false;
  let fishingPlaced = false;
  let chopRadius = 15;
  let friendDay = -1;
  let starvingHours = 0;
  const starvingByDay: Record<number, number> = {};
  let moodSum = 0;
  let moodSamples = 0;
  let minMood = 100;
  const hours = days * 24;
  const daily: Record<string, number>[] = [];
  const moodBy: Record<string, number> = {};
  let colonistHours = 0;
  let joyLowHours = 0;

  for (let hour = 0; hour < hours; hour++) {
    for (let t = 0; t < TICKS_PER_HOUR; t += 20) {
      // Raid response, checked frequently like a player would: draft once the raiders close in
      // (on a big map they can take hours to walk in from the edge).
      // Maddened animals get the same answer as raiders.
      const manhunters = sim.animals.some((a) => a.manhunter && a.hp > 0 && a.revengeOn >= 0);
      if (!passive && ((sim.enemies.some((e) => !e.fleeing) && sim.raid?.arrivedTick !== undefined) || manhunters)) {
        for (const c of sim.living()) {
          const fit = !c.health.downed && painOf(c) < 0.35;
          if (fit !== c.drafted) {
            sim.apply({ type: 'draft', colonist: c.id, drafted: fit });
          }
          // Advance on the raiders only as far as the first spot in bow range with a clear shot
          // (drafted colonists walking to a spot don't stop to shoot on the way).
          const target = sim.enemies.find((e) => !e.fleeing);
          const reach = weaponDef(c.weapon).range - 1;
          if (c.drafted && target && c.path.length === 0 && !colonistTarget(sim, c)) {
            const route = sim.pathfinder.find(c.tile, [target.tile]) ?? [];
            const spot = route.find((i) => w.distance(i, target.tile) <= reach && lineOfSight(w, i, target.tile));
            if (spot !== undefined) {
              sim.apply({ type: 'move', colonist: c.id, tile: spot });
            }
          }
        }
      }
      for (let i = 0; i < 20; i++) {
        sim.step();
      }
    }

    // Day 2 onwards: farming, kitchen, workshop and recreation.
    if (!builtDay2 && sim.day >= 2) {
      builtDay2 = true;
      const farm = findSite(sim, 7, 5, avoid);
      if (farm) {
        claim(avoid, sim, farm.x, farm.y, 7, 5);
        sim.apply({
          type: 'zone',
          rect: { x0: farm.x, y0: farm.y, x1: farm.x + 6, y1: farm.y + 4 },
          zone: crop('potatoPlant'),
        });
      }
      const herbs = findSite(sim, 4, 3, avoid);
      if (herbs) {
        claim(avoid, sim, herbs.x, herbs.y, 4, 3);
        sim.apply({
          type: 'zone',
          rect: { x0: herbs.x, y0: herbs.y, x1: herbs.x + 3, y1: herbs.y + 2 },
          zone: crop('healrootPlant'),
        });
      }
      const cotton = findSite(sim, 4, 3, avoid);
      if (cotton) {
        claim(avoid, sim, cotton.x, cotton.y, 4, 3);
        sim.apply({
          type: 'zone',
          rect: { x0: cotton.x, y0: cotton.y, x1: cotton.x + 3, y1: cotton.y + 2 },
          zone: crop('cottonPlant'),
        });
      }
      const kitchen = findSite(sim, 7, 1, avoid);
      if (kitchen) {
        claim(avoid, sim, kitchen.x, kitchen.y, 7, 1);
        sim.apply({ type: 'build', feature: featureId('stove'), tiles: [at(kitchen.x, kitchen.y)] });
        sim.apply({ type: 'build', feature: featureId('table'), tiles: [at(kitchen.x + 2, kitchen.y)] });
        sim.apply({ type: 'build', feature: featureId('craftingBench'), tiles: [at(kitchen.x + 4, kitchen.y)] });
        sim.apply({ type: 'build', feature: featureId('horseshoePin'), tiles: [at(kitchen.x + 6, kitchen.y)] });
      }
      if (hut) {
        sim.apply({ type: 'build', feature: featureId('armchair'), tiles: [at(hut.x + 1, hut.y + 5)] });
      }
      const lab = findSite(sim, 1, 1, avoid);
      if (lab) {
        claim(avoid, sim, lab.x, lab.y, 1, 1);
        sim.apply({ type: 'build', feature: featureId('researchBench'), tiles: [at(lab.x, lab.y)] });
      }
    }
    // Keep research going, in a sensible order, and use what it unlocks.
    if (!sim.research.current) {
      const next = RESEARCH_ORDER.find((key) => !sim.research.done.includes(key));
      if (next) {
        sim.apply({ type: 'research', project: next });
      }
    }
    if (hut && !hearthPlaced && sim.isResearched('hearths')) {
      hearthPlaced = true;
      sim.apply({ type: 'build', feature: featureId('hearth'), tiles: [at(hut.x + 7, hut.y + 4)] });
    }
    // A parka for everyone before winter.
    const parka = RECIPES.find((r) => r.key === 'tailorParka')!;
    if (sim.bills[parka.id].target !== sim.living().length) {
      sim.apply({ type: 'bill', recipe: parka.id, target: sim.living().length });
    }
    // Running short of wood: chop further out, like a player would on a map with few trees nearby.
    if (Math.floor(sim.hour) === 6 && sim.stockOf(itemId('wood')) < 40 && chopRadius < w.width) {
      chopRadius += 8;
      sim.apply({
        type: 'designate',
        rect: { x0: cx - chopRadius, y0: cy - chopRadius, x1: cx + chopRadius, y1: cy + chopRadius },
        kind: 'chop',
      });
    }
    // Out of wood: someone other than the researcher chops first until there's a stock again.
    const lumberjack = sim.living().find((c) => c.id !== researcher.id && !c.health.downed);
    if (lumberjack) {
      const wood = sim.stockOf(itemId('wood'));
      const want = wood < 20 ? 1 : wood > 80 ? 3 : lumberjack.priorities.plantCutting;
      if (want !== lumberjack.priorities.plantCutting) {
        sim.apply({ type: 'priority', colonist: lumberjack.id, work: 'plantCutting', value: want });
      }
    }
    // Hunt whatever wildlife is around once the colony is settled (leather becomes recurve bows).
    if (sim.day >= 3 && !noHunt) {
      sim.apply({ type: 'hunt', rect: { x0: 0, y0: 0, x1: w.width - 1, y1: w.height - 1 }, add: true });
    }
    // A couple of fishing spots on the nearest shore, for food through the winter.
    if (!fishingPlaced && sim.day >= 4) {
      fishingPlaced = true;
      const start = sim.colonists[0].tile;
      const spots = sim.nearest(start, (i) => sim.canPlaceBlueprint(i, featureId('fishingSpot')), 2);
      sim.apply({ type: 'build', feature: featureId('fishingSpot'), tiles: spots });
    }
    // A second field early enough to stock up for winter, as a player would.
    if (!secondFarm && (sim.living().length >= 7 || sim.day >= 5)) {
      secondFarm = true;
      const field = findSite(sim, 7, 5, avoid);
      if (field) {
        claim(avoid, sim, field.x, field.y, 7, 5);
        sim.apply({
          type: 'zone',
          rect: { x0: field.x, y0: field.y, x1: field.x + 6, y1: field.y + 4 },
          zone: crop('potatoPlant'),
        });
      }
    }
    // A bed for every newcomer, while there's room in the hut.
    if (hut && sim.colonists.length > bedsBuilt && bedsBuilt < bedSlots.length) {
      const [bx, by] = bedSlots[bedsBuilt];
      sim.apply({ type: 'build', feature: featureId('bed'), tiles: [at(hut.x + bx, hut.y + by)] });
      bedsBuilt++;
    }

    if (flow && Math.floor(sim.hour) === 6) {
      daily.push(snapshot(sim));
    }
    for (const c of sim.living()) {
      colonistHours++;
      if (c.needs.joy < 0.3) {
        joyLowHours++;
      }
      for (const t of sim.thoughtsOf(c)) {
        moodBy[t.label] = (moodBy[t.label] ?? 0) + t.mood;
      }
      moodSum += c.mood;
      moodSamples++;
      minMood = Math.min(minMood, c.mood);
      if (c.needs.food <= 0) {
        // What starving colonists are busy with instead of eating.
        const doing = `${c.job?.type ?? 'idle'}${c.health.downed ? ' (downed)' : ''}${sim.inMentalBreak(c) ? ' (break)' : ''}`;
        starvingDoing[doing] = (starvingDoing[doing] ?? 0) + 1;
        starvingHours++;
        starvingByDay[sim.day] = (starvingByDay[sim.day] ?? 0) + 1;
      }
    }
    if (friendDay < 0) {
      const l = sim.living();
      if (l.some((a) => l.some((b) => a !== b && mutualOpinion(a, b) >= 30))) {
        friendDay = sim.day;
      }
    }
    if (sim.living().length === 0) {
      break;
    }
  }

  const story = sim.storyLog.map((s) => s.text);
  const count = (re: RegExp) => story.filter((s) => re.test(s)).length;
  const events: Record<string, number> = {
    raid: count(/^Raid!/),
    disease: count(/came down with/),
    wanderer: count(/asked to join/),
    coldSnap: count(/cold snap/),
    supplies: count(/gift of supplies/),
    blight: count(/Blight/),
    caravan: count(/^Traders from .* have arrived/),
    heatWave: count(/heat wave has settled/),
    eclipse: count(/^An eclipse/),
    manhunters: count(/maddened .* is charging/),
    meteorite: count(/^A meteorite/),
    refugee: count(/wounded and fleeing raiders/),
    aurora: count(/^An aurora/),
    inspiration: count(/is inspired/),
    bumperCrop: count(/^Perfect growing weather/),
    lightning: count(/^Lightning struck/),
    burned: burnCounts.get(sim) ?? 0,
  };
  return {
    seed,
    living: sim.living().length,
    total: sim.colonists.length,
    deaths: sim.storyLog.filter((s) => s.text.includes('has died')).map((s) => `day ${s.day} ${s.hour}h: ${s.text}`),
    raids: events.raid,
    raidKills: sim.stats.kills,
    diseaseCases: story
      .filter((s) => s.includes('came down with'))
      .reduce((n, s) => n + (s.includes(' and ') ? 2 : 1), 0),
    diseaseDeaths: count(/died of marsh fever/),
    breaks: sim.log.length >= 0 ? countBreaks(sim) : 0,
    avgMood: moodSum / Math.max(1, moodSamples),
    minMood,
    friendDay,
    rivals: count(/become rivals/),
    lovers: count(/fallen in love/),
    starvingHours,
    starvingByDay,
    objectives: Object.values(sim.objectivesDone).filter(Boolean).length,
    research: sim.research.done.length,
    tailoringDay: tailoringDays.get(sim) ?? -1,
    frost: story.filter((s) => s.startsWith('Frost killed')).length,
    events,
    daily,
    moodBy,
    colonistHours,
    joyLowHours,
    rooms: roomsAtEnd(sim),
  };
}

// Mental breaks aren't story entries, so count them via a wrapped logger.
const breakCounts = new WeakMap<Simulation, number>();
// The day Tailoring arrives (the story log is capped, so early entries may be gone by the end).
const tailoringDays = new WeakMap<Simulation, number>();
// Buildings and plants lost to fire aren't story entries either.
const burnCounts = new WeakMap<Simulation, number>();
function countBreaks(sim: Simulation): number {
  return breakCounts.get(sim) ?? 0;
}
const originalAddLog = Simulation.prototype.addLog;
Simulation.prototype.addLog = function (this: Simulation, text, tone, story) {
  if (text.includes('in a daze')) {
    breakCounts.set(this, (breakCounts.get(this) ?? 0) + 1);
  }
  if (text.startsWith('Research complete: Tailoring')) {
    tailoringDays.set(this, this.day);
  }
  if (text.startsWith('Fire destroyed')) {
    burnCounts.set(this, (burnCounts.get(this) ?? 0) + 1);
  }
  if (trace && text.includes('has died')) {
    console.log(`  --- trace day ${this.day} ${Math.floor(this.hour)}h: ${text}`);
    const count = (key: string) => this.stockOf(itemId(key));
    console.log(
      `      outdoors ${this.outdoorTemperature().toFixed(0)}°C, parkas ${count('parka')} spare, leather ${count('leather')}, ` +
        `wood ${count('wood')}, food ${count('meal') + count('potatoes') + count('rawMeat') + count('rawFish') + count('berries')}`,
    );
    if (process.env.DEBUG) {
      console.log('      research', this.research.done.join(','), 'produced', JSON.stringify(this.stats.produced));
      console.log(
        '      ',
        this.storyLog
          .filter((e) => /Research complete|Winter/.test(e.text))
          .map((e) => `d${e.day}: ${e.text.slice(0, 40)}`)
          .join(' | '),
      );
      const rooms = new Map<number, string>();
      for (const c of this.living()) {
        const r = this.roomAt(c.tile);
        if (r) {
          rooms.set(
            r.id,
            `${r.role} size ${r.size} beds ${r.beds} heaters ${r.heaters} ${r.temperature.toFixed(0)}°C enclosed ${r.enclosed}`,
          );
        }
      }
      console.log('      rooms', [...rooms.values()].join(' | '));
      console.log(
        '      heaters',
        this.countFeature((f) => FEATURES[f - 1]?.heater > 0),
        'beds',
        this.countFeature((f) => !!FEATURES[f - 1]?.bed),
      );
      console.log('      bills', JSON.stringify(this.bills.map((b) => [RECIPES[b.recipe].key, b.target])));
      console.log(
        '      jobs',
        this.colonists
          .map((c) => `${c.name}:${c.job?.type ?? '-'}:${c.priorities.crafting}:${c.skills.crafting}`)
          .join(' '),
      );
    }
    for (const entry of this.log.slice(-14)) {
      console.log(`      ${entry.text}`);
    }
    for (const c of this.colonists) {
      console.log(
        `      ${c.name}: ${this.describe(c)} | injuries ${c.health.injuries.map((i) => `${i.severity.toFixed(2)}${i.tended ? 't' : ''}`).join(',')} ` +
          `blood ${c.health.bloodLoss.toFixed(2)} doctor prio ${c.priorities.doctor} drafted ${c.drafted} ` +
          `cold ${c.health.hypothermia.toFixed(2)} at ${this.temperatureAt(c.tile).toFixed(0)}°C ` +
          `wearing ${c.apparel ? itemDef(c.apparel.item).key : 'nothing'} indoors ${this.isIndoors(c.tile)}`,
      );
    }
  }
  originalAddLog.call(this, text, tone, story);
};

const starvingDoing: Record<string, number> = {};
const results: Result[] = [];
const started = performance.now();
// "seed=47514" replays just that colony.
const onlySeed = Number(process.argv.find((a) => a.startsWith('seed='))?.slice(5) ?? 0);
// "start=25" skips the first 25 seeds, so a long batch can be split across processes.
const startAt = Number(process.argv.find((a) => a.startsWith('start='))?.slice(6) ?? 0);
const seedList = onlySeed ? [onlySeed] : Array.from({ length: seeds }, (_, s) => (startAt + s + 1) * 7919);
for (const seed of seedList) {
  const r = play(seed);
  results.push(r);
  console.log(
    `seed ${String(r.seed).padStart(6)}  alive ${r.living}/${r.total}  raids ${r.raids} (kills ${r.raidKills})  ` +
      `fever ${r.diseaseCases} (deaths ${r.diseaseDeaths})  breaks ${r.breaks}  mood avg ${r.avgMood.toFixed(0)} min ${r.minMood.toFixed(0)}  ` +
      `friends day ${r.friendDay}  rivals ${r.rivals} lovers ${r.lovers}  starving h ${r.starvingHours}  objectives ${r.objectives}/${OBJECTIVES.length}  research ${r.research} (tailoring day ${r.tailoringDay})  frost ${r.frost}`,
  );
  for (const d of r.deaths) {
    console.log(`    ${d}`);
  }
  if (r.starvingHours > 0) {
    console.log(`    starving colonist-hours by day: ${JSON.stringify(r.starvingByDay)}`);
  }
}
const sum = (f: (r: Result) => number) => results.reduce((n, r) => n + f(r), 0);
console.log(
  `\n${passive ? 'PASSIVE' : 'ACTIVE'} ${difficulty} ${mapSize}×${mapSize} ${days} days × ${seeds} seeds in ${((performance.now() - started) / 1000).toFixed(1)}s\n` +
    `  survivors ${sum((r) => r.living)}/${sum((r) => r.total)}, colonies wiped ${results.filter((r) => r.living === 0).length}\n` +
    `  raids ${sum((r) => r.raids)}, kills ${sum((r) => r.raidKills)}\n` +
    `  fever cases ${sum((r) => r.diseaseCases)}, fever deaths ${sum((r) => r.diseaseDeaths)}\n` +
    `  mental breaks ${sum((r) => r.breaks)}, mean mood ${(sum((r) => r.avgMood) / results.length).toFixed(1)}\n` +
    `  first friendship day (median) ${results.map((r) => r.friendDay).sort((a, b) => a - b)[Math.floor(results.length / 2)]}\n` +
    `  rivals ${sum((r) => r.rivals)}, couples ${sum((r) => r.lovers)}, starving colonist-hours ${sum((r) => r.starvingHours)}\n` +
    `  events ${JSON.stringify(Object.fromEntries(Object.keys(results[0].events).map((k) => [k, sum((r) => r.events[k])])))}`,
);

// Where mood comes from: the average contribution of each thought per colonist, biggest first.
const allHours = sum((r) => r.colonistHours);
const moodTotals: Record<string, number> = {};
for (const r of results) {
  for (const [label, total] of Object.entries(r.moodBy)) {
    moodTotals[label] = (moodTotals[label] ?? 0) + total;
  }
}
const moodRanked = Object.entries(moodTotals)
  .map(([label, total]) => [label, total / Math.max(1, allHours)] as const)
  .filter(([, avg]) => Math.abs(avg) >= 0.2)
  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
console.log(
  `  mood by thought (average per colonist): ${moodRanked.map(([label, avg]) => `${label} ${avg > 0 ? '+' : ''}${avg.toFixed(1)}`).join(', ')}`,
);
console.log(
  `  recreation under 30%: ${((100 * sum((r) => r.joyLowHours)) / Math.max(1, allHours)).toFixed(1)}% of colonist-hours`,
);
const byRole = new Map<string, number[]>();
for (const r of results) {
  for (const room of r.rooms) {
    byRole.set(room.role, [...(byRole.get(room.role) ?? []), room.impressiveness]);
  }
}
console.log(
  `  rooms at the end (average impressiveness): ${[...byRole]
    .map(
      ([role, values]) =>
        `${role} ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(0)} (${values.length})`,
    )
    .join(', ')}`,
);
if (Object.keys(starvingDoing).length > 0) {
  const sorted = Object.entries(starvingDoing).sort((a, b) => b[1] - a[1]);
  console.log(`  starving colonists were busy with: ${sorted.map(([k, n]) => `${k} ${n}`).join(', ')}`);
}

// Day-by-day averages over the seeds: stocks at dawn, and what was gathered or made since the
// previous dawn (columns starting "+").
if (flow) {
  const length = Math.max(...results.map((r) => r.daily.length));
  const keys = Object.keys(results.find((r) => r.daily.length > 0)?.daily[0] ?? {});
  const width = (k: string) => Math.max(6, k.length + 1);
  console.log('\nday ' + keys.map((k) => k.padStart(width(k))).join(''));
  for (let d = 0; d < length; d++) {
    const rows = results.filter((r) => r.daily[d]);
    const cells = keys.map((k) => {
      const avg =
        rows.reduce((n, r) => n + (k.startsWith('+') ? r.daily[d][k] - (r.daily[d - 1]?.[k] ?? 0) : r.daily[d][k]), 0) /
        rows.length;
      return (Math.abs(avg) < 10 && !Number.isInteger(avg) ? avg.toFixed(1) : Math.round(avg).toString()).padStart(
        width(k),
      );
    });
    console.log(String(d + 1).padStart(3) + ' ' + cells.join(''));
  }
}
