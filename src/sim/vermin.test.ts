import { describe, expect, it } from 'vitest';
import { featureId, itemId } from './defs';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { clearAround } from './test-helpers';
import { STOCKPILE_ZONE } from './world';

describe('vermin', () => {
  it('spoil food left on the stockpile floor, not food on shelves', () => {
    const sim = Simulation.newColony(8);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    sim.apply({ type: 'zone', rect: { x0: x + 2, y0: y + 2, x1: x + 4, y1: y + 4 }, zone: STOCKPILE_ZONE });
    const potatoes = itemId('potatoes');
    const floor = w.idx(x + 2, y + 2);
    const shelf = w.idx(x + 4, y + 4);
    w.setFeature(shelf, featureId('shelf'));
    w.dropItemNear(floor, potatoes, 40);
    w.dropItemNear(shelf, potatoes, 40);
    expect(w.itemCount[floor]).toBe(40);
    expect(w.itemCount[shelf]).toBe(40);
    // Warm enough that freezing doesn't keep them off.
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    expect(triggerEvent(sim, 'vermin')).toBe(true);
    expect(w.itemCount[floor]).toBeLessThan(40);
    expect(w.itemCount[floor]).toBeGreaterThanOrEqual(24);
    expect(w.itemCount[shelf]).toBe(40);
    expect(sim.log.at(-1)!.text).toMatch(/^Vermin got into the stores: \d+ food spoiled/);
  });
});
