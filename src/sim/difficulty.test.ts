import { describe, expect, it } from 'vitest';
import { featureId } from './defs';
import { Simulation } from './simulation';
import { Difficulty } from './storyteller';
import { HOUR, clearAround, run } from './test-helpers';
import { GROW_ZONE } from './world';

// Potatoes from a ripe field of 12 plants, harvested by the colony.
function harvest(difficulty: Difficulty): number {
  const sim = Simulation.newColony(61, difficulty);
  const w = sim.world;
  const { x, y } = clearAround(sim, 10);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.apply({
    type: 'zone',
    rect: { x0: x + 3, y0: y + 3, x1: x + 6, y1: y + 5 },
    zone: GROW_ZONE + featureId('potatoPlant'),
  });
  for (let ty = y + 3; ty <= y + 5; ty++) {
    for (let tx = x + 3; tx <= x + 6; tx++) {
      w.setFeature(w.idx(tx, ty), featureId('potatoPlant'));
      w.growth[w.idx(tx, ty)] = 1;
    }
  }
  for (const c of sim.colonists) {
    c.priorities.growing = 1;
    c.needs.food = 1;
  }
  for (let hour = 0; hour < 12 && sim.countFeature((f) => f === featureId('potatoPlant')) > 0; hour++) {
    run(sim, HOUR);
  }
  return sim.stats.produced.potatoes ?? 0;
}

describe('peaceful', () => {
  it('gives smaller harvests, so food is still worth planning for', () => {
    const standard = harvest('standard');
    const peaceful = harvest('peaceful');
    expect(standard).toBe(96);
    expect(peaceful).toBeLessThan(standard * 0.9);
    expect(peaceful).toBeGreaterThan(standard * 0.7);
  });
});
