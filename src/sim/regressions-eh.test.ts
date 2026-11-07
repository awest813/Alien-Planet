import { describe, expect, it } from 'vitest';
import { featureId, itemId } from './defs';
import { startObsession } from './minds';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { WORK_TYPES } from './types';
import { STOCKPILE_ZONE } from './world';

// Regressions found auditing phases E to H.

function quiet(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 14);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  for (const c of sim.colonists) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 1;
    c.schedule.fill('W');
    for (const work of WORK_TYPES) {
      c.priorities[work] = 0;
    }
  }
  return { sim, w, x, y };
}

describe('storage and fuel', () => {
  it('never tops up a forbidden stack, so what is hauled stays usable', () => {
    const { sim, w, x, y } = quiet(1);
    for (const i of [...w.tilesWith('items')]) {
      w.takeItem(i, w.itemCount[i]);
    }
    sim.apply({ type: 'zone', rect: { x0: x - 6, y0: y - 6, x1: x - 4, y1: y - 4 }, zone: STOCKPILE_ZONE });
    const kept = w.idx(x - 6, y - 6);
    w.addItem(kept, itemId('wood'), 10);
    w.forbidden[kept] = 1;
    w.dropItemNear(w.idx(x + 4, y + 4), itemId('wood'), 20);
    sim.colonists[0].priorities.hauling = 1;
    run(sim, HOUR * 3);
    expect(w.itemCount[kept]).toBe(10);
    const usable = [...w.tilesWith('items')].filter((i) => w.itemType[i] === itemId('wood') && !w.forbidden[i]);
    expect(usable.reduce((n, i) => n + w.itemCount[i], 0)).toBe(20);
  });

  it('dries each stack for its own time: a new stack on a rack starts from scratch', () => {
    const { sim, w, x, y } = quiet(2);
    const rack = w.idx(x + 3, y + 3);
    w.setFeature(rack, featureId('dryingRack'));
    w.addItem(rack, itemId('rawMeat'), 10);
    run(sim, HOUR * 10);
    expect(w.itemType[rack]).toBe(itemId('rawMeat'));
    w.takeItem(rack, 10);
    w.addItem(rack, itemId('berries'), 10);
    run(sim, HOUR * 3);
    expect(w.itemType[rack]).toBe(itemId('berries'));
  });

  it('lights the fires of a save from before fires burned wood', () => {
    const { sim, w, x, y } = quiet(3);
    const fire = w.idx(x + 2, y + 2);
    w.setFeature(fire, featureId('campfire'));
    w.fuel[fire] = 0;
    const save = structuredClone(serialize(sim));
    delete (save.layers as { forbidden?: unknown }).forbidden;
    expect(deserialize(save).world.fuel[fire]).toBeGreaterThan(0);
  });
});

describe('families and minds', () => {
  it('keep children off every kind of work until they are old enough', () => {
    const { sim } = quiet(4);
    const kid = sim.colonists[0];
    kid.age = 8;
    sim.apply({ type: 'priority', colonist: kid.id, work: 'doctor', value: 1 });
    expect(kid.priorities.doctor).toBe(0);
    kid.age = 14;
    sim.apply({ type: 'priority', colonist: kid.id, work: 'hauling', value: 1 });
    expect(kid.priorities.hauling).toBe(1);
    sim.apply({ type: 'priority', colonist: kid.id, work: 'mining', value: 1 });
    expect(kid.priorities.mining).toBe(0);
  });

  it('never smash a bridge in a rage', () => {
    const { sim, w, x, y } = quiet(5);
    const c = sim.colonists[0];
    const bridge = w.idx(x + 2, y);
    w.setTerrain(bridge, 0);
    w.setFeature(bridge, featureId('bridge'));
    c.tile = w.idx(x + 1, y);
    sim.startBreak(c, 'tantrum', 3);
    run(sim, HOUR * 2);
    expect(w.feature[bridge]).toBe(featureId('bridge'));
  });

  it('do not rebuild a lost work of art as a blueprint nobody can carve', () => {
    const { sim, w, x, y } = quiet(6);
    const tile = w.idx(x + 3, y);
    sim.rebuild(tile, featureId('legendarySculpture'));
    sim.rebuild(w.idx(x + 4, y), featureId('sculptureSmall'));
    expect(w.blueprint[tile]).toBe(0);
    expect(w.blueprint[w.idx(x + 4, y)]).toBe(0);
  });

  it('let an obsessed artist who is carrying something still get on with their vision', () => {
    const { sim, w, x, y } = quiet(7);
    const [artist] = sim.colonists;
    artist.skills.artistic = 12;
    artist.mood = 70;
    sim.apply({ type: 'zone', rect: { x0: x - 7, y0: y - 7, x1: x - 4, y1: y - 4 }, zone: STOCKPILE_ZONE });
    w.addItem(w.idx(x - 7, y - 7), itemId('stoneBlocks'), 50);
    w.addItem(w.idx(x - 6, y - 7), itemId('wood'), 50);
    w.addItem(w.idx(x - 5, y - 7), itemId('silver'), 40);
    expect(startObsession(sim)).toBe(true);
    artist.carrying = { item: itemId('berries'), count: 3 };
    const tile = sim.obsession!.tile;
    run(sim, HOUR * 4);
    expect(w.deliveredAt(tile, 0) + w.deliveredAt(tile, 1) + w.deliveredAt(tile, 2)).toBeGreaterThan(0);
  });
});
