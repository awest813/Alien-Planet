import { describe, expect, it } from 'vitest';
import { FACTIONS, featureId } from './defs';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { Visitor } from './trade';
import { triggerEvent } from './storyteller';

const KIN = FACTIONS.findIndex((f) => f.key === 'meadowKin');

// A cleared patch with a door standing in it, and an envoy waiting in the doorway.
function doorway(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  const door = w.idx(x + 4, y + 4);
  w.setFeature(door, featureId('door'));
  const visitor: Visitor = {
    id: sim.nextVisitorId++,
    name: 'Envoy Test',
    tile: door,
    path: [],
    moveProgress: 0,
    restUntil: 0,
  };
  return { sim, w, door, visitor };
}

describe('visitors shut inside walls and doors', () => {
  it('a waiting envoy standing in a doorway that is locked steps out of it (as traders do)', () => {
    const { sim, w, door, visitor } = doorway(31);
    sim.diplomacy.envoy = { faction: KIN, until: sim.tick + 3 * 24 * HOUR, visitor };
    sim.apply({ type: 'lock', tile: door, locked: true });
    expect(w.isPassable(door)).toBe(false);
    run(sim, HOUR * 6);
    // Still waiting for an answer, and out of the door (it stayed in it, its way round lost).
    expect(sim.diplomacy.envoy?.visitor).toBe(visitor);
    expect(w.isPassable(visitor.tile)).toBe(true);
  });

  it('a trader standing in the same doorway is moved off it', () => {
    const { sim, w, door, visitor } = doorway(31);
    sim.caravan = {
      faction: KIN,
      visitors: [visitor],
      stock: [],
      silver: 0,
      leaveAt: sim.tick + 30 * HOUR,
      leaving: false,
    };
    sim.apply({ type: 'lock', tile: door, locked: true });
    expect(w.isPassable(visitor.tile)).toBe(true);
  });
});

describe('traders packing up', () => {
  it('set off for the edge when they pack up, not after their last rest runs out', () => {
    const sim = Simulation.newColony(1);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y + 4, x1: x + 4, y1: y + 7 }, zone: 1 });
    expect(triggerEvent(sim, 'caravan')).toBe(true);
    for (let t = 0; t < HOUR * 40 && !sim.caravan?.leaving; t++) {
      sim.step();
    }
    expect(sim.caravan?.leaving).toBe(true);
    const start = new Map(sim.caravan!.visitors.map((v) => [v, v.tile]));
    const lingering = Math.max(...sim.caravan!.visitors.map((v) => v.restUntil - sim.tick));
    run(sim, HOUR / 2);
    // Half an hour after packing up, everyone should be on the move (or gone).
    const stillStanding = [...start].filter(([v, tile]) => sim.caravan?.visitors.includes(v) && v.tile === tile);
    expect({ lingering, stillStanding: stillStanding.length }).toEqual({ lingering, stillStanding: 0 });
    expect(w.size).toBeGreaterThan(0);
  });
});

describe('boxed in by what was built', () => {
  it('a colonist left with no step to take is put where they can walk from', () => {
    // Walls on three sides and the last side built up round a colonist in a corner, an open diagonal the only gap
    // (no way out: a diagonal step between two walls isn't taken). They stood there a month, starving.
    const sim = Simulation.newColony(5);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    const c = sim.colonists[1];
    const cx = x + 4;
    const cy = y + 4;
    c.tile = w.idx(cx, cy);
    c.path = [];
    sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    const wall = featureId('woodWall');
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [0, -1],
    ]) {
      w.setFeature(w.idx(cx + dx, cy + dy), wall);
    }
    sim.apply({ type: 'build', feature: wall, tiles: [w.idx(cx - 1, cy)] });
    for (let t = 0; t < HOUR * 12 && w.feature[w.idx(cx - 1, cy)] !== wall; t++) {
      sim.step();
    }
    expect(w.feature[w.idx(cx - 1, cy)]).toBe(wall);
    expect(w.isPassable(c.tile)).toBe(true);
    expect(w.canLeave(c.tile)).toBe(true);
  });
});
