import { describe, expect, it } from 'vitest';
import { featureId, terrainId } from './defs';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';

// A road: packed earth, laid for the work alone, and quicker going than grass or sand.
describe('roads', () => {
  it('are laid by the colonists with no materials, and are quicker to walk than grass or sand', () => {
    const sim = Simulation.newColony(11);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    const road = featureId('road');
    const tiles = Array.from({ length: 8 }, (_, k) => w.idx(x - 4 + k, y + 3));
    w.setTerrain(tiles[7], terrainId('sand'));
    const grass = w.moveCost(tiles[0]);
    const sand = w.moveCost(tiles[7]);
    sim.apply({ type: 'build', feature: road, tiles });
    expect(tiles.every((i) => w.blueprint[i] === road)).toBe(true);
    // Nothing to fetch: the tile says only what's to be built.
    run(sim, HOUR * 8);
    expect(tiles.filter((i) => w.floor[i] === road)).toEqual(tiles);
    expect(w.moveCost(tiles[0])).toBeLessThan(grass);
    expect(w.moveCost(tiles[7])).toBeLessThan(sand);
  });

  it('are what a long walk keeps to', () => {
    const sim = Simulation.newColony(12);
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    // A road along a row two tiles off the straight line between the ends: the walk bends to it.
    const from = w.idx(x - 12, y);
    const to = w.idx(x + 12, y);
    for (let tx = x - 10; tx <= x + 10; tx++) {
      w.setLayer('floor', w.idx(tx, y + 2), featureId('road'));
    }
    const path = sim.pathfinder.find(from, [to])!;
    const onRoad = path.filter((i) => w.floor[i] === featureId('road')).length;
    expect(onRoad).toBeGreaterThan(15);
  });
});
