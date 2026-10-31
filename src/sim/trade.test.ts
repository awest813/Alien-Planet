import { describe, expect, it } from 'vitest';
import { itemId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround, run } from './test-helpers';
import { STARTING_GOODWILL, applyTrade, colonyStock, goodwillOf, tradeOpen } from './trade';

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
