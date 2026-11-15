// The gear probe for gear.ts: samples the colonists of the colonies the balance harness plays, every game hour, for
// the state of their clothes, tool kits and armour, and counts what falls apart, wears out and is mended.
import { Simulation, TICKS_PER_HOUR } from '../src/sim/simulation';
import { TATTERED } from '../src/sim/apparel';
import { itemId } from '../src/sim/defs';

const n = {
  samples: 0,
  naked: 0,
  tattered: 0,
  mendable: 0,
  toolWork: 0,
  toolless: 0,
  toollessKitsStored: 0,
  armored: 0,
};
const events = new Map<string, number>();
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
    }
  }
  return (addLog as (this: Simulation, ...a: unknown[]) => void).call(this, text, ...rest);
};

const step = Simulation.prototype.step;
Simulation.prototype.step = function (this: Simulation, ...args: unknown[]) {
  const result = (step as (this: Simulation, ...a: unknown[]) => unknown).apply(this, args);
  if (this.tick % TICKS_PER_HOUR === 0) {
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
      if (c.job && TOOL_JOBS.has(c.job.type)) {
        n.toolWork++;
        n.toolless += c.tool ? 0 : 1;
        if (!c.tool && this.stockOf(itemId('toolKit')) > 0) {
          n.toollessKitsStored++;
        }
      }
    }
  }
  return result;
};

process.on('exit', () => {
  const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
  console.log(`\nGEAR over ${days} colony-days`);
  console.log(
    `  colonist-hours: no clothes ${pct(n.naked, n.samples)}, tattered ${pct(n.tattered, n.samples)}, worn enough to mend ${pct(n.mendable, n.samples)}, in armour ${pct(n.armored, n.samples)}`,
  );
  console.log(
    `  tool work done without a tool kit: ${pct(n.toolless, n.toolWork)} (of it, with a kit lying in the colony: ${pct(n.toollessKitsStored, n.toolless)})`,
  );
  console.log(
    `  per colony-day: ${[...events].map(([k, v]) => `${k} ${(v / Math.max(1, days)).toFixed(2)}`).join(', ')}`,
  );
});
