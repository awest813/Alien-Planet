import { describe, expect, it } from 'vitest';
import { manhuntersArrive } from './animals';
import { FURY_HOURS, beastWakes } from './beast';
import { featureId } from './defs';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround } from './test-helpers';

// A maddened pack when everyone it could reach is in a pen (found by the sixth audit: it crashed the game).

describe('a maddened pack', () => {
  it('does not crash when every colonist it could reach is inside a pen', () => {
    const sim = Simulation.newColony(2);
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === 3) {
          w.setFeature(w.idx(x + dx, y + dy), featureId('fence'));
        }
      }
    }
    w.setFeature(w.idx(x + 3, y), featureId('gate'));
    // Everyone is in with the sheep.
    sim.colonists.forEach((c, k) => {
      c.tile = w.idx(x - 1 + (k % 3), y - 1 + Math.floor(k / 3));
    });
    expect(() => manhuntersArrive(sim, 'wolf', 3)).not.toThrow();
  });

  it("the storyteller's pack event does not crash the game either", () => {
    const sim = Simulation.newColony(2);
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.tick = 40 * 24 * HOUR;
    sim.syncClock();
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === 3) {
          w.setFeature(w.idx(x + dx, y + dy), featureId('fence'));
        }
      }
    }
    w.setFeature(w.idx(x + 3, y), featureId('gate'));
    sim.colonists.forEach((c, k) => {
      c.tile = w.idx(x - 1 + (k % 3), y - 1 + Math.floor(k / 3));
    });
    expect(() => triggerEvent(sim, 'manhunters')).not.toThrow();
    expect(() => triggerEvent(sim, 'greatBeast')).not.toThrow();
  });
});

describe('the great beast', () => {
  it('rages its full time from when it sets off, not from when it appears', () => {
    // (On a small map it gathers itself at the edge first, and that time came off its fury.)
    const sim = Simulation.newColony(2, 'standard', 64);
    clearAround(sim, 10);
    expect(beastWakes(sim)).toBe(true);
    const beast = sim.animals[sim.animals.length - 1];
    expect(beast.musterUntil).toBeGreaterThan(sim.tick);
    expect(beast.revengeUntil - beast.musterUntil!).toBe(FURY_HOURS * HOUR);
  });
});
