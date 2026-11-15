// The wildlife probe for animals.ts: counts each kind of animal, wild and tame, at every dawn of the colonies the
// balance harness plays, and prints the averages by year (so dying out, or overrunning the map, shows).
import { Simulation, TICKS_PER_HOUR } from '../src/sim/simulation';

const byYear = new Map<number, Map<string, { wild: number; tame: number }>>();
const samples = new Map<number, number>();
const step = Simulation.prototype.step;
Simulation.prototype.step = function (this: Simulation, ...args: unknown[]) {
  const result = (step as (this: Simulation, ...a: unknown[]) => unknown).apply(this, args);
  if (this.tick % (TICKS_PER_HOUR * 24) === 0) {
    const year = Math.floor((this.day - 1) / 24);
    samples.set(year, (samples.get(year) ?? 0) + 1);
    const kinds = byYear.get(year) ?? new Map();
    for (const a of this.animals) {
      if (a.hp <= 0) {
        continue;
      }
      const k = kinds.get(a.kind) ?? { wild: 0, tame: 0 };
      if (a.tame) {
        k.tame++;
      } else {
        k.wild++;
      }
      kinds.set(a.kind, k);
    }
    byYear.set(year, kinds);
  }
  return result;
};

process.on('exit', () => {
  console.log('\nWILDLIFE: average per colony at dawn, by year (wild/tame)');
  for (const [year, kinds] of [...byYear].sort((a, b) => a[0] - b[0])) {
    const n = samples.get(year) ?? 1;
    console.log(
      `  year ${year + 1}: ${[...kinds]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, c]) => `${k} ${(c.wild / n).toFixed(1)}/${(c.tame / n).toFixed(1)}`)
        .join(', ')}`,
    );
  }
});
