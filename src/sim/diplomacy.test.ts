import { describe, expect, it } from 'vitest';
import { QUARRY_TOUGHNESS } from './animals';
import { FACTIONS, itemId, quantity } from './defs';
import {
  atPeace,
  decline,
  fulfil,
  gift,
  giftGoodwill,
  makeRequest,
  onGoodTerms,
  payTribute,
  tributeCost,
  updateDiplomacy,
} from './diplomacy';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround, run } from './test-helpers';
import { STARTING_GOODWILL, colonyStock, goodwillOf } from './trade';

const SILVER = itemId('silver');
const KIN = FACTIONS.find((f) => !f.hostile)!.id;
const RAIDERS = FACTIONS.filter((f) => f.hostile).map((f) => f.id);

// A colony with a stockpile holding silver, no events.
function colony(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y + 4, x1: x + 4, y1: y + 7 }, zone: 1 });
  w.addItem(w.idx(x - 4, y + 4), SILVER, 300);
  const stock = (item: number, count: number) => w.addItem(w.idx(x, y + 6), item, count);
  return { sim, w, x, y, stock };
}

describe('requests', () => {
  it('come from the neighbours mid-morning, once the colony is settled', () => {
    const { sim } = colony(1);
    sim.diplomacy.nextRequestDay = sim.day;
    for (let h = 0; h < 30 && !sim.diplomacy.request; h++) {
      run(sim, HOUR);
    }
    expect(sim.diplomacy.request).not.toBeNull();
    expect(sim.diplomacy.request!.faction).toBe(KIN);
    expect(Math.floor(sim.hour)).toBe(9);
  });

  it('for goods: sending them from the stockpiles pays, and wins goodwill', () => {
    const { sim, stock } = colony(2);
    makeRequest(sim, KIN, 'deliver');
    const r = sim.diplomacy.request!;
    r.recruit = false;
    // Not enough yet.
    expect(fulfil(sim)).toMatch(/Only/);
    expect(sim.diplomacy.request).toBe(r);
    stock(r.item, r.count + 3);
    const silver = colonyStock(sim, SILVER);
    expect(fulfil(sim)).toBeNull();
    expect(sim.diplomacy.request).toBeNull();
    expect(colonyStock(sim, r.item)).toBe(3);
    expect(goodwillOf(sim, KIN)).toBe(STARTING_GOODWILL + r.goodwill);
    expect(sim.stats.requestsDone).toBe(1);
    // The silver is dropped at home, to be hauled in.
    run(sim, HOUR * 6);
    expect(colonyStock(sim, SILVER)).toBeGreaterThan(silver);
  });

  it('can bring a new colonist instead of silver', () => {
    const { sim, stock } = colony(3);
    makeRequest(sim, KIN, 'deliver');
    const r = sim.diplomacy.request!;
    r.recruit = true;
    stock(r.item, r.count);
    const before = sim.colonists.length;
    fulfil(sim);
    expect(sim.colonists.length).toBe(before + 1);
  });

  it('turned down, or let lapse, cost goodwill', () => {
    const { sim } = colony(4);
    makeRequest(sim, KIN, 'deliver');
    decline(sim);
    expect(goodwillOf(sim, KIN)).toBe(STARTING_GOODWILL - 3);
    makeRequest(sim, KIN, 'deliver');
    sim.tick = sim.diplomacy.request!.until;
    updateDiplomacy(sim);
    expect(sim.diplomacy.request).toBeNull();
    expect(goodwillOf(sim, KIN)).toBe(STARTING_GOODWILL - 11);
    expect(sim.stats.requestsFailed).toBe(2);
  });

  it('for a hunt: a tough great boar that stays until it is killed', () => {
    const { sim } = colony(5);
    makeRequest(sim, KIN, 'hunt');
    const r = sim.diplomacy.request!;
    const beast = sim.animals.find((a) => a.id === r.quarry)!;
    expect(beast.quarry).toBe(true);
    expect(beast.hp).toBeGreaterThan(QUARRY_TOUGHNESS);
    // It can't be tamed instead.
    const all = { x0: 0, y0: 0, x1: sim.world.width - 1, y1: sim.world.height - 1 };
    sim.apply({ type: 'tame', rect: all, add: true });
    expect(beast.taming).toBe(false);
    // A day later it's still about.
    sim.colonists.forEach((c) => (c.priorities.hunting = 0));
    run(sim, HOUR * 24);
    expect(sim.animals.find((a) => a.id === r.quarry)?.leaving).toBeFalsy();
    // Killed: the request is done.
    sim.animals = sim.animals.filter((a) => a !== beast);
    updateDiplomacy(sim);
    expect(sim.diplomacy.request).toBeNull();
    expect(sim.stats.requestsDone).toBe(1);
  });
});

describe('gifts and tribute', () => {
  it('gifts of silver win goodwill, less the better they already like you', () => {
    const { sim } = colony(6);
    const small = giftGoodwill(sim, KIN, 50);
    expect(gift(sim, KIN, 50)).toBeNull();
    expect(goodwillOf(sim, KIN)).toBe(STARTING_GOODWILL + small);
    expect(colonyStock(sim, SILVER)).toBe(250);
    sim.goodwill[KIN] = 90;
    expect(giftGoodwill(sim, KIN, 50)).toBeLessThan(small);
    // Raiders just take it.
    expect(gift(sim, RAIDERS[0], 50)).not.toBeNull();
    expect(gift(sim, KIN, 1000)).toMatch(/Not enough/);
    // Nothing for nothing.
    const now = goodwillOf(sim, KIN);
    expect(gift(sim, KIN, 0)).not.toBeNull();
    expect(gift(sim, KIN, -50)).not.toBeNull();
    expect(goodwillOf(sim, KIN)).toBe(now);
  });

  it('wary neighbours stop trading and sending supplies', () => {
    const { sim } = colony(7);
    expect(onGoodTerms(sim, KIN)).toBe(true);
    sim.goodwill[KIN] = -5;
    expect(onGoodTerms(sim, KIN)).toBe(false);
    sim.diplomacy.nextRequestDay = 0;
    run(sim, HOUR * 30);
    expect(sim.diplomacy.request).toBeNull();
    // Hard feelings fade, slowly.
    run(sim, HOUR * 24 * 4);
    expect(goodwillOf(sim, KIN)).toBeGreaterThan(-5);
    expect(goodwillOf(sim, KIN)).toBeLessThan(0);
  });

  it('tribute buys peace from raiders for a while', () => {
    const { sim } = colony(8);
    const cost = tributeCost(sim);
    expect(payTribute(sim, KIN)).not.toBeNull();
    expect(payTribute(sim, RAIDERS[0])).toBeNull();
    expect(colonyStock(sim, SILVER)).toBe(300 - cost);
    expect(atPeace(sim, RAIDERS[0])).toBe(true);
    // The others still come.
    for (let k = 0; k < 5; k++) {
      sim.enemies = [];
      expect(triggerEvent(sim, 'raid')).toBe(true);
      expect(sim.enemies.every((e) => e.faction !== RAIDERS[0])).toBe(true);
    }
    // Paid them all off: no raid at all.
    for (const f of RAIDERS) {
      sim.diplomacy.peaceUntil[f] = sim.tick + HOUR * 24;
    }
    sim.enemies = [];
    expect(triggerEvent(sim, 'raid')).toBe(false);
    // And it wears off.
    sim.tick += HOUR * 24 * 13;
    expect(atPeace(sim, RAIDERS[0])).toBe(false);
  });

  it('tribute paid mid-raid sends those raiders home without plunder', () => {
    const { sim } = colony(10);
    sim.enemies = [];
    expect(triggerEvent(sim, 'raid')).toBe(true);
    const faction = sim.enemies[0].faction;
    expect(payTribute(sim, faction)).toBeNull();
    expect(sim.enemies.every((e) => e.fleeing)).toBe(true);
    expect(sim.raid!.outcome).toBe('withdrew');
  });

  it('are saved with the colony, along with any request', () => {
    const { sim } = colony(9);
    makeRequest(sim, KIN, 'hunt');
    payTribute(sim, RAIDERS[0]);
    const loaded = deserialize(structuredClone(serialize(sim)));
    expect(loaded.diplomacy).toEqual(sim.diplomacy);
    expect(loaded.animals.find((a) => a.quarry)?.id).toBe(sim.diplomacy.request!.quarry);
  });
});

describe('quantities', () => {
  it('count meals and kit one by one, and wood and silver by the heap', () => {
    expect(quantity(itemId('meal'), 10)).toBe('10 simple meals');
    expect(quantity(itemId('meal'), 1)).toBe('1 simple meal');
    expect(quantity(itemId('knife'), 2)).toBe('2 knives');
    expect(quantity(itemId('recurveBow'), 3)).toBe('3 recurve bows');
    expect(quantity(itemId('wood'), 40)).toBe('40 wood');
    expect(quantity(itemId('herbalMedicine'), 5)).toBe('5 herbal medicine');
  });
});
