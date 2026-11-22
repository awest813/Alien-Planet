import { describe, expect, it } from 'vitest';
import { featureId, terrainId } from './defs';
import { LONG_WALK } from './pathfinding';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';

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

  it('are kept to on a long walk too', () => {
    const sim = Simulation.newColony(13, 'standard', 128);
    const w = sim.world;
    const { x, y } = clearAround(sim, 50);
    const from = w.idx(x - 45, y);
    const to = w.idx(x + 45, y);
    for (let tx = x - 43; tx <= x + 43; tx++) {
      w.setLayer('floor', w.idx(tx, y + 2), featureId('road'));
    }
    const path = sim.pathfinder.find(from, [to])!;
    const onRoad = path.filter((i) => w.floor[i] === featureId('road')).length;
    expect(onRoad).toBeGreaterThan(80);
  });

  it('leave a long walk with no floor out in the open near it searched boldly, and no longer for it', () => {
    const sim = Simulation.newColony(14, 'standard', 192);
    const w = sim.world;
    const cost = (start: number, path: number[]) => {
      let c = 0;
      let prev = start;
      for (const i of path) {
        c += w.moveCost(i) * (w.xOf(i) !== w.xOf(prev) && w.yOf(i) !== w.yOf(prev) ? Math.SQRT2 : 1);
        prev = i;
      }
      return c;
    };
    let walks = 0;
    for (let k = 0; k < 40; k++) {
      const from = sim.rng.int(0, w.size - 1);
      const to = sim.rng.int(0, w.size - 1);
      if (!w.isPassable(from) || !w.isPassable(to) || w.distance(from, to) < LONG_WALK * 1.5) {
        continue;
      }
      const bold = sim.pathfinder.find(from, [to]);
      // (A weight a hair over 1 is searched as asked: the careful search, for comparison.)
      const careful = sim.pathfinder.find(from, [to], undefined, 1 + 1e-9);
      expect(!!bold).toBe(!!careful);
      if (bold && careful) {
        expect(cost(from, bold)).toBeLessThanOrEqual(cost(from, careful) * 1.02);
        walks++;
      }
    }
    expect(walks).toBeGreaterThan(5);
  });

  it('count a road as floor in the open, and a floored room not (a room is roofed, the roof layer or not)', () => {
    const sim = Simulation.newColony(15, 'standard', 128);
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    const near = () =>
      (
        sim.pathfinder as unknown as { openFloorNear(x0: number, y0: number, x1: number, y1: number): boolean }
      ).openFloorNear(x, y, x, y);
    expect(near()).toBe(false);
    // A walled room with a wood floor: indoors.
    for (const i of outline(w, x + 2, y + 2, x + 6, y + 6)) {
      w.setFeature(i, featureId('woodWall'));
    }
    for (let ty = y + 3; ty <= y + 5; ty++) {
      for (let tx = x + 3; tx <= x + 5; tx++) {
        w.setLayer('floor', w.idx(tx, ty), featureId('woodFloor'));
      }
    }
    expect(sim.isIndoors(w.idx(x + 4, y + 4))).toBe(true);
    expect(near()).toBe(false);
    // A stretch of road outside it.
    w.setLayer('floor', w.idx(x - 4, y), featureId('road'));
    expect(near()).toBe(true);
  });
});
