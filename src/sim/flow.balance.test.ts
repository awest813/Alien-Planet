import { describe, expect, it } from 'vitest';
import { animalsAtDawn, wildCap, wildCount } from './animals';
import { ANIMALS, NONE, featureId, itemId } from './defs';
import { spreadWildPlants } from './plants';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { GROW_ZONE } from './world';

describe('game flow', () => {
  it('sends colonists mining before chopping when the builders are waiting on stone', () => {
    const sim = Simulation.newColony(4);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    // A big chop order, a little rock to mine, and a stove waiting on granite.
    for (let dx = -8; dx <= 8; dx += 2) {
      w.setFeature(w.idx(x + dx, y - 8), featureId('tree'));
    }
    const rocks = [w.idx(x + 6, y + 6), w.idx(x + 7, y + 6)];
    for (const r of rocks) {
      w.setFeature(r, featureId('rock'));
    }
    sim.apply({ type: 'designate', kind: 'chop', rect: { x0: x - 8, y0: y - 8, x1: x + 8, y1: y - 8 } });
    sim.apply({ type: 'designate', kind: 'mine', rect: { x0: x + 6, y0: y + 6, x1: x + 7, y1: y + 6 } });
    sim.apply({ type: 'build', feature: featureId('stove'), tiles: [w.idx(x + 2, y + 2)] });
    let mined = -1;
    let chopped = -1;
    for (let t = 0; t < HOUR * 8 && (mined < 0 || chopped < 0); t++) {
      sim.step();
      if (mined < 0 && rocks.every((r) => w.feature[r] === NONE)) {
        mined = t;
      }
      if (chopped < 0 && sim.stockOf(itemId('wood')) > 0 && w.feature[w.idx(x + 8, y - 8)] === NONE) {
        chopped = t;
      }
    }
    expect(mined).toBeGreaterThanOrEqual(0);
    expect(chopped < 0 || mined < chopped).toBe(true);
  });

  it('lets a few grazers wander back into a hunted-out valley', () => {
    const sim = Simulation.newColony(9);
    sim.animals = [];
    let arrived = 0;
    for (let day = 0; day < 10; day++) {
      animalsAtDawn(sim);
      arrived = wildCount(sim);
    }
    expect(arrived).toBeGreaterThan(0);
    expect(arrived).toBeLessThanOrEqual(wildCap(sim));
    expect(sim.animals.every((a) => !ANIMALS[a.kind].preys)).toBe(true);
  });

  it("doesn't sprout trees inside a walled room", () => {
    const sim = Simulation.newColony(12);
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    const gx = x + 20 < w.width - 6 ? x + 20 : x - 24;
    // A walled room with no roof, a grove inside it.
    for (let dy = 0; dy <= 5; dy++) {
      for (let dx = 0; dx <= 5; dx++) {
        const edge = dx === 0 || dy === 0 || dx === 5 || dy === 5;
        w.setFeature(w.idx(gx + dx, y + dy), edge ? featureId('stoneWall') : NONE);
      }
    }
    w.setFeature(w.idx(gx + 1, y + 1), featureId('tree'));
    sim.wildCover = w.size;
    for (let day = 0; day < 300; day++) {
      spreadWildPlants(sim);
    }
    let inside = 0;
    for (let dy = 1; dy <= 4; dy++) {
      for (let dx = 1; dx <= 4; dx++) {
        inside += w.feature[w.idx(gx + dx, y + dy)] === featureId('tree') ? 1 : 0;
      }
    }
    expect(inside).toBe(1);
  });

  it('regrows trees beside the forest but not in zones or near home', () => {
    const sim = Simulation.newColony(11);
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    // Clear the map of wild plants except a small grove, far from home.
    for (let i = 0; i < w.size; i++) {
      if (w.feature[i] === featureId('tree') || w.feature[i] === featureId('berryBush')) {
        w.setFeature(i, NONE);
      }
    }
    const gx = x + 20 < w.width - 4 ? x + 20 : x - 20;
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        w.setFeature(w.idx(gx + dx, y + dy), featureId('tree'));
      }
    }
    // A growing zone right beside the grove stays clear.
    sim.apply({
      type: 'zone',
      rect: { x0: gx + 3, y0: y, x1: gx + 3, y1: y + 2 },
      zone: GROW_ZONE + featureId('potatoPlant'),
    });
    const before = sim.countFeature((f) => f === featureId('tree'));
    for (let day = 0; day < 200; day++) {
      spreadWildPlants(sim);
    }
    expect(sim.countFeature((f) => f === featureId('tree'))).toBeGreaterThan(before);
    for (let dy = 0; dy < 3; dy++) {
      expect(w.feature[w.idx(gx + 3, y + dy)]).not.toBe(featureId('tree'));
    }
    for (let i = 0; i < w.size; i++) {
      if (w.feature[i] === featureId('tree')) {
        expect(w.distance(i, sim.homeTile() ?? sim.colonists[0].tile)).toBeGreaterThan(10);
      }
    }
    run(sim, 1);
  });
});
