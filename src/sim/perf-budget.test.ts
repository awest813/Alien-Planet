import { describe, expect, it } from 'vitest';
import { spawnRaid } from './combat';
import { Simulation } from './simulation';
import { HOUR, run } from './test-helpers';

// The simulation's speed is timed by hand (scripts/perf.ts: timings are too noisy for a test), but how much
// work it does isn't: a seeded colony makes the same path searches every run. A search repeated every tick
// (a failed one retried at once, a charge re-planned while its target stands still) shows here as thousands
// where there should be hundreds. The bounds are about twice what a colony makes now.
function searches(sim: Simulation, ticks: number): number {
  let n = 0;
  const find = sim.pathfinder.find.bind(sim.pathfinder);
  sim.pathfinder.find = (start, goals, blocked) => {
    n++;
    return find(start, goals, blocked);
  };
  run(sim, ticks);
  sim.pathfinder.find = find;
  return n;
}

describe('path searches', () => {
  it('stay in hundreds a half-day on a Medium map, at work and in a raid', () => {
    const sim = Simulation.newColony(11, 'standard', 128);
    run(sim, HOUR * 24 * 3);
    // At work: 536 in 12 hours.
    expect(searches(sim, HOUR * 12)).toBeLessThan(1100);
    // Eight raiders coming in and fighting: 585.
    expect(spawnRaid(sim, 1, 8)).toBe(true);
    expect(searches(sim, HOUR * 12)).toBeLessThan(1200);
  }, 60000);
});
