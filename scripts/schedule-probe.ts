// The schedule probe for schedule.ts (imported before balance.ts, which then runs the colonies).
import { Simulation, TICKS_PER_HOUR } from '../src/sim/simulation';

const nightOwl = process.argv.includes('nightowl');
const doing = (job: string | undefined, sleeping: boolean): string =>
  sleeping || job === 'sleep' || job === 'rest'
    ? 'asleep'
    : !job || job === 'wander'
      ? 'idle'
      : ['joy', 'eat'].includes(job)
        ? 'leisure'
        : 'working';
const table = new Map<string, Map<string, number>>();
const owls = new WeakSet<object>();
const step = Simulation.prototype.step;
Simulation.prototype.step = function (this: Simulation, ...args: unknown[]) {
  if (nightOwl && !owls.has(this) && this.colonists.length > 0) {
    owls.add(this);
    const owl = this.colonists[0];
    owl.schedule = owl.schedule.map((_, h) => (h >= 8 && h < 16 ? 'S' : h >= 16 && h < 18 ? 'J' : 'W'));
  }
  const result = (step as (this: Simulation, ...a: unknown[]) => unknown).apply(this, args);
  if (this.tick % TICKS_PER_HOUR === 30) {
    for (const c of this.living()) {
      if (c.age < 13 || c.drafted || c.health.downed) {
        continue;
      }
      const who = nightOwl && c === this.colonists[0] ? 'night owl' : 'others';
      const key = `${who} ${this.slotOf(c)}`;
      const row = table.get(key) ?? new Map<string, number>();
      const what = doing(c.job?.type, c.sleeping);
      row.set(what, (row.get(what) ?? 0) + 1);
      table.set(key, row);
    }
  }
  return result;
};

process.on('exit', () => {
  console.log(
    '\nSCHEDULE: share of colonist-hours, by what the hour was set for (S sleep, W work, J recreation, A anything; a rest day reads as J)',
  );
  for (const [key, row] of [...table].sort()) {
    const total = [...row.values()].reduce((s, n) => s + n, 0);
    console.log(
      `  ${key.padEnd(13)} (${String(total).padStart(6)}): ${['asleep', 'working', 'leisure', 'idle']
        .map((k) => `${k} ${((100 * (row.get(k) ?? 0)) / total).toFixed(0)}%`)
        .join(', ')}`,
    );
  }
});
