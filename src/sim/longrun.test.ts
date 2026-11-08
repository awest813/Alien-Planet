import { describe, expect, it } from 'vitest';
import { populationFor } from './constants';
import { FACTIONS, featureId } from './defs';
import { MAX_DEPTH, digDeeper, shaftAt } from './depths';
import { gift, giftGoodwill, makeRequest, updateDiplomacy } from './diplomacy';
import { related } from './lifespans';
import { fadeOpinions } from './social';
import { eventWeight } from './storyteller';
import { goodwillOf } from './trade';
import { roomToJoin, talk } from './prisoners';
import { Simulation } from './simulation';
import { clearAround } from './test-helpers';
import { Captive } from './types';

// The things that go wrong only in a long game: a colony that keeps growing, asks that keep growing,
// shafts that keep going down, and colonists who take it all for granted.
describe('a long game', () => {
  it("a full colony can't take in a prisoner: they wait, ready, until there's room", () => {
    const sim = Simulation.newColony(1);
    const { x, y } = clearAround(sim, 10);
    while (sim.living().length < populationFor(sim.world.width).maxColonists) {
      sim.addWanderer();
    }
    expect(roomToJoin(sim)).toBe(false);
    const p: Captive = {
      id: 950,
      name: 'Captive',
      faction: 0,
      tile: sim.world.idx(x + 2, y),
      state: 'prisoner',
      capture: false,
      since: sim.tick,
      food: 1,
      resistance: 0,
      skill: 5,
      lastVisit: 0,
      hungryHours: 0,
    };
    sim.captives.push(p);
    const warden = sim.colonists[0];
    warden.mood = 100;
    const before = sim.colonists.length;
    for (let k = 0; k < 20; k++) {
      expect(talk(sim, warden, p)).toBeNull();
    }
    expect(sim.colonists.length).toBe(before);
    expect(sim.captives).toContain(p);
  });

  it('neighbours ask more as the colony grows, but no more than three times the first asks', () => {
    const kin = FACTIONS.find((f) => !f.hostile)!.id;
    const ask = (day: number) => {
      const sim = Simulation.newColony(2);
      sim.tick = (day - 1) * 24 * 200;
      makeRequest(sim, kin, 'deliver');
      const r = sim.diplomacy.request!;
      // Compare like with like: the count for wood, whatever was asked.
      return r.count;
    };
    expect(ask(240)).toBeLessThanOrEqual(ask(80) * 1.01 + 1);
  });

  it("the neighbours' warmth cools if it isn't kept up, back towards a steady friendship", () => {
    const sim = Simulation.newColony(5);
    const kin = FACTIONS.find((f) => !f.hostile)!.id;
    sim.goodwill[kin] = 90;
    sim.diplomacy.nextRequestDay = 1000;
    for (let h = 0; h < 24 * 12; h++) {
      sim.tick += 200;
      updateDiplomacy(sim);
    }
    expect(goodwillOf(sim, kin)).toBeLessThan(90);
    expect(goodwillOf(sim, kin)).toBeGreaterThan(80);
  });

  it('mine shafts stop at bedrock', () => {
    const sim = Simulation.newColony(3);
    const { x, y } = clearAround(sim, 10);
    const tile = sim.world.idx(x + 3, y);
    sim.world.setFeature(tile, featureId('mineShaft'));
    shaftAt(sim, tile).depth = MAX_DEPTH - 1;
    digDeeper(sim, sim.colonists[0], tile);
    digDeeper(sim, sim.colonists[0], tile);
    expect(shaftAt(sim, tile).depth).toBe(MAX_DEPTH);
    expect(sim.log.some((l) => l.text.includes('bedrock'))).toBe(true);
  });

  it('expectations rise as the colony settles in', () => {
    const sim = Simulation.newColony(4);
    const c = sim.colonists[0];
    const labels = () => {
      for (let t = 0; t < 40; t++) {
        sim.step();
      }
      return sim.thoughtsOf(c).map((t) => t.label);
    };
    expect(labels()).toContain('Just landed: low expectations');
    sim.tick = 24 * 200 * 50;
    expect(labels()).toContain('Settled in: higher expectations');
    sim.tick = 24 * 200 * 24 * 5;
    expect(labels()).toContain('Long settled: high expectations');
  });
});

describe('factions over the years', () => {
  it('paying off one raider faction spares the colony its share of the raids', () => {
    const sim = Simulation.newColony(6);
    sim.tick = 24 * 200 * 10;
    const full = eventWeight(sim, 'raid');
    const raiders = FACTIONS.filter((f) => f.hostile);
    sim.diplomacy.peaceUntil[raiders[0].id] = sim.tick + 24 * 200 * 5;
    expect(eventWeight(sim, 'raid')).toBeCloseTo(full / raiders.length);
    for (const f of raiders) {
      sim.diplomacy.peaceUntil[f.id] = sim.tick + 24 * 200 * 5;
    }
    expect(eventWeight(sim, 'raid')).toBe(0);
  });

  it("won't take a gift when they already think the world of the colony", () => {
    const sim = Simulation.newColony(7);
    const kin = FACTIONS.find((f) => !f.hostile)!.id;
    sim.goodwill[kin] = 100;
    expect(giftGoodwill(sim, kin, 50)).toBe(0);
    expect(gift(sim, kin, 25)).toMatch(/already/);
  });
});

describe('relationships over the years', () => {
  it('fade a little each day unless kept up, so grudges and friendships can change', () => {
    const sim = Simulation.newColony(8);
    const [a, b] = sim.colonists;
    a.opinions[b.id] = -60;
    b.opinions[a.id] = -60;
    for (let d = 0; d < 40; d++) {
      fadeOpinions(sim);
    }
    expect(a.opinions[b.id]).toBeGreaterThan(-30);
    expect(sim.log.some((l) => l.text.includes('let their quarrel go'))).toBe(true);
  });

  it('keep cousins, aunts, uncles and grandparents from courting', () => {
    const sim = Simulation.newColony(9);
    while (sim.colonists.length < 7) {
      sim.addWanderer();
    }
    const [grandma, mum, aunt, cousinA, cousinB, kid, stranger] = sim.colonists;
    mum.parents = [grandma.id];
    aunt.parents = [grandma.id];
    kid.parents = [mum.id];
    cousinA.parents = [mum.id];
    cousinB.parents = [aunt.id];
    for (const c of sim.colonists) {
      c.age = 30;
    }
    expect(related(sim, cousinA, cousinB)).toBe(true);
    expect(related(sim, aunt, kid)).toBe(true);
    expect(related(sim, grandma, kid)).toBe(true);
    expect(related(sim, kid, stranger)).toBe(false);
  });
});
