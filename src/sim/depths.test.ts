import { describe, expect, it } from 'vitest';
import { ANIMALS, featureId, itemId } from './defs';
import { BREACH_DEPTH, breach, breachWeight, oreChances, shaftAt, shafts } from './depths';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround, run } from './test-helpers';
import { Designation } from './world';

// A quiet colony with a finished mine shaft beside it and miners ready.
function mine(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 10);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  const tile = w.idx(x + 3, y);
  sim.research.done.push('smelting', 'deepMining');
  w.addItem(w.idx(x - 2, y), itemId('wood'), 50);
  w.addItem(w.idx(x - 2, y + 1), itemId('stone'), 20);
  w.addItem(w.idx(x - 2, y + 2), itemId('stone'), 20);
  sim.apply({ type: 'build', tiles: [tile], feature: featureId('mineShaft') });
  for (const c of sim.colonists) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 1;
    c.priorities.mining = 1;
    c.priorities.construction = 1;
  }
  return { sim, w, tile };
}

const stock = (sim: Simulation, key: string) => sim.resourceTotals()[itemId(key) - 1].total;

describe('mine shafts', () => {
  it('are built, marked for digging, and dug deeper for stone and ore', () => {
    const { sim, w, tile } = mine(1);
    for (let h = 0; h < 24 && w.feature[tile] !== featureId('mineShaft'); h++) {
      run(sim, HOUR);
    }
    expect(w.feature[tile]).toBe(featureId('mineShaft'));
    expect(w.designation[tile]).toBe(Designation.MINE);
    const stone = stock(sim, 'stone');
    run(sim, HOUR * 24);
    const shaft = shaftAt(sim, tile);
    expect(shaft.depth).toBeGreaterThan(1);
    // The shaft never runs out.
    expect(w.feature[tile]).toBe(featureId('mineShaft'));
    expect(stock(sim, 'stone')).toBeGreaterThan(stone);
    // Cancelled: the miners stop.
    sim.apply({ type: 'cancel', rect: { x0: w.xOf(tile), y0: w.yOf(tile), x1: w.xOf(tile), y1: w.yOf(tile) } });
    const depth = shaft.depth;
    run(sim, HOUR * 12);
    expect(shaft.depth).toBe(depth);
  });

  it('give more ore the deeper they go, and more again past a cavern', () => {
    const shallow = oreChances({ depth: 0, cavern: false });
    const deep = oreChances({ depth: 10, cavern: false });
    const cavern = oreChances({ depth: 10, cavern: true });
    expect(deep.iron).toBeGreaterThan(shallow.iron);
    expect(deep.silver).toBeGreaterThan(shallow.silver);
    expect(cavern.iron).toBeGreaterThan(deep.iron);
  });

  it('rebuilt where one stood, goes back down the same hole', () => {
    const { sim, w, tile } = mine(6);
    for (let h = 0; h < 24 && w.feature[tile] !== featureId('mineShaft'); h++) {
      run(sim, HOUR);
    }
    shaftAt(sim, tile).depth = 9;
    // Smashed, and rebuilt.
    w.setFeature(tile, 0);
    w.addItem(w.idx(w.xOf(tile) - 5, w.yOf(tile) + 3), itemId('wood'), 50);
    w.addItem(w.idx(w.xOf(tile) - 5, w.yOf(tile) + 4), itemId('stone'), 20);
    w.addItem(w.idx(w.xOf(tile) - 5, w.yOf(tile) + 5), itemId('stone'), 20);
    sim.apply({ type: 'build', tiles: [tile], feature: featureId('mineShaft') });
    for (let h = 0; h < 24 && w.feature[tile] !== featureId('mineShaft'); h++) {
      run(sim, HOUR);
    }
    expect(w.feature[tile]).toBe(featureId('mineShaft'));
    expect(shaftAt(sim, tile).depth).toBeGreaterThanOrEqual(9);
  });

  it("can't be built over (unlike a tree or a boulder)", () => {
    const { sim, w, tile } = mine(2);
    w.setFeature(tile, featureId('mineShaft'));
    expect(sim.canPlaceBlueprint(tile, featureId('woodWall'))).toBe(false);
  });
});

describe('breaches', () => {
  it('only threaten a deep shaft, and bring crawlers up out of it', () => {
    const { sim, w, tile } = mine(3);
    w.setFeature(tile, featureId('mineShaft'));
    shaftAt(sim, tile).depth = BREACH_DEPTH - 1;
    expect(breachWeight(sim)).toBe(0);
    expect(triggerEvent(sim, 'breach')).toBe(false);
    shaftAt(sim, tile).depth = BREACH_DEPTH + 4;
    expect(breachWeight(sim)).toBeGreaterThan(0);
    expect(breach(sim, 3)).toBe(true);
    const crawlers = sim.animals.filter((a) => a.kind === 'crawler');
    expect(crawlers.length).toBe(3);
    expect(crawlers.every((a) => a.manhunter && w.distance(a.tile, tile) <= 3)).toBe(true);
    // Beyond it a cavern: richer ore, and no more breaches from that shaft.
    expect(shaftAt(sim, tile).cavern).toBe(true);
    expect(breachWeight(sim)).toBe(0);
    expect(shafts(sim)[0].tile).toBe(tile);
  });

  it('crawlers never wander in on their own', () => {
    expect(ANIMALS.crawler.weight).toBe(0);
    const sim = Simulation.newColony(4);
    expect(sim.animals.some((a) => a.kind === 'crawler')).toBe(false);
  });

  it('shafts are saved with the colony', () => {
    const { sim, w, tile } = mine(5);
    w.setFeature(tile, featureId('mineShaft'));
    shaftAt(sim, tile).depth = 7;
    const loaded = deserialize(structuredClone(serialize(sim)));
    expect(loaded.shafts[tile]).toEqual({ depth: 7, cavern: false });
  });
});
