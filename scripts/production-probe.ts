// The production probe for production.ts: watches the colonies the balance harness plays, and counts where
// the colonists' hours go, how crafting and cooking jobs go (gathering, walking, working; finished or dropped),
// what's eaten (and whether a cooked meal was there to be had instead of raw food), what spoils, and how the
// fields spend their hours (waiting to be sown, growing, ripe and waiting). Imported before balance.ts; the
// totals are printed when it's done.
import { RECIPES, itemDef } from '../src/sim/defs';
import { Simulation, TICKS_PER_HOUR } from '../src/sim/simulation';
import { GROW_ZONE } from '../src/sim/world';

type Sim = Simulation & Record<string, unknown>;
interface JobLike {
  type: string;
  stage: number;
  progress: number;
  line: number;
  target: number;
  item: number;
  source: number;
}
interface ColonistLike {
  id: number;
  tile: number;
  job: JobLike | null;
  carrying: { item: number; count: number } | null;
  health: { dead: boolean };
  away?: unknown;
}

const jobTicks = new Map<string, number>();
let colonistTicks = 0;
interface CraftTally {
  started: number;
  done: number;
  dropped: number;
  gather: number;
  units: number;
  walk: number;
  work: number;
}
const crafts = new Map<string, CraftTally>();
const tally = (key: string) => {
  let t = crafts.get(key);
  if (!t) {
    t = { started: 0, done: 0, dropped: 0, gather: 0, walk: 0, work: 0, units: 0 };
    crafts.set(key, t);
  }
  return t;
};
const eaten = new Map<string, number>();
let rawWithMeal = 0;
let rawWithMealNear = 0;
let rawEats = 0;
const rawGapSum = { n: 0, sum: 0 };
let rotted = 0;
let poisoned = 0;
const cropLosses = new Map<string, number>();
const blockedWhy = new Map<string, number>();
const fieldHours = { waitSow: 0, offSeason: 0, growing: 0, ripe: 0, blocked: 0 };
const billHours = new Map<string, { wanted: number; noBench: number; noIngredients: number }>();
let hours = 0;
let colonyDays = 0;
let mealStock = 0;

const original = {
  stepEat: (Simulation.prototype as unknown as Record<string, (...a: unknown[]) => unknown>).stepEat,
  tryEat: (Simulation.prototype as unknown as Record<string, (...a: unknown[]) => unknown>).tryEat,
  step: Simulation.prototype.step,
  addLog: Simulation.prototype.addLog,
};
const proto = Simulation.prototype as unknown as Record<string, unknown>;

// Each job's life, from being handed out to its end: ticks in all, ticks with its work moving on, and whether it
// was finished. (A colonist walking a path isn't stepped through the job, so the walking is what's left over.)
interface Life {
  key: string;
  start: number;
  work: number;
  lastProgress: number;
  done: boolean;
}
const lives = new WeakMap<object, Life>();
const lastJob = new Map<number, JobLike | null>();
const keyOf = (job: JobLike) =>
  job.type === 'craft' ? RECIPES[job.line].key : ['sow', 'harvestCrop', 'eat'].includes(job.type) ? job.type : null;

const assign = proto.assign as (this: Sim, c: ColonistLike, job: JobLike, path: number[]) => void;
proto.assign = function (this: Sim, c: ColonistLike, job: JobLike, path: number[]) {
  const key = keyOf(job);
  if (key && !lives.has(job)) {
    lives.set(job, { key, start: this.tick, work: 0, lastProgress: job.progress ?? 0, done: false });
    tally(key).started++;
  }
  return assign.call(this, c, job, path);
};
const completeWork = proto.completeWork as (this: Sim, c: ColonistLike, job: JobLike) => void;
proto.completeWork = function (this: Sim, c: ColonistLike, job: JobLike) {
  const life = lives.get(job);
  if (life) {
    life.done = true;
  }
  return completeWork.call(this, c, job);
};

// Frost in the fields: of the crops it kills, how many were ripe, waiting to be picked.
const frostKills = { all: 0, ripe: 0 };
const growCrops = proto.growCrops as (this: Sim) => void;
proto.growCrops = function (this: Sim) {
  const w = this.world;
  const crops = (this as unknown as { buildingTiles(): number[] })
    .buildingTiles()
    .filter((i) => w.feature[i] !== 0 && w.growth !== undefined)
    .map((i) => ({ i, f: w.feature[i], ripe: w.growth[i] >= 1 }));
  const result = growCrops.call(this);
  for (const c of crops) {
    if (w.feature[c.i] === 0 && c.f !== 0) {
      frostKills.all++;
      frostKills.ripe += c.ripe ? 1 : 0;
    }
  }
  return result;
};

function followJobs(sim: Sim): void {
  for (const c of sim.colonists as unknown as ColonistLike[]) {
    const prev = lastJob.get(c.id) ?? null;
    const job = c.job;
    if (prev && prev !== job) {
      const life = lives.get(prev);
      if (life) {
        const done =
          life.done ||
          (prev.type === 'craft' && prev.progress >= RECIPES[prev.line].work) ||
          (prev.type === 'eat' && prev.stage === 2 && prev.progress >= 60);
        const t = tally(life.key);
        if (prev.type === 'craft') {
          // Each of a batch made counts, the last one (under way when the job ended) only if finished.
          t.units += ((prev as unknown as { made?: number }).made ?? 0) + (done ? 1 : 0);
        }
        if (done) {
          t.done++;
          t.work += life.work;
          t.walk += sim.tick - life.start - life.work;
        } else {
          t.dropped++;
        }
      }
    }
    if (job) {
      const life = lives.get(job);
      if (life && job.progress !== life.lastProgress) {
        // (Going down is the next of a batch begun: work too.)
        life.work++;
        life.lastProgress = job.progress;
      }
    }
    lastJob.set(c.id, job);
  }
}

const mealsIn = (sim: Sim, region: number) => {
  const w = sim.world;
  return w
    .tilesWithItems((item) => itemDef(item).category === 'meal')
    .filter((i) => (sim as unknown as { regions: { region: Int32Array } }).regions.region[i] === region);
};

proto.tryEat = function (this: Sim, c: ColonistLike) {
  const result = original.tryEat.call(this, c);
  if (result && c.job?.type === 'eat') {
    const item = c.job.item;
    if (itemDef(item).category !== 'meal') {
      rawEats++;
      const region = (this as unknown as { regionOf(i: number): number }).regionOf(c.tile);
      const meals = mealsIn(this, region);
      if (meals.length > 0) {
        rawWithMeal++;
        const w = this.world;
        const nearestMeal = Math.min(...meals.map((i) => w.distance(i, c.tile)));
        const raw = w.distance(c.job.source, c.tile);
        rawGapSum.n++;
        rawGapSum.sum += nearestMeal - raw;
        if (nearestMeal <= 30) {
          rawWithMealNear++;
        }
      }
    }
  }
  return result;
};

proto.stepEat = function (this: Sim, c: ColonistLike, job: JobLike) {
  const held = c.carrying;
  const result = original.stepEat.call(this, c, job);
  if (held && job.stage === 2 && c.carrying === null) {
    const def = itemDef(held.item);
    const kind = def.category === 'meal' ? def.key : `raw (${def.foodKind ?? '?'})`;
    eaten.set(kind, (eaten.get(kind) ?? 0) + 1);
  }
  return result;
};

Simulation.prototype.addLog = function (this: Simulation, text: string, ...rest: unknown[]) {
  const m = /^(\d+) food rotted/.exec(text);
  if (m) {
    rotted += Number(m[1]);
  }
  if (text.includes('has food poisoning')) {
    poisoned++;
  }
  const frost = /^Frost killed (\d+) crops/.exec(text);
  if (frost) {
    cropLosses.set('frost', (cropLosses.get('frost') ?? 0) + Number(frost[1]));
  }
  const blight = /^Blight has struck a field\. (\d+) plants/.exec(text);
  if (blight) {
    cropLosses.set('blight', (cropLosses.get('blight') ?? 0) + Number(blight[1]));
  }
  const trampled = /is trampling the/.exec(text);
  if (trampled) {
    cropLosses.set('trampled (events)', (cropLosses.get('trampled (events)') ?? 0) + 1);
  }
  return (original.addLog as (this: Simulation, ...a: unknown[]) => void).call(this, text, ...rest);
};

function hourly(sim: Sim): void {
  hours++;
  if (sim.tick % (TICKS_PER_HOUR * 24) === 0) {
    colonyDays++;
  }
  const w = sim.world;
  for (let i = 0; i < w.size; i++) {
    if (w.zone[i] < GROW_ZONE) {
      continue;
    }
    const f = w.feature[i];
    if (f === 0) {
      const why = sim.whyNotSow(i);
      if (why === null) {
        fieldHours.waitSow++;
      } else if (/winter|frost|cold|late/i.test(why)) {
        fieldHours.offSeason++;
      } else {
        fieldHours.blocked++;
        const r = why.replace(/\d+/g, '#').slice(0, 90);
        blockedWhy.set(r, (blockedWhy.get(r) ?? 0) + 1);
      }
    } else if (w.growth[i] >= 1) {
      fieldHours.ripe++;
    } else {
      fieldHours.growing++;
    }
  }
  const totals = sim.resourceTotals();
  mealStock += totals.filter((t) => itemDef(t.item).category === 'meal').reduce((s, t) => s + t.total, 0);
  for (const bill of sim.bills) {
    const recipe = RECIPES[bill.recipe];
    if (recipe.mend || bill.target <= 0 || !sim.isResearched(recipe.research)) {
      continue;
    }
    if (totals[recipe.product.item - 1].total >= bill.target) {
      continue;
    }
    const b = billHours.get(recipe.key) ?? { wanted: 0, noBench: 0, noIngredients: 0 };
    b.wanted++;
    billHours.set(recipe.key, b);
  }
}

Simulation.prototype.step = function (this: Simulation, ...args: unknown[]) {
  const result = (original.step as (this: Simulation, ...a: unknown[]) => unknown).apply(this, args);
  for (const c of this.colonists as unknown as ColonistLike[]) {
    if (c.health.dead || c.away) {
      continue;
    }
    colonistTicks++;
    let key = c.job?.type ?? 'none';
    if (key === 'craft') {
      key = `craft:${RECIPES[c.job!.line].bench}`;
    }
    jobTicks.set(key, (jobTicks.get(key) ?? 0) + 1);
  }
  followJobs(this as Sim);
  if (this.tick % TICKS_PER_HOUR === 0) {
    hourly(this as Sim);
  }
  return result;
};

process.on('exit', () => {
  const pct = (n: number, of: number) => `${((100 * n) / Math.max(1, of)).toFixed(1)}%`;
  console.log(`\nPRODUCTION over ${colonyDays} colony-days`);
  console.log('  colonist time by job:');
  console.log(
    '   ' +
      [...jobTicks]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${pct(n, colonistTicks)}`)
        .join(', '),
  );
  console.log(
    '  jobs: kind | started | done | dropped | made | ticks per one made (or per job done): other (walking, gathering) / work (work share)',
  );
  for (const [key, t] of [...crafts].sort((a, b) => b[1].done - a[1].done)) {
    const per = (n: number) => (n / Math.max(1, t.units || t.done)).toFixed(0);
    console.log(
      `   ${key.padEnd(18)} ${String(t.started).padStart(6)} ${String(t.done).padStart(6)} ${String(t.dropped).padStart(6)} ${String(t.units).padStart(6)}   ${per(t.walk).padStart(5)} / ${per(t.work).padStart(4)} (${pct(t.work, t.walk + t.work)})`,
    );
  }
  const eats = [...eaten.values()].reduce((s, n) => s + n, 0);
  console.log(
    `  eaten: ${[...eaten]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${pct(n, eats)}`)
      .join(', ')}`,
  );
  console.log(
    `  raw food eaten with a meal in reach: ${rawWithMeal} of ${rawEats} (${pct(rawWithMeal, rawEats)}); within 30 tiles ${rawWithMealNear}; the meal on average ${(rawGapSum.sum / Math.max(1, rawGapSum.n)).toFixed(1)} tiles further than the raw food`,
  );
  console.log(
    `  meals in stock on average ${(mealStock / Math.max(1, hours)).toFixed(1)}; rotted ${rotted} (${(rotted / Math.max(1, colonyDays)).toFixed(1)} a colony-day); food poisoning ${poisoned} (${(poisoned / Math.max(1, colonyDays)).toFixed(2)} a colony-day)`,
  );
  const fh = Object.values(fieldHours).reduce((s, n) => s + n, 0);
  console.log(
    `  field tile-hours: ${Object.entries(fieldHours)
      .map(([k, n]) => `${k} ${pct(n, fh)}`)
      .join(', ')}`,
  );
  console.log(
    `  bare for other reasons: ${[...blockedWhy]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, n]) => `${k} ${pct(n, fh)}`)
      .join('; ')}`,
  );
  console.log(
    `  frost kills seen: ${frostKills.all}, of them ripe ${frostKills.ripe} (${pct(frostKills.ripe, frostKills.all)})`,
  );
  console.log(`  crops lost: ${[...cropLosses].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  console.log(
    `  bills short of their target (share of hours researched): ${[...billHours]
      .sort((a, b) => b[1].wanted - a[1].wanted)
      .map(([k, b]) => `${k} ${pct(b.wanted, hours)}`)
      .join(', ')}`,
  );
});
