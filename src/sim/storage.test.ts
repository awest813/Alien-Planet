import { describe, expect, it } from 'vitest';
import { featureDef, featureId, itemDef, itemId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { WORK_TYPES } from './types';
import { STOCKPILE_ZONE, refusedGroups, stockpilePriority, stockpileZone } from './world';

const DAY = HOUR * 24;

// A cleared patch with a closed hut holding a campfire, nobody working, no events.
function camp(seed: number) {
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
  for (const i of outline(w, x + 2, y - 3, x + 8, y + 3)) {
    w.setFeature(i, featureId('woodWall'));
  }
  w.setFeature(w.idx(x + 2, y), featureId('door'));
  const fire = w.idx(x + 5, y);
  w.setFeature(fire, featureId('campfire'));
  return { sim, w, x, y, fire, inside: w.idx(x + 6, y + 1) };
}

describe('fires burn wood', () => {
  it('come with a first load, burn down, and go cold and dark when it runs out', () => {
    const { sim, w, fire, inside } = camp(1);
    const burns = featureDef(w.feature[fire]).burns!;
    expect(w.fuel[fire]).toBe(burns.capacity);
    sim.tick = HOUR * 2;
    sim.syncClock();
    run(sim, HOUR);
    expect(w.fuel[fire]).toBeLessThan(burns.capacity);
    expect(sim.roomAt(inside)!.heaters).toBe(1);
    // Burn it out.
    w.fuel[fire] = 0.01;
    run(sim, HOUR);
    expect(w.fuel[fire]).toBe(0);
    expect(sim.roomAt(inside)!.heaters).toBe(0);
  });

  it('are kept fed by haulers, warming the room again', () => {
    const { sim, w, x, y, fire, inside } = camp(2);
    w.fuel[fire] = 0.01;
    run(sim, HOUR);
    expect(sim.roomAt(inside)!.heaters).toBe(0);
    w.dropItemNear(w.idx(x - 4, y), itemId('wood'), 60);
    sim.colonists[0].priorities.hauling = 1;
    run(sim, HOUR * 2);
    expect(w.fuel[fire]).toBeGreaterThan(20);
    expect(sim.roomAt(inside)!.heaters).toBe(1);
  });

  it('last about three days on a full load', () => {
    const { sim, w, fire } = camp(3);
    run(sim, DAY * 2);
    expect(w.fuel[fire]).toBeGreaterThan(0);
    run(sim, DAY * 2);
    expect(w.fuel[fire]).toBe(0);
  });
});

describe('stockpile settings', () => {
  // Two separate stockpiles west of the hut, and a hauler.
  function yard(seed: number) {
    const c = camp(seed);
    const { sim, x, y } = c;
    const a = { x0: x - 9, y0: y - 6, x1: x - 7, y1: y - 4 };
    const b = { x0: x - 9, y0: y + 4, x1: x - 7, y1: y + 6 };
    sim.apply({ type: 'zone', rect: a, zone: STOCKPILE_ZONE });
    sim.apply({ type: 'zone', rect: b, zone: STOCKPILE_ZONE });
    sim.colonists[0].priorities.hauling = 1;
    return { ...c, a: c.w.idx(a.x0, a.y0), b: c.w.idx(b.x0, b.y0) };
  }
  const where = (sim: Simulation, item: number) =>
    [...sim.world.tilesWith('items')].filter((i) => sim.world.itemType[i] === item);
  const FOOD = 1;
  const MATERIALS = 2;

  it('keep out what a stockpile refuses, and move it out when the settings change', () => {
    const { sim, w, x, y, a, b } = yard(10);
    sim.apply({ type: 'stockpile', tile: a, refused: MATERIALS, priority: 'normal' });
    // Settings cover the whole stockpile, and only that one.
    expect(refusedGroups(w.zone[w.idx(x - 7, y - 4)])).toBe(MATERIALS);
    expect(w.zone[b]).toBe(STOCKPILE_ZONE);
    w.dropItemNear(w.idx(x - 3, y), itemId('wood'), 40);
    run(sim, HOUR * 2);
    const wood = where(sim, itemId('wood'));
    expect(wood.length).toBeGreaterThan(0);
    expect(wood.every((i) => w.yOf(i) >= y + 4)).toBe(true);
    // Now the second one refuses wood too, and the first takes it: it all moves across.
    sim.apply({ type: 'stockpile', tile: a, refused: FOOD, priority: 'normal' });
    sim.apply({ type: 'stockpile', tile: b, refused: MATERIALS, priority: 'normal' });
    run(sim, HOUR * 3);
    expect(where(sim, itemId('wood')).every((i) => w.yOf(i) <= y - 4)).toBe(true);
  });

  it('send things to higher priority stockpiles first, and move them up', () => {
    const { sim, w, x, y, a, b } = yard(11);
    sim.apply({ type: 'stockpile', tile: b, refused: 0, priority: 'high' });
    expect(stockpilePriority(w.zone[b])).toBe('high');
    w.dropItemNear(w.idx(x - 3, y), itemId('stone'), 30);
    run(sim, HOUR * 2);
    expect(where(sim, itemId('stone')).every((i) => w.yOf(i) >= y + 4)).toBe(true);
    // Raise the other above it: everything moves up, then stays put.
    sim.apply({ type: 'stockpile', tile: a, refused: 0, priority: 'critical' });
    run(sim, HOUR * 3);
    expect(where(sim, itemId('stone')).every((i) => w.yOf(i) <= y - 4)).toBe(true);
    // And it stays there: nothing shuttles back and forth.
    const settled = where(sim, itemId('stone')).join();
    run(sim, HOUR * 3);
    expect(where(sim, itemId('stone')).join()).toBe(settled);
  });

  it('carry on to new stockpile drawn alongside', () => {
    const { sim, w, x, y, a } = yard(12);
    sim.apply({ type: 'stockpile', tile: a, refused: FOOD | MATERIALS, priority: 'low' });
    sim.apply({ type: 'zone', rect: { x0: x - 6, y0: y - 6, x1: x - 5, y1: y - 4 }, zone: STOCKPILE_ZONE });
    expect(w.zone[w.idx(x - 5, y - 5)]).toBe(stockpileZone(FOOD | MATERIALS, 'low'));
  });
});

describe('forbidding', () => {
  it('keeps colonists off items until they are allowed again, and is saved', () => {
    const { sim, w, x, y } = camp(20);
    sim.apply({ type: 'zone', rect: { x0: x - 9, y0: y - 6, x1: x - 7, y1: y - 4 }, zone: STOCKPILE_ZONE });
    sim.colonists[0].priorities.hauling = 1;
    const pile = w.idx(x - 3, y + 5);
    w.addItem(pile, itemId('wood'), 30);
    const rect = { x0: x - 3, y0: y + 5, x1: x - 3, y1: y + 5 };
    sim.apply({ type: 'forbid', rect, on: true });
    expect(w.forbidden[pile]).toBe(1);
    // Not hauled, and not used to build.
    sim.apply({ type: 'build', feature: featureId('table'), tiles: [w.idx(x - 1, y - 6)] });
    sim.colonists[0].priorities.construction = 1;
    run(sim, HOUR * 2);
    expect(w.itemCount[pile]).toBe(30);
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.world.forbidden[pile]).toBe(1);
    sim.apply({ type: 'forbid', rect, on: false });
    run(sim, HOUR * 2);
    expect(w.itemCount[pile]).toBeLessThan(30);
    // An emptied tile forgets it was forbidden.
    w.addItem(pile, itemId('stone'), 5);
    w.forbidden[pile] = 1;
    w.takeItem(pile, 5);
    expect(w.forbidden[pile]).toBe(0);
  });
});

describe('shelves', () => {
  it('hold three stacks of one kind of item on a tile, and haulers fill them', () => {
    const { sim, w, x, y } = camp(30);
    for (const i of [...w.tilesWith('items')]) {
      w.takeItem(i, w.itemCount[i]);
    }
    const shelf = w.idx(x - 4, y - 4);
    w.setFeature(shelf, featureId('shelf'));
    const limit = itemDef(itemId('stone')).stackLimit;
    expect(w.capacity(shelf, itemId('stone'))).toBe(limit * 3);
    expect(sim.isStockpile(shelf)).toBe(true);
    w.dropItemNear(w.idx(x - 8, y + 6), itemId('stone'), limit * 2);
    sim.colonists[0].priorities.hauling = 1;
    run(sim, HOUR * 4);
    expect(w.itemType[shelf]).toBe(itemId('stone'));
    expect(w.itemCount[shelf]).toBe(limit * 2);
    // A stockpile painted over a shelf sets what it takes.
    sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y - 4, x1: x - 4, y1: y - 4 }, zone: STOCKPILE_ZONE });
    sim.apply({ type: 'stockpile', tile: shelf, refused: 2, priority: 'normal' });
    expect(sim.storeValue(shelf, itemId('stone'))).toBe(0);
  });
});

describe('locked doors', () => {
  it('keep everyone out until unlocked, and are saved', () => {
    const { sim, w, x, y, inside } = camp(31);
    const door = w.idx(x + 2, y);
    const outside = w.idx(x - 3, y);
    expect(sim.pathfinder.find(outside, [inside])).not.toBeNull();
    w.addFilth(door, 2);
    sim.apply({ type: 'lock', tile: door, locked: true });
    expect(w.filth[door]).toBe(0);
    expect(w.locked[door]).toBe(1);
    expect(w.isPassable(door)).toBe(false);
    expect(sim.pathfinder.find(outside, [inside])).toBeNull();
    expect(sim.regionOf(outside)).not.toBe(sim.regionOf(inside));
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.world.locked[door]).toBe(1);
    sim.apply({ type: 'lock', tile: door, locked: false });
    expect(sim.pathfinder.find(outside, [inside])).not.toBeNull();
    // Only doors lock.
    sim.apply({ type: 'lock', tile: w.idx(x + 4, y - 3), locked: true });
    expect(w.locked[w.idx(x + 4, y - 3)]).toBe(0);
  });

  it('hold raiders like a wall: they have to break their way in', () => {
    const { sim, w, x, y } = camp(32);
    const door = w.idx(x + 2, y);
    const walls = () => [...w.tilesWith('features')].filter((i) => w.feature[i] === featureId('woodWall')).length;
    const before = walls();
    // Everyone inside, door locked.
    for (const c of sim.colonists) {
      c.tile = w.idx(x + 6, y + 1);
    }
    sim.apply({ type: 'lock', tile: door, locked: true });
    expect(triggerEvent(sim, 'raid')).toBe(true);
    for (let h = 0; h < 12 && walls() === before && w.feature[door] === featureId('door'); h++) {
      for (const c of sim.colonists) {
        c.needs.food = 1;
        c.needs.rest = 1;
      }
      run(sim, HOUR);
    }
    expect(walls() < before || w.feature[door] !== featureId('door')).toBe(true);
    // A broken door comes back unlocked.
    w.setFeature(door, 0);
    expect(w.locked[door]).toBe(0);
  });
});

describe('cold weather', () => {
  it('keeps colonists from going out for fun or idling outdoors in cold their clothes can’t take', () => {
    const { sim, w, x, y } = camp(40);
    const c = sim.colonists[0];
    c.tile = w.idx(x + 6, y + 1);
    c.needs.joy = 0.1;
    c.schedule.fill('J');
    for (const o of sim.colonists.slice(1)) {
      o.tile = c.tile;
      o.schedule.fill('J');
    }
    // A horseshoe pin outside, and a bitter night out there.
    w.setFeature(w.idx(x - 3, y), featureId('horseshoePin'));
    const real = sim.temperatureAt.bind(sim);
    sim.temperatureAt = (i: number) => (sim.isIndoors(i) ? real(i) : -20);
    for (let t = 0; t < HOUR * 3; t++) {
      sim.step();
      for (const o of sim.colonists) {
        expect(sim.isIndoors(o.tile) || w.locked[o.tile] === 1 || o.tile === w.idx(x + 2, y)).toBe(true);
      }
    }
    sim.temperatureAt = real;
  });
});
