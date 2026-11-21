// The gear probe for gear.ts: samples the colonists of the colonies the balance harness plays, every game hour, for
// the state of their clothes, tool kits and armour, and counts what falls apart, wears out and is mended.
import { Simulation, TICKS_PER_HOUR } from '../src/sim/simulation';
import { TATTERED } from '../src/sim/apparel';
import { featureId, itemId } from '../src/sim/defs';

const n = {
  samples: 0,
  naked: 0,
  tattered: 0,
  mendable: 0,
  toolWork: 0,
  toolless: 0,
  toollessKitsStored: 0,
  // Why, when there was no kit to take: no crafting bench yet; a bench but not the wood and stone for one; neither.
  toollessNoBench: 0,
  toollessNoStuff: 0,
  toollessNoStone: 0,
  toollessEarly: 0,
  holdingKit: 0,
  armored: 0,
};
const events = new Map<string, number>();
// Tool work, and of it without a kit, by 20-day stretch of the game.
const byStretch: { work: number; without: number; firstKit: number[] }[] = [];
const firstKit: number[] = [];
const seenKit = new WeakSet<Simulation>();
let days = 0;
const TOOL_JOBS = new Set(['mine', 'chop', 'forage', 'construct', 'deconstruct', 'sow', 'harvestCrop']);

const addLog = Simulation.prototype.addLog;
Simulation.prototype.addLog = function (this: Simulation, text: string, ...rest: unknown[]) {
  for (const [key, re] of [
    ['clothes fell apart', /fell apart\.$/],
    ['tool kit worn out', /tool kit has worn out/],
    ['armour fell apart', /has fallen apart\.$/],
    ['mended', /mended a /],
  ] as const) {
    if (re.test(text)) {
      events.set(key, (events.get(key) ?? 0) + 1);
      wornHere += key === 'tool kit worn out' ? 1 : 0;
    }
  }
  return (addLog as (this: Simulation, ...a: unknown[]) => void).call(this, text, ...rest);
};

const step = Simulation.prototype.step;
Simulation.prototype.step = function (this: Simulation, ...args: unknown[]) {
  const result = (step as (this: Simulation, ...a: unknown[]) => unknown).apply(this, args);
  if (this.tick % TICKS_PER_HOUR === 0) {
    if (!seenKit.has(this) && (this.stats.produced.toolKit ?? 0) > 0) {
      seenKit.add(this);
      firstKit.push(this.day);
    }
    if (this.tick % (TICKS_PER_HOUR * 24) === 0) {
      days++;
    }
    for (const c of this.living()) {
      if (c.age < 13) {
        continue;
      }
      n.samples++;
      n.naked += c.apparel ? 0 : 1;
      n.tattered += c.apparel && c.apparel.wear < TATTERED ? 1 : 0;
      n.mendable += c.apparel && c.apparel.wear < 0.6 ? 1 : 0;
      n.armored += c.armor ? 1 : 0;
      n.holdingKit += c.tool ? 1 : 0;
      if (c.job && TOOL_JOBS.has(c.job.type)) {
        n.toolWork++;
        n.toolless += c.tool ? 0 : 1;
        const stretch = (byStretch[Math.floor(this.day / 20)] ??= { work: 0, without: 0, firstKit: [] });
        stretch.work++;
        stretch.without += c.tool ? 0 : 1;
        if (!c.tool && this.stockOf(itemId('toolKit')) > 0) {
          n.toollessKitsStored++;
        } else if (!c.tool) {
          const w = this.world;
          if (![...w.tilesWith('features')].some((i) => w.feature[i] === featureId('craftingBench'))) {
            n.toollessNoBench++;
          } else if (this.stockOf(itemId('wood')) < 8 || this.stockOf(itemId('stone')) < 2) {
            n.toollessNoStuff++;
            n.toollessNoStone += this.stockOf(itemId('stone')) < 2 ? 1 : 0;
          }
          if (this.day <= 10) {
            n.toollessEarly++;
          }
        }
      }
    }
  }
  return result;
};

const made: number[] = [];
// At the end of each colony: kits held, kits lying about, and kits worn out (the rest went some other way).
const census: string[] = [];
let wornHere = 0;
let lastSim: Simulation | null = null;
const finishSim = (sim: Simulation | null) => {
  if (sim) {
    made.push(sim.stats.produced.toolKit ?? 0);
    const held = sim.living().filter((c) => c.tool).length;
    census.push(`${held}/${sim.stockOf(itemId('toolKit'))}/${wornHere}`);
    wornHere = 0;
  }
};
const step2 = Simulation.prototype.step;
Simulation.prototype.step = function (this: Simulation, ...args: unknown[]) {
  if (lastSim !== this) {
    finishSim(lastSim);
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the colony last stepped, to count its kits at the end
    lastSim = this;
  }
  return (step2 as (this: Simulation, ...a: unknown[]) => unknown).apply(this, args);
};

process.on('exit', () => {
  finishSim(lastSim);
  const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
  console.log(`\nGEAR over ${days} colony-days`);
  console.log(
    `  colonist-hours: no clothes ${pct(n.naked, n.samples)}, tattered ${pct(n.tattered, n.samples)}, worn enough to mend ${pct(n.mendable, n.samples)}, in armour ${pct(n.armored, n.samples)}`,
  );
  console.log(
    `  tool work done without a tool kit: ${pct(n.toolless, n.toolWork)} (of it, with a kit lying in the colony: ${pct(n.toollessKitsStored, n.toolless)})`,
  );
  console.log(
    `    with none to take: no crafting bench yet ${pct(n.toollessNoBench, n.toolless)}, a bench but short of wood or stone ${pct(n.toollessNoStuff, n.toolless)} (of stone ${pct(n.toollessNoStone, n.toolless)}); in the first ten days ${pct(n.toollessEarly, n.toolless)}`,
  );
  console.log(
    `    without a kit by 20-day stretch: ${byStretch.map((b, i) => `days ${i * 20}–${i * 20 + 19} ${pct(b.without, b.work)}`).join(', ')}`,
  );
  console.log(`    first kit made on day: ${firstKit.join(' ')}`);
  console.log(
    `  colonist-hours holding a tool kit: ${pct(n.holdingKit, n.samples)}; kits made per colony: ${made.join(' ')}; at the end held/lying/worn out: ${census.join(' ')}`,
  );
  console.log(
    `  per colony-day: ${[...events].map(([k, v]) => `${k} ${(v / Math.max(1, days)).toFixed(2)}`).join(', ')}`,
  );
});
