import { describe, expect, it } from 'vitest';
import { NONE, featureId, itemId, terrainId } from './defs';
import { Pathfinder } from './pathfinding';
import { computeRooms } from './regions';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run, totalItems } from './test-helpers';
import { GROW_ZONE, STOCKPILE_ZONE, World } from './world';

// A colony with a stocked 5x5 hut (door, bed per colonist) and wood on the ground.
function colonyWithHut(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 10);
  w.dropItemNear(w.idx(x, y + 3), itemId('wood'), 400);
  const hut = { x0: x + 2, y0: y - 8, x1: x + 8, y1: y - 2 };
  const door = w.idx(x + 5, hut.y1);
  sim.apply({ type: 'build', feature: featureId('woodWall'), tiles: outline(w, hut.x0, hut.y0, hut.x1, hut.y1) });
  sim.apply({ type: 'build', feature: featureId('door'), tiles: [door] });
  const beds = [1, 2, 3, 4, 5].map((k) => w.idx(hut.x0 + k, hut.y0 + 1));
  sim.apply({ type: 'build', feature: featureId('bed'), tiles: beds });
  return { sim, w, x, y, hut, inside: w.idx(x + 5, y - 5) };
}

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    const a = Simulation.newColony(42);
    const b = Simulation.newColony(42);
    expect(a.world.terrain).toEqual(b.world.terrain);
    expect(a.world.feature).toEqual(b.world.feature);
    expect(a.colonists.map((c) => c.name)).toEqual(b.colonists.map((c) => c.name));
  });

  it('lands five colonists on dry, walkable ground', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const sim = Simulation.newColony(seed);
      expect(sim.colonists).toHaveLength(5);
      for (const c of sim.colonists) {
        expect(sim.world.isPassable(c.tile)).toBe(true);
        expect(sim.world.terrain[c.tile]).not.toBe(terrainId('shallowWater'));
      }
    }
  });
});

describe('pathfinding', () => {
  const open = () => {
    const w = new World(10, 10);
    w.terrain.fill(terrainId('grass'));
    return w;
  };

  it('finds a path and never cuts corners past walls', () => {
    const w = open();
    // A wall with a single gap at (5, 9).
    for (let y = 0; y < 9; y++) {
      w.feature[w.idx(5, y)] = featureId('woodWall');
    }
    const path = new Pathfinder(w).find(w.idx(0, 0), [w.idx(9, 0)])!;
    expect(path).not.toBeNull();
    expect(path.at(-1)).toBe(w.idx(9, 0));
    let prev = w.idx(0, 0);
    for (const step of path) {
      expect(w.isPassable(step)).toBe(true);
      const dx = w.xOf(step) - w.xOf(prev);
      const dy = w.yOf(step) - w.yOf(prev);
      if (dx !== 0 && dy !== 0) {
        expect(w.isPassable(w.idx(w.xOf(prev) + dx, w.yOf(prev)))).toBe(true);
        expect(w.isPassable(w.idx(w.xOf(prev), w.yOf(prev) + dy))).toBe(true);
      }
      prev = step;
    }
  });

  it('returns null when the goal is walled off', () => {
    const w = open();
    for (let y = 0; y < 10; y++) {
      w.feature[w.idx(5, y)] = featureId('woodWall');
    }
    expect(new Pathfinder(w).find(w.idx(0, 0), [w.idx(9, 9)])).toBeNull();
  });
});

describe('rooms', () => {
  it('detects an enclosed room and treats doors as boundaries', () => {
    const w = new World(12, 12);
    w.terrain.fill(terrainId('grass'));
    for (const i of outline(w, 2, 2, 6, 6)) {
      w.feature[i] = featureId('woodWall');
    }
    w.feature[w.idx(4, 6)] = featureId('door');
    const rooms = computeRooms(w);
    const inside = rooms.room[w.idx(4, 4)];
    const outside = rooms.room[w.idx(0, 0)];
    expect(rooms.enclosed[inside]).toBe(true);
    expect(rooms.sizes[inside]).toBe(9);
    expect(rooms.enclosed[outside]).toBe(false);
    expect(rooms.room[w.idx(4, 6)]).toBe(-1);
  });
});

describe('items', () => {
  it('never destroys items, even when nothing nearby has room', () => {
    const sim = Simulation.newColony(11);
    const before = totalItems(sim);
    sim.world.dropItemNear(sim.colonists[0].tile, itemId('wood'), 100000);
    expect(totalItems(sim)).toBe(before + 100000);
  });

  it('refunds delivered materials when a blueprint is cancelled', () => {
    const { sim, w, hut } = colonyWithHut(3);
    run(sim, HOUR * 2);
    const delivered = w.delivered.reduce((sum, n) => sum + n, 0);
    expect(delivered).toBeGreaterThan(0);
    const before = totalItems(sim);
    sim.apply({ type: 'cancel', rect: hut });
    expect(totalItems(sim)).toBe(before + delivered);
    expect(w.blueprint.every((b) => b === NONE)).toBe(true);
  });
});

describe('colony behaviour', () => {
  it('builds a shelter and gets everyone through the first night indoors', () => {
    const { sim, w, inside } = colonyWithHut(5);
    run(sim, HOUR * 24);
    expect(sim.hasShelter()).toBe(true);
    expect(sim.countFeature((f) => f === featureId('bed'))).toBe(5);
    expect(sim.isIndoors(inside)).toBe(true);
    expect(sim.firstNight).toBe('success');
    expect(w.isPassable(inside)).toBe(true);
  });

  it('fails the first night for colonists awake outdoors all night', () => {
    const sim = Simulation.newColony(9);
    for (const c of sim.colonists) {
      c.schedule.fill('A');
    }
    run(sim, HOUR * 24);
    expect(sim.firstNight).toBe('failed');
  });

  it('wakes a starving sleeper to eat', () => {
    const sim = Simulation.newColony(7);
    run(sim, HOUR * 16); // 23:00, asleep
    const c = sim.colonists[0];
    expect(c.sleeping).toBe(true);
    c.needs.food = 0.05;
    run(sim, HOUR * 2);
    expect(c.needs.food).toBeGreaterThan(0.3);
  });

  it('eats before sleeping when both starving and exhausted', () => {
    for (let t = 0; t < 5; t++) {
      const sim = Simulation.newColony(100 + t);
      run(sim, HOUR * 3 + t);
      const c = sim.colonists[0];
      c.needs.food = 0.05;
      c.needs.rest = 0.05;
      run(sim, 5);
      expect(c.job?.type).toBe('eat');
    }
  });

  it('grows and harvests crops, then cooks meals at a stove', () => {
    const sim = Simulation.newColony(21);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    w.dropItemNear(w.idx(x, y), itemId('stone'), 40);
    sim.apply({
      type: 'zone',
      rect: { x0: x - 8, y0: y + 3, x1: x - 3, y1: y + 7 },
      zone: GROW_ZONE + featureId('potatoPlant'),
    });
    sim.apply({ type: 'zone', rect: { x0: x + 2, y0: y + 3, x1: x + 5, y1: y + 5 }, zone: STOCKPILE_ZONE });
    sim.apply({ type: 'build', feature: featureId('stove'), tiles: [w.idx(x + 3, y - 3)] });
    run(sim, HOUR * 24 * 3);
    expect(sim.stats.produced.potatoes ?? 0).toBeGreaterThanOrEqual(24);
    expect(sim.stats.produced.meal ?? 0).toBeGreaterThan(0);
  });

  it('keeps a campfire-heated room warmer than outdoors at night', () => {
    const { sim, w, x, y } = colonyWithHut(5);
    sim.apply({ type: 'build', feature: featureId('campfire'), tiles: [w.idx(x + 3, y - 4)] });
    run(sim, HOUR * 20); // 03:00 next day
    expect(sim.isNight()).toBe(true);
    const inside = w.idx(x + 6, y - 4);
    expect(sim.temperatureAt(inside)).toBeGreaterThan(sim.outdoorTemperature() + 8);
  });

  it('charges normal movement cost for walkable furniture without an explicit cost', () => {
    const sim = Simulation.newColony(12);
    const t = sim.colonists[0].tile;
    const bare = sim.world.moveCost(t);
    sim.world.setFeature(t, featureId('horseshoePin'));
    expect(sim.world.moveCost(t)).toBeGreaterThanOrEqual(bare);
  });

  it('never leaks reservations or puts items on impassable tiles', () => {
    const { sim, w, x, y } = colonyWithHut(8);
    sim.apply({ type: 'designate', rect: { x0: x - 20, y0: y - 20, x1: x + 20, y1: y + 20 }, kind: 'chop' });
    sim.apply({ type: 'zone', rect: { x0: x - 3, y0: y + 4, x1: x + 1, y1: y + 7 }, zone: STOCKPILE_ZONE });
    for (let hour = 0; hour < 48; hour++) {
      run(sim, HOUR);
      const owners = new Set(sim.colonists.flatMap((c) => c.reserved));
      for (const key of sim.reservations.keys()) {
        expect(owners.has(key)).toBe(true);
      }
      for (let i = 0; i < w.size; i++) {
        if (w.itemType[i] !== NONE) {
          expect(w.isPassable(i)).toBe(true);
        }
      }
    }
  });
});

describe('saving', () => {
  it('round-trips the world, colonists, and room temperatures', () => {
    const { sim, inside } = colonyWithHut(13);
    run(sim, HOUR * 30);
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.tick).toBe(sim.tick);
    expect(copy.world.feature).toEqual(sim.world.feature);
    expect(copy.world.itemCount).toEqual(sim.world.itemCount);
    expect(copy.colonists.map((c) => [c.mood, c.needs, c.schedule])).toEqual(
      sim.colonists.map((c) => [c.mood, c.needs, c.schedule]),
    );
    expect(copy.temperatureAt(inside)).toBeCloseTo(sim.temperatureAt(inside), 3);
  });
});
