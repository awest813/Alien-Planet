import { describe, expect, it } from 'vitest';
import {
  ALLIANCE_DAYS,
  ALLY_HELP,
  ENVOY_GOODWILL,
  REFUSE_LOSS,
  SIDE_GAIN,
  SIDE_LOSS,
  alliedWith,
  answerCall,
  answerEnvoy,
  helperFaction,
  settleDispute,
  updateAlliances,
} from './alliances';
import { maybeSendAllies, spawnRaid } from './combat';
import { FACTIONS, NONE, itemId } from './defs';
import { makeRequest, onGoodTerms, updateDiplomacy } from './diplomacy';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround, run } from './test-helpers';
import { colonyStock, goodwillOf, startingGoodwill } from './trade';

const KIN = FACTIONS.findIndex((f) => f.key === 'meadowKin');
const HILLS = FACTIONS.findIndex((f) => f.key === 'hollowstone');
const DAY = HOUR * 24;

function colony(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y + 4, x1: x + 4, y1: y + 7 }, zone: 1 });
  // Into the stockpile, wherever there's room for it.
  const stock = (item: number, count: number) => {
    let left = count;
    for (let ty = y + 4; ty <= y + 7; ty++) {
      for (let tx = x - 4; tx <= x + 4; tx++) {
        const i = w.idx(tx, ty);
        if (left > 0 && (w.itemType[i] === NONE || w.itemType[i] === item)) {
          left = w.addItem(i, item, left);
        }
      }
    }
  };
  return { sim, w, x, y, stock };
}

// Runs the hourly diplomacy until something turns up (or the hours run out).
function hours(sim: Simulation, n: number, until: () => boolean) {
  for (let h = 0; h < n && !until(); h++) {
    sim.tick += HOUR;
    updateDiplomacy(sim);
    updateAlliances(sim);
  }
}

describe('a second friendly faction', () => {
  it('the Hollowstone Clans keep to themselves until the colony has dealt with them', () => {
    const { sim } = colony(1);
    expect(goodwillOf(sim, HILLS)).toBe(startingGoodwill(HILLS));
    expect(goodwillOf(sim, HILLS)).toBeLessThan(goodwillOf(sim, KIN));
    expect(onGoodTerms(sim, HILLS)).toBe(false);
    // Neither caravans nor requests from them yet.
    sim.tick = DAY * 6;
    for (let k = 0; k < 6; k++) {
      sim.caravan = null;
      expect(triggerEvent(sim, 'caravan')).toBe(true);
      expect(sim.caravan!.faction).toBe(KIN);
    }
    sim.goodwill[HILLS] = 30;
    sim.goodwill[KIN] = 30;
    const seen = new Set<number>();
    for (let k = 0; k < 20; k++) {
      sim.caravan = null;
      triggerEvent(sim, 'caravan');
      seen.add(sim.caravan!.faction);
      // The hill clans trade in metal and stone.
      if (sim.caravan!.faction === HILLS) {
        expect(sim.caravan!.stock.some((s) => s.item === itemId('iron'))).toBe(true);
        expect(sim.caravan!.stock.some((s) => s.item === itemId('potatoes'))).toBe(false);
      }
    }
    expect([...seen].sort()).toEqual([KIN, HILLS].sort());
  });

  it('the neighbours take turns to ask favours', () => {
    const { sim } = colony(2);
    sim.goodwill[HILLS] = 30;
    const askers: number[] = [];
    for (let k = 0; k < 4; k++) {
      sim.diplomacy.request = null;
      sim.diplomacy.nextRequestDay = 0;
      hours(sim, 30, () => sim.diplomacy.request !== null);
      askers.push(sim.diplomacy.request!.faction);
    }
    expect(askers).toEqual([KIN, HILLS, KIN, HILLS]);
  });
});

describe('quarrels', () => {
  it('come now and then; backing one side pleases them and offends the other', () => {
    const { sim } = colony(3);
    sim.tick = DAY * 13;
    hours(sim, 24 * 4, () => !!sim.diplomacy.dispute);
    const d = sim.diplomacy.dispute!;
    expect(d).toBeTruthy();
    expect([d.a, d.b].sort()).toEqual([KIN, HILLS].sort());
    const kin = goodwillOf(sim, KIN);
    const hills = goodwillOf(sim, HILLS);
    expect(settleDispute(sim, HILLS)).toBeNull();
    expect(goodwillOf(sim, HILLS)).toBe(hills + SIDE_GAIN);
    expect(goodwillOf(sim, KIN)).toBe(kin - SIDE_LOSS);
    expect(sim.diplomacy.dispute).toBeNull();
    expect(settleDispute(sim, KIN)).not.toBeNull();
  });

  it('left unanswered, the colony stayed out of it, and neither is pleased', () => {
    const { sim } = colony(4);
    sim.tick = DAY * 13;
    hours(sim, 24 * 4, () => !!sim.diplomacy.dispute);
    const kin = goodwillOf(sim, KIN);
    const hills = goodwillOf(sim, HILLS);
    // (Survives a save.)
    const loaded = deserialize(structuredClone(serialize(sim)));
    expect(loaded.diplomacy.dispute).toEqual(sim.diplomacy.dispute);
    hours(loaded, 24 * 3 + 1, () => !loaded.diplomacy.dispute);
    expect(loaded.diplomacy.dispute).toBeNull();
    expect(goodwillOf(loaded, KIN)).toBeLessThan(kin);
    expect(goodwillOf(loaded, HILLS)).toBeLessThan(hills + 1);
  });
});

describe('envoys and alliances', () => {
  it('an envoy comes from a faction that likes the colony, and an alliance offends the other', () => {
    const { sim } = colony(5);
    sim.goodwill[KIN] = ENVOY_GOODWILL + 5;
    sim.tick = DAY * 20;
    sim.diplomacy.nextDisputeDay = 1000;
    hours(sim, 24 * 2, () => !!sim.diplomacy.envoy);
    expect(sim.diplomacy.envoy?.faction).toBe(KIN);
    const hills = goodwillOf(sim, HILLS);
    expect(answerEnvoy(sim, true)).toBeNull();
    expect(alliedWith(sim, KIN)).toBe(true);
    expect(goodwillOf(sim, HILLS)).toBeLessThan(hills);
    expect(sim.diplomacy.alliance!.until).toBe(sim.tick + ALLIANCE_DAYS * DAY);
    // It runs its course.
    sim.tick += ALLIANCE_DAYS * DAY;
    updateAlliances(sim);
    expect(alliedWith(sim, KIN)).toBe(false);
  });

  it("sending the envoy home costs a little; nobody comes from a faction that doesn't like the colony", () => {
    const { sim } = colony(6);
    sim.tick = DAY * 20;
    sim.diplomacy.nextDisputeDay = 1000;
    hours(sim, 24 * 2, () => !!sim.diplomacy.envoy);
    expect(sim.diplomacy.envoy).toBeFalsy();
    sim.goodwill[HILLS] = 60;
    sim.diplomacy.nextEnvoyDay = 0;
    hours(sim, 24 * 2, () => !!sim.diplomacy.envoy);
    expect(sim.diplomacy.envoy?.faction).toBe(HILLS);
    expect(answerEnvoy(sim, false)).toBeNull();
    expect(goodwillOf(sim, HILLS)).toBeLessThan(60);
    expect(sim.diplomacy.alliance ?? null).toBeNull();
  });

  it('the envoy walks in to wait about the colony, and walks off home with the answer', () => {
    const { sim } = colony(6);
    sim.goodwill[HILLS] = 60;
    sim.tick = DAY * 20;
    // (Fair weather: in the rain an envoy waits under whatever shelter there is, wherever that is.)
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    sim.diplomacy.nextDisputeDay = 1000;
    sim.diplomacy.nextEnvoyDay = 0;
    hours(sim, 24 * 2, () => !!sim.diplomacy.envoy);
    const envoy = sim.diplomacy.envoy!.visitor!;
    expect(envoy.name).toMatch(/^Envoy /);
    const w = sim.world;
    // From the map edge to the middle of the colony.
    expect(w.distance(envoy.tile, sim.homeTile()!)).toBeGreaterThan(10);
    let closest = Infinity;
    for (let k = 0; k < 12; k++) {
      run(sim, HOUR);
      closest = Math.min(closest, w.distance(envoy.tile, sim.homeTile()!));
    }
    expect(closest).toBeLessThan(6);
    answerEnvoy(sim, false);
    expect(sim.diplomacy.departing).toContain(envoy);
    run(sim, DAY);
    expect(sim.diplomacy.departing).toHaveLength(0);
    // Saved and loaded mid-visit.
    expect(deserialize(structuredClone(serialize(sim))).diplomacy.departing).toEqual([]);
  });

  it("an ally's fighters come to raids more readily, under their own name", () => {
    const { sim } = colony(7);
    expect(helperFaction(sim)).toBe(KIN);
    sim.goodwill[HILLS] = 40;
    sim.diplomacy.alliance = { faction: HILLS, until: sim.tick + DAY * 10, nextCallDay: 1000 };
    expect(helperFaction(sim)).toBe(HILLS);
    let came = 0;
    for (let k = 0; k < 200; k++) {
      sim.raid = null;
      sim.enemies = [];
      spawnRaid(sim, 0, 3);
      maybeSendAllies(sim);
      came += (sim as Simulation).raid?.allies ? 1 : 0;
    }
    // Goodwill 40 alone gives a 7% chance; the alliance adds 20 points.
    expect(ALLY_HELP).toBe(0.2);
    expect(came).toBeGreaterThan(30);
    expect(came).toBeLessThan(80);
  });

  it('an ally under attack asks for help: goods answer it, refusing ends the alliance', () => {
    const { sim, stock } = colony(8);
    sim.goodwill[KIN] = 60;
    sim.tick = DAY * 20;
    sim.diplomacy.nextDisputeDay = 1000;
    sim.diplomacy.alliance = { faction: KIN, until: sim.tick + DAY * 30, nextCallDay: 0 };
    hours(sim, 30, () => !!sim.diplomacy.call);
    const call = sim.diplomacy.call!;
    expect(call.faction).toBe(KIN);
    const had = colonyStock(sim, call.item);
    if (had < call.count) {
      expect(answerCall(sim, 'goods')).toMatch(/Only/);
    }
    stock(call.item, call.count);
    expect(answerCall(sim, 'goods')).toBeNull();
    expect(colonyStock(sim, call.item)).toBe(had);
    expect(goodwillOf(sim, KIN)).toBeGreaterThan(60);
    // The next call, let lapse: they break it off.
    sim.diplomacy.alliance!.nextCallDay = 0;
    hours(sim, 30, () => !!sim.diplomacy.call);
    const before = goodwillOf(sim, KIN);
    hours(sim, 24 * 3, () => !sim.diplomacy.call);
    expect(sim.diplomacy.call).toBeNull();
    expect(goodwillOf(sim, KIN)).toBeLessThanOrEqual(before - REFUSE_LOSS + 1);
    expect(alliedWith(sim, KIN)).toBe(false);
    expect(sim.stats.callsRefused).toBe(1);
  });

  it('a call for help ends with the alliance, at no cost, and none comes too late to answer', () => {
    const { sim } = colony(12);
    sim.goodwill[KIN] = 60;
    sim.diplomacy.alliance = { faction: KIN, until: sim.tick + HOUR * 5, nextCallDay: 1000 };
    sim.diplomacy.call = { faction: KIN, until: sim.tick + DAY * 2, item: itemId('meal'), count: 5 };
    run(sim, DAY * 3);
    expect(sim.diplomacy.alliance).toBeNull();
    expect(sim.diplomacy.call).toBeNull();
    expect(goodwillOf(sim, KIN)).toBeGreaterThanOrEqual(55);
    expect(sim.log.some((l) => l.text.includes('broken off the alliance'))).toBe(false);
    // An alliance a day from its end asks nothing.
    sim.diplomacy.alliance = { faction: KIN, until: sim.tick + DAY, nextCallDay: 0 };
    run(sim, DAY / 2);
    expect(sim.diplomacy.call).toBeNull();
  });

  it('lending a colonist: they go off to help, and come back to the ally’s thanks', () => {
    const { sim } = colony(9);
    sim.goodwill[KIN] = 60;
    sim.diplomacy.alliance = { faction: KIN, until: sim.tick + DAY * 30, nextCallDay: 1000 };
    sim.diplomacy.call = { faction: KIN, until: sim.tick + DAY * 2, item: itemId('meal'), count: 999 };
    const lent = sim.colonists[1];
    expect(answerCall(sim, lent.id)).toBeNull();
    expect(sim.diplomacy.call).toBeNull();
    expect(lent.away).toBe('leaving');
    expect(sim.living()).not.toContain(lent);
    run(sim, DAY * 3 + HOUR * 2);
    expect(lent.away).toBeUndefined();
    expect(lent.health.dead).toBe(false);
    expect(goodwillOf(sim, KIN)).toBeGreaterThan(60);
    expect(alliedWith(sim, KIN)).toBe(true);
  });

  it('commissions pay in their own goods, not silver', () => {
    const { sim, stock } = colony(10);
    sim.research.done.push('tailoring');
    // (They only commission what the colony already makes.)
    makeRequest(sim, KIN, 'commission');
    expect(sim.diplomacy.request?.kind).not.toBe('commission');
    sim.diplomacy.request = null;
    stock(itemId('tunic'), 1);
    makeRequest(sim, KIN, 'commission');
    const r = sim.diplomacy.request!;
    expect(r.kind).toBe('commission');
    expect(r.pay!.length).toBeGreaterThan(0);
    expect(r.pay!.every((p) => p.item !== itemId('silver'))).toBe(true);
    stock(r.item, r.count);
    sim.apply({ type: 'fulfilRequest' });
    expect(sim.diplomacy.request).toBeNull();
    run(sim, HOUR * 6);
    for (const p of r.pay!) {
      expect(colonyStock(sim, p.item)).toBeGreaterThanOrEqual(p.count);
    }
    expect(colonyStock(sim, itemId('silver'))).toBe(100);
  });
});
