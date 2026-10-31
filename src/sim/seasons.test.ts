import { describe, expect, it } from 'vitest';
import { featureId, itemId } from './defs';
import { seasonOf } from './seasons';
import { deserialize, serialize } from './serialize';
import { Simulation, START_HOUR } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { GROW_ZONE } from './world';

// Total hours at noon on a given colony day.
const noonOf = (day: number) => (day - 1) * 24 + 12;

describe('seasons', () => {
  it('runs spring → summer → autumn → winter → spring over 24 days, starting in spring', () => {
    expect(seasonOf(START_HOUR)).toBe('Spring');
    const sequence = Array.from({ length: 26 }, (_, d) => seasonOf(noonOf(d + 1)));
    const changes = sequence.filter((s, i) => i === 0 || s !== sequence[i - 1]);
    expect(changes).toEqual(['Spring', 'Summer', 'Autumn', 'Winter', 'Spring']);
    expect(sequence.filter((s) => s === 'Winter')).toHaveLength(6);
  });

  it('makes winter much colder than summer', () => {
    const sim = Simulation.newColony(1);
    const average = (day: number) => {
      let sum = 0;
      for (let h = 0; h < 24; h++) {
        sim.tick = ((day - 1) * 24 + h - START_HOUR) * HOUR;
        sum += sim.outdoorTemperature();
      }
      return sum / 24;
    };
    expect(average(9) - average(21)).toBeGreaterThan(15);
  });

  it('stops crops growing in winter and lets frost kill them', () => {
    const sim = Simulation.newColony(2);
    const w = sim.world;
    const { x, y } = clearAround(sim, 8);
    sim.apply({
      type: 'zone',
      rect: { x0: x + 2, y0: y + 2, x1: x + 6, y1: y + 6 },
      zone: GROW_ZONE + featureId('potatoPlant'),
    });
    run(sim, HOUR * 6);
    const crops = () => sim.countFeature((f) => f === featureId('potatoPlant'));
    expect(crops()).toBeGreaterThan(0);
    // Jump to a deep-winter night.
    sim.tick = (21 * 24 + 2 - START_HOUR) * HOUR;
    sim.syncClock();
    const before = crops();
    const growth = Array.from(w.growth).reduce((a, b) => a + b, 0);
    run(sim, HOUR * 4);
    expect(sim.season).toBe('Winter');
    expect(crops()).toBeLessThan(before);
    expect(Array.from(w.growth).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(growth);
  });
});

describe('research', () => {
  function withBench(seed: number) {
    const sim = Simulation.newColony(seed);
    const w = sim.world;
    const { x, y } = clearAround(sim, 8);
    w.dropItemNear(w.idx(x, y + 3), itemId('wood'), 60);
    sim.apply({ type: 'build', feature: featureId('researchBench'), tiles: [w.idx(x + 3, y - 3)] });
    for (const c of sim.colonists) {
      c.priorities.research = 1;
    }
    return { sim, w, x, y };
  }

  it('locks buildings until their project is researched, then unlocks them', () => {
    const { sim, w, x, y } = withBench(3);
    const tile = w.idx(x - 3, y - 3);
    expect(sim.canPlaceBlueprint(tile, featureId('hearth'))).toBe(false);
    sim.apply({ type: 'research', project: 'hearths' });
    expect(sim.research.current).toBe('hearths');
    run(sim, HOUR * 24);
    expect(sim.research.done).toContain('hearths');
    expect(sim.research.current).toBeNull();
    expect(sim.canPlaceBlueprint(tile, featureId('hearth'))).toBe(true);
  });

  it("won't start a project before its prerequisites", () => {
    const sim = Simulation.newColony(4);
    sim.apply({ type: 'research', project: 'fortifications' });
    expect(sim.research.current).toBeNull();
    sim.research.done.push('archery');
    sim.apply({ type: 'research', project: 'fortifications' });
    expect(sim.research.current).toBe('fortifications');
  });

  it('saves research progress', () => {
    const { sim } = withBench(5);
    sim.apply({ type: 'research', project: 'cropRotation' });
    run(sim, HOUR * 6);
    expect(sim.research.progress.cropRotation ?? 0).toBeGreaterThan(0);
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.research).toEqual(sim.research);
  });
});
