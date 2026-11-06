import { describe, expect, it } from 'vitest';
import { featureId, itemId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround, run } from './test-helpers';
import {
  STARTING_GOODWILL,
  applyTrade,
  artForSale,
  artPrice,
  colonyStock,
  goodwillOf,
  sellArt,
  tradeOpen,
} from './trade';

const SILVER = itemId('silver');

// A colony with a stockpile holding its silver and some goods, and traders already arrived.
function market(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y + 4, x1: x + 4, y1: y + 7 }, zone: 1 });
  w.addItem(w.idx(x - 4, y + 4), SILVER, 300);
  w.addItem(w.idx(x - 3, y + 4), itemId('cloth'), 40);
  expect(triggerEvent(sim, 'caravan')).toBe(true);
  for (let t = 0; t < HOUR * 6 && !tradeOpen(sim); t++) {
    sim.step();
  }
  return { sim, w, x, y };
}

describe('trade caravans', () => {
  it('walk in, open for business, and leave again', () => {
    const { sim } = market(1);
    expect(tradeOpen(sim)).toBe(true);
    expect(sim.caravan!.visitors.length).toBe(3);
    run(sim, HOUR * 40);
    expect(sim.caravan).toBeNull();
  });

  it('sell goods for silver from the stockpiles and buy from theirs', () => {
    const { sim } = market(2);
    const stock = sim.caravan!.stock[0];
    const before = { silver: colonyStock(sim, SILVER), cloth: colonyStock(sim, itemId('cloth')) };
    const theirsBefore = stock.count;
    expect(applyTrade(sim, [[stock.item, 1]], [[itemId('cloth'), 20]])).toBeNull();
    expect(colonyStock(sim, itemId('cloth'))).toBe(before.cloth - 20);
    expect(sim.caravan!.stock.find((s) => s.item === stock.item)?.count ?? 0).toBe(theirsBefore - 1);
    // Bought goods arrive at the colony.
    expect(sim.stockOf(stock.item)).toBeGreaterThan(0);
    expect(sim.stockOf(SILVER)).not.toBe(before.silver);
  });

  it('move silver the right way: what the colony pays, the traders gain', () => {
    const { sim } = market(6);
    const purse = sim.caravan!.silver;
    const silver = colonyStock(sim, SILVER);
    const wood = sim.caravan!.stock.find((s) => s.item === itemId('wood'))!;
    expect(applyTrade(sim, [[wood.item, 40]], [])).toBeNull();
    const paid = silver - colonyStock(sim, SILVER);
    expect(paid).toBeGreaterThan(0);
    expect(sim.caravan!.silver).toBe(purse + paid);
    // And selling: the traders pay out of their purse.
    const before = sim.caravan!.silver;
    expect(applyTrade(sim, [], [[itemId('cloth'), 40]])).toBeNull();
    expect(sim.caravan!.silver).toBeLessThan(before);
  });

  it('refuse a deal the colony cannot pay for', () => {
    const { sim } = market(3);
    const all = sim.caravan!.stock.map((s) => [s.item, s.count] as [number, number]);
    expect(applyTrade(sim, all, [])).toMatch(/silver/);
  });

  it('build goodwill with bigger deals', () => {
    const { sim } = market(4);
    const faction = sim.caravan!.faction;
    expect(goodwillOf(sim, faction)).toBe(STARTING_GOODWILL);
    expect(applyTrade(sim, [], [[itemId('cloth'), 40]])).toBeNull();
    expect(goodwillOf(sim, faction)).toBeGreaterThan(STARTING_GOODWILL);
  });

  it('survive a save', () => {
    const { sim } = market(5);
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.caravan?.visitors.length).toBe(3);
    expect(tradeOpen(copy)).toBe(true);
  });
});

describe('selling art', () => {
  // Traders in town and two sculptures standing, one finer than the other, plus a memorial.
  function gallery(seed: number) {
    const m = market(seed);
    const { sim, w, x, y } = m;
    const rough = w.idx(x + 3, y - 3);
    const fine = w.idx(x + 5, y - 3);
    const memorial = w.idx(x + 7, y - 3);
    w.setFeature(rough, featureId('sculptureSmall'));
    w.setFeature(fine, featureId('sculptureSmall'));
    w.setFeature(memorial, featureId('memorial'));
    sim.artworks.set(rough, { quality: 3, title: 'Rough', artist: 'Ada', day: 1 });
    sim.artworks.set(fine, { quality: 17, title: 'Fine', artist: 'Bram', day: 2 });
    sim.artworks.set(memorial, { quality: 10, title: 'In Memory of Kip', artist: 'Ada', day: 3, honors: [9] });
    return { ...m, rough, fine, memorial };
  }

  it('offers the colony’s sculptures, finer pieces for more, but not memorials', () => {
    const { sim, rough, fine, memorial } = gallery(11);
    const offers = artForSale(sim);
    expect(offers.map((o) => o.tile)).toEqual([fine, rough]);
    expect(offers[0].price).toBeGreaterThan(offers[1].price * 2);
    expect(offers.some((o) => o.tile === memorial)).toBe(false);
  });

  it('sells a piece where it stands: it goes, silver comes, and goodwill grows', () => {
    const { sim, w, fine } = gallery(12);
    const price = artPrice(sim, fine);
    const silver = sim.stockOf(SILVER);
    const goodwill = goodwillOf(sim, sim.caravan!.faction);
    sim.apply({ type: 'sellArt', tile: fine });
    expect(w.feature[fine]).toBe(0);
    expect(sim.artworkAt(fine)).toBeUndefined();
    expect(sim.stockOf(SILVER)).toBe(silver + price);
    expect(goodwillOf(sim, sim.caravan!.faction)).toBeGreaterThan(goodwill);
    expect(sim.stats.artSold).toBe(1);
  });

  it("won't sell what the traders can't afford, or with no traders here", () => {
    const { sim, w, fine } = gallery(13);
    sim.caravan!.silver = 1;
    expect(sellArt(sim, fine)).not.toBeNull();
    expect(w.feature[fine]).toBe(featureId('sculptureSmall'));
    sim.caravan = null;
    expect(artForSale(sim)).toEqual([]);
    expect(sellArt(sim, fine)).not.toBeNull();
  });
});
