import { describe, expect, it } from 'vitest';
import { itemId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { clearAround } from './test-helpers';

const spoil = (sim: Simulation, h: number) => (sim as unknown as { updateSpoilage(h: number): void }).updateSpoilage(h);

// Before weapons wore, addItem never wrote `fresh` for a weapon: a weapon's tile kept whatever the last stack there
// left behind (food with days to go, say). Loading such a save makes every weapon lying about as good as new.
describe('a weapon from a save before weapons wore', () => {
  it('lying on a tile where food once lay, still wears away in a month', () => {
    const sim = Simulation.newColony(7);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    const out = w.idx(x + 5, y + 5);
    // Raw meat lay here once (days of shelf life left), and was eaten.
    w.addItem(out, itemId('rawMeat'), 1);
    w.takeItem(out, 1);
    const left = w.fresh[out];
    expect(left).toBeGreaterThan(1);
    w.addItem(out, itemId('knife'), 1);
    // What the old addItem left on the tile: the food's days, not a condition.
    w.fresh[out] = left;
    // A save from then (no word that weapons wear).
    const data = structuredClone(serialize(sim));
    delete data.weaponsWear;
    const old = deserialize(data);
    const ow = old.world;
    expect(ow.itemType[out]).toBe(itemId('knife'));
    spoil(old, 24 * 31);
    // (30 days from new; the food's six days left make it last six months.)
    expect(ow.itemType[out]).not.toBe(itemId('knife'));
  });
});
