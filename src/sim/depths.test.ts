import { describe, expect, it } from 'vitest';
import { ANIMALS, featureId, itemId } from './defs';
import { BREACH_DEPTH, MAX_DEPTH, breach, breachWeight, digDeeper, oreChances, shaftAt, shafts } from './depths';
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

  it('can be roofed over, without the roof marking it for digging', () => {
    const { sim, w, tile } = mine(7);
    for (let h = 0; h < 24 && w.feature[tile] !== featureId('mineShaft'); h++) {
      run(sim, HOUR);
    }
    const at = { x0: w.xOf(tile), y0: w.yOf(tile), x1: w.xOf(tile), y1: w.yOf(tile) };
    sim.apply({ type: 'cancel', rect: at });
    w.addItem(w.idx(w.xOf(tile) - 5, w.yOf(tile) + 3), itemId('wood'), 10);
    sim.apply({ type: 'build', tiles: [tile], feature: featureId('roof') });
    expect(w.designation[tile]).toBe(Designation.NONE);
    run(sim, HOUR * 8);
    expect(w.roof[tile]).toBe(featureId('roof'));
    expect(w.feature[tile]).toBe(featureId('mineShaft'));
  });

  it('stopped, stay stopped when rebuilt; ordered down, the miner leaves off', () => {
    const { sim, w, tile } = mine(8);
    for (let h = 0; h < 24 && w.feature[tile] !== featureId('mineShaft'); h++) {
      run(sim, HOUR);
    }
    const at = { x0: w.xOf(tile), y0: w.yOf(tile), x1: w.xOf(tile), y1: w.yOf(tile) };
    // Someone's digging; then it's ordered taken down.
    for (let t = 0; t < HOUR * 6 && !sim.colonists.some((c) => c.job?.type === 'mine'); t++) {
      sim.step();
    }
    expect(sim.colonists.some((c) => c.job?.type === 'mine')).toBe(true);
    sim.apply({ type: 'designate', kind: 'deconstruct', rect: at });
    run(sim, 30);
    expect(sim.colonists.some((c) => c.job?.type === 'mine')).toBe(false);
    // Stopped, smashed and rebuilt: still stopped.
    sim.apply({ type: 'cancel', rect: at });
    w.setFeature(tile, 0);
    w.addItem(w.idx(w.xOf(tile) - 5, w.yOf(tile) + 3), itemId('wood'), 50);
    w.addItem(w.idx(w.xOf(tile) - 5, w.yOf(tile) + 4), itemId('stone'), 20);
    w.addItem(w.idx(w.xOf(tile) - 5, w.yOf(tile) + 5), itemId('stone'), 20);
    sim.apply({ type: 'build', tiles: [tile], feature: featureId('mineShaft') });
    for (let h = 0; h < 24 && w.feature[tile] !== featureId('mineShaft'); h++) {
      run(sim, HOUR);
    }
    expect(w.feature[tile]).toBe(featureId('mineShaft'));
    expect(w.designation[tile]).toBe(Designation.NONE);
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
    w.designation[tile] = Designation.MINE;
    shaftAt(sim, tile).depth = BREACH_DEPTH - 1;
    expect(breachWeight(sim)).toBe(0);
    expect(triggerEvent(sim, 'breach')).toBe(false);
    shaftAt(sim, tile).depth = BREACH_DEPTH + 4;
    expect(breachWeight(sim)).toBeGreaterThan(0);
    expect(breach(sim, 3)).toBe(true);
    const crawlers = sim.animals.filter((a) => a.kind === 'crawler');
    expect(crawlers.length).toBe(3);
    expect(crawlers.every((a) => a.manhunter && w.distance(a.tile, tile) <= 3)).toBe(true);
    // Beyond it a cavern: richer ore, and quiet for a while...
    expect(shaftAt(sim, tile).cavern).toBe(true);
    expect(breachWeight(sim)).toBe(0);
    expect(breach(sim, 3)).toBe(false);
    // ...until they dig on far enough.
    shaftAt(sim, tile).depth += 15;
    expect(breachWeight(sim)).toBeGreaterThan(0);
    expect(shafts(sim)[0].tile).toBe(tile);
  });

  it('bring nothing up where nobody could be reached, and maddened beasts with no one to chase go home', () => {
    const { sim, w, tile } = mine(9);
    w.setFeature(tile, featureId('mineShaft'));
    w.designation[tile] = Designation.MINE;
    shaftAt(sim, tile).depth = BREACH_DEPTH + 2;
    // Walled in on every side.
    for (const n of w.neighbors(tile, true)) {
      w.setFeature(n, featureId('woodWall'));
    }
    expect(breach(sim, 3)).toBe(false);
    // One that somehow has nobody to go for gives up.
    for (const n of w.neighbors(tile, true)) {
      w.setFeature(n, 0);
    }
    expect(breach(sim, 1)).toBe(true);
    const crawler = sim.animals.find((a) => a.kind === 'crawler')!;
    crawler.revengeOn = -1;
    crawler.revengeUntil = sim.tick;
    run(sim, 5);
    expect(crawler.manhunter).toBe(false);
    expect(crawler.leaving).toBe(true);
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

describe('a shaft at bedrock', () => {
  it("doesn't announce its depth again at every stretch, and can still be breached", () => {
    const sim = Simulation.newColony(9);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    const tile = w.idx(x + 3, y);
    w.setFeature(tile, featureId('mineShaft'));
    const shaft = shaftAt(sim, tile);
    w.designation[tile] = Designation.MINE;
    shaft.depth = MAX_DEPTH - 1;
    shaft.quietTo = MAX_DEPTH;
    const before = sim.log.length;
    for (let k = 0; k < 5; k++) {
      digDeeper(sim, sim.colonists[0], tile);
    }
    const said = sim.log.slice(before).map((l) => l.text);
    expect(said.filter((t) => t.includes('bedrock')).length).toBe(1);
    expect(said.filter((t) => t.includes('hear things moving')).length).toBe(1);
    expect(said.filter((t) => t.includes('has dug the mine shaft down')).length).toBeLessThanOrEqual(1);
    // A breach at depth 50 leaves it quiet no deeper than bedrock, so it can stir again.
    shaft.depth = 50;
    shaft.quietTo = undefined;
    breach(sim, 2);
    expect(shaft.quietTo).toBeLessThanOrEqual(MAX_DEPTH);
  });
});

describe('a shaft left alone', () => {
  it('stays quiet: only one being dug can break through', () => {
    const { sim, w, tile } = mine(4);
    w.setFeature(tile, featureId('mineShaft'));
    shaftAt(sim, tile).depth = BREACH_DEPTH + 10;
    w.designation[tile] = Designation.NONE;
    expect(breachWeight(sim)).toBe(0);
    expect(breach(sim, 3)).toBe(false);
    w.designation[tile] = Designation.MINE;
    expect(breachWeight(sim)).toBeGreaterThan(0);
  });
});
