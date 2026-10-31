// Headless balance harness: an "autoplayer" runs a sensible colony on many seeds and prints
// survival, combat, health, mood and social statistics.
//
//   npx tsx scripts/balance.ts [days=20] [seeds=8] [passive] [peaceful|harsh] [trace]
//
// "passive" never drafts during raids, to measure the worst case; "peaceful" and "harsh" pick the
// storyteller difficulty (standard otherwise); "trace" prints the colony whenever someone dies.
import { FEATURES, NONE, RECIPES, featureId, itemDef, terrainDef } from '../src/sim/defs';
import { painOf } from '../src/sim/health';
import { OBJECTIVES, Simulation, TICKS_PER_HOUR } from '../src/sim/simulation';
import { mutualOpinion } from '../src/sim/social';
import { Difficulty } from '../src/sim/storyteller';
import { GROW_ZONE, STOCKPILE_ZONE } from '../src/sim/world';

const days = Number(process.argv[2] ?? 20);
const seeds = Number(process.argv[3] ?? 8);
const passive = process.argv.includes('passive');
const trace = process.argv.includes('trace');
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
  frost: number;
  events: Record<string, number>;
}

function play(seed: number): Result {
  const sim = Simulation.newColony(seed, difficulty);
  const w = sim.world;
  const avoid = new Set<number>();
  const at = (x: number, y: number) => w.idx(x, y);
  const cx = w.xOf(sim.colonists[0].tile);
  const cy = w.yOf(sim.colonists[0].tile);

  // Day 1: chop and forage nearby, mine a little, a stockpile, and a 9x7 hut with a door, beds and a fire.
  sim.apply({ type: 'designate', rect: { x0: cx - 15, y0: cy - 15, x1: cx + 15, y1: cy + 15 }, kind: 'chop' });
  sim.apply({ type: 'designate', rect: { x0: cx - 20, y0: cy - 20, x1: cx + 20, y1: cy + 20 }, kind: 'forage' });
  sim.apply({ type: 'designate', rect: { x0: cx - 10, y0: cy - 10, x1: cx + 10, y1: cy + 10 }, kind: 'mine' });
  const hut = findSite(sim, 9, 7, avoid);
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
      tiles: [1, 2, 3, 4, 5].map((k) => at(hut.x + k, hut.y + 1)),
    });
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
  let extraBeds = 0;
  let friendDay = -1;
  let starvingHours = 0;
  const starvingByDay: Record<number, number> = {};
  let moodSum = 0;
  let moodSamples = 0;
  let minMood = 100;
  const hours = days * 24;

  for (let hour = 0; hour < hours; hour++) {
    for (let t = 0; t < TICKS_PER_HOUR; t += 20) {
      // Raid response, checked frequently like a player would.
      if (!passive && sim.enemies.some((e) => !e.fleeing)) {
        for (const c of sim.living()) {
          const fit = !c.health.downed && painOf(c) < 0.35;
          if (fit !== c.drafted) {
            sim.apply({ type: 'draft', colonist: c.id, drafted: fit });
          }
          const target = sim.enemies.find((e) => !e.fleeing);
          if (c.drafted && target && c.path.length === 0 && w.distance(c.tile, target.tile) > 6) {
            sim.apply({ type: 'move', colonist: c.id, tile: target.tile });
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
    // Hunt whatever wildlife is around once the colony is settled (leather becomes recurve bows).
    if (sim.day >= 3) {
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
    if (hut && sim.colonists.length > 5 + extraBeds && extraBeds < 2) {
      sim.apply({ type: 'build', feature: featureId('bed'), tiles: [at(hut.x + 6 + extraBeds, hut.y + 1)] });
      extraBeds++;
    }

    for (const c of sim.living()) {
      moodSum += c.mood;
      moodSamples++;
      minMood = Math.min(minMood, c.mood);
      if (c.needs.food <= 0) {
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
    frost: story.filter((s) => s.startsWith('Frost killed')).length,
    events,
  };
}

// Mental breaks aren't story entries, so count them via a wrapped logger.
const breakCounts = new WeakMap<Simulation, number>();
function countBreaks(sim: Simulation): number {
  return breakCounts.get(sim) ?? 0;
}
const originalAddLog = Simulation.prototype.addLog;
Simulation.prototype.addLog = function (this: Simulation, text, tone, story) {
  if (text.includes('in a daze')) {
    breakCounts.set(this, (breakCounts.get(this) ?? 0) + 1);
  }
  if (trace && text.includes('has died')) {
    console.log(`  --- trace day ${this.day} ${Math.floor(this.hour)}h: ${text}`);
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

const results: Result[] = [];
const started = performance.now();
for (let s = 1; s <= seeds; s++) {
  const r = play(s * 7919);
  results.push(r);
  console.log(
    `seed ${String(r.seed).padStart(6)}  alive ${r.living}/${r.total}  raids ${r.raids} (kills ${r.raidKills})  ` +
      `fever ${r.diseaseCases} (deaths ${r.diseaseDeaths})  breaks ${r.breaks}  mood avg ${r.avgMood.toFixed(0)} min ${r.minMood.toFixed(0)}  ` +
      `friends day ${r.friendDay}  rivals ${r.rivals} lovers ${r.lovers}  starving h ${r.starvingHours}  objectives ${r.objectives}/${OBJECTIVES.length}  research ${r.research}  frost ${r.frost}`,
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
  `\n${passive ? 'PASSIVE' : 'ACTIVE'} ${difficulty} ${days} days × ${seeds} seeds in ${((performance.now() - started) / 1000).toFixed(1)}s\n` +
    `  survivors ${sum((r) => r.living)}/${sum((r) => r.total)}, colonies wiped ${results.filter((r) => r.living === 0).length}\n` +
    `  raids ${sum((r) => r.raids)}, kills ${sum((r) => r.raidKills)}\n` +
    `  fever cases ${sum((r) => r.diseaseCases)}, fever deaths ${sum((r) => r.diseaseDeaths)}\n` +
    `  mental breaks ${sum((r) => r.breaks)}, mean mood ${(sum((r) => r.avgMood) / results.length).toFixed(1)}\n` +
    `  first friendship day (median) ${results.map((r) => r.friendDay).sort((a, b) => a - b)[Math.floor(results.length / 2)]}\n` +
    `  rivals ${sum((r) => r.rivals)}, couples ${sum((r) => r.lovers)}, starving colonist-hours ${sum((r) => r.starvingHours)}\n` +
    `  events ${JSON.stringify(Object.fromEntries(Object.keys(results[0].events).map((k) => [k, sum((r) => r.events[k])])))}`,
);
