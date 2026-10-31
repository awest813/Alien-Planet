import { describe, expect, it } from 'vitest';
import { NONE, featureId } from './defs';
import { damage } from './health';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround, outline, run } from './test-helpers';

// Regression tests for problems found by playtesting.

describe('downed colonists', () => {
  it('get food brought to them', () => {
    const sim = Simulation.newColony(3);
    run(sim, HOUR);
    const patient = sim.colonists[0];
    damage(sim, patient, 0.45, 'cut');
    damage(sim, patient, 0.45, 'cut');
    expect(patient.health.downed).toBe(true);
    patient.needs.food = 0.1;
    run(sim, HOUR * 4);
    expect(patient.needs.food).toBeGreaterThan(0.3);
  });
});

describe('raids', () => {
  it('still come for a colony that walls itself in, and break through', () => {
    const sim = Simulation.newColony(5);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    const ring = outline(w, x - 2, y - 2, x + 2, y + 2);
    for (const t of ring) {
      w.setFeature(t, featureId('woodWall'));
    }
    sim.colonists.forEach((c, k) => {
      c.tile = w.idx(x - 1 + (k % 3), y - 1 + Math.floor(k / 3));
      c.path = [];
      c.job = null;
    });
    run(sim, 1);
    expect(triggerEvent(sim, 'raid')).toBe(true);
    run(sim, HOUR * 8);
    expect(ring.some((t) => w.feature[t] === NONE)).toBe(true);
  });

  it('find the built wall of a room backed by natural rock', () => {
    const sim = Simulation.newColony(5);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    const ring = outline(w, x - 2, y - 2, x + 2, y + 2);
    // The north side is a solid rock face, three tiles thick.
    for (let dy = -4; dy <= -2; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        w.setFeature(w.idx(x + dx, y + dy), featureId('rock'));
      }
    }
    const walls = ring.filter((t) => w.feature[t] === NONE);
    for (const t of walls) {
      w.setFeature(t, featureId('woodWall'));
    }
    sim.colonists.forEach((c, k) => {
      c.tile = w.idx(x - 1 + (k % 3), y - 1 + Math.floor(k / 3));
      c.path = [];
      c.job = null;
    });
    run(sim, 1);
    expect(triggerEvent(sim, 'raid')).toBe(true);
    run(sim, HOUR * 8);
    expect(walls.some((t) => w.feature[t] === NONE)).toBe(true);
  });
});

describe('generators', () => {
  it('save fuel when nothing needs the power', () => {
    const sim = Simulation.newColony(8);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    const generator = w.idx(x + 6, y);
    w.setFeature(generator, featureId('woodGenerator'));
    w.setFeature(w.idx(x + 6, y + 2), featureId('battery'));
    w.fuel[generator] = 40;
    run(sim, 1);
    sim.power.stored = 8000;
    run(sim, HOUR);
    expect(w.fuel[generator]).toBe(40);
  });
});
