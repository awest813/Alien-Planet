import { describe, expect, it } from 'vitest';
import { spawnRaid } from './combat';
import { FACTIONS, itemId } from './defs';
import { tributeCost } from './diplomacy';
import { updateExpeditions } from './expeditions';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HELD_DAYS, TAKEN_CHANCE, buyBack, buyBackCost, carryOff, exchange, takenList, updateTaken } from './taken';
import { HOUR, clearAround } from './test-helpers';
import { colonyStock } from './trade';
import type { Captive, Colonist } from './types';

// Colonists carried off by raiders who overran the colony, and getting them back.

const SILVER = itemId('silver');
const RAIDERS = FACTIONS.find((f) => f.hostile)!.id;
const OTHERS = FACTIONS.filter((f) => f.hostile)[1].id;

// A colony (Harsh unless said), its stockpile holding `silver`, everyone down after a lost fight.
function overrun(silver = 0, difficulty: 'harsh' | 'standard' | 'peaceful' = 'harsh') {
  const sim = Simulation.newColony(4, difficulty);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y + 4, x1: x + 4, y1: y + 7 }, zone: 1 });
  if (silver > 0) {
    w.addItem(w.idx(x - 4, y + 4), SILVER, silver);
  }
  for (const c of sim.colonists) {
    c.health.downed = true;
    c.age = Math.max(c.age, 20);
  }
  return { sim, w };
}

// Rolls that always come up: the raiders take someone.
const certain = (sim: Simulation) => {
  sim.rng.next = () => 0;
};

const prisoner = (sim: Simulation, faction: number): Captive => {
  const p: Captive = {
    id: 77,
    name: 'Grit',
    faction,
    tile: sim.colonists[0].tile,
    state: 'prisoner',
    capture: false,
    since: sim.tick,
    food: 1,
    resistance: 3,
    skill: 4,
    lastVisit: 0,
    hungryHours: 0,
  };
  sim.captives.push(p);
  return p;
};

describe('carried off by raiders', () => {
  it('after an overrun, one of the fallen may go with the raiders: often on Harsh, never on Peaceful', () => {
    expect(TAKEN_CHANCE.harsh).toBeGreaterThan(TAKEN_CHANCE.standard);
    expect(TAKEN_CHANCE.standard).toBeGreaterThan(0);
    expect(TAKEN_CHANCE.peaceful).toBe(0);
    const { sim } = overrun();
    const before = sim.living().length;
    certain(sim);
    const c = carryOff(sim, RAIDERS)!;
    expect(c).toBeDefined();
    expect(c.away).toBe('gone');
    expect(sim.living()).toHaveLength(before - 1);
    expect(takenList(sim)).toEqual([
      { colonist: c.id, faction: RAIDERS, until: sim.tick + HELD_DAYS * 24 * HOUR, cost: tributeCost(sim) },
    ]);
    expect(sim.log.at(-1)!.text).toMatch(new RegExp(`carried ${c.name} off.*${buyBackCost(sim)} silver`));
    // Everyone else feels it, until they're home.
    const other = sim.living()[0];
    expect(sim.thoughtsOf(other).some((t) => t.label === 'One of ours held by raiders')).toBe(true);
    // Peaceful: nobody, however the rolls fall.
    const calm = overrun(0, 'peaceful').sim;
    certain(calm);
    expect(carryOff(calm, RAIDERS)).toBeUndefined();
  });

  it('never the last colonist, nor a child', () => {
    const { sim } = overrun();
    certain(sim);
    for (const c of sim.colonists.slice(1)) {
      c.health.dead = true;
    }
    expect(carryOff(sim, RAIDERS)).toBeUndefined();
    const young = overrun().sim;
    certain(young);
    for (const c of young.colonists) {
      c.age = 10;
    }
    expect(carryOff(young, RAIDERS)).toBeUndefined();
  });

  it('bought back for silver: home again in from the edge, glad and shaken', () => {
    const { sim } = overrun(tributeCost(Simulation.newColony(4)) + 200);
    certain(sim);
    const c = carryOff(sim, RAIDERS)!;
    const silver = colonyStock(sim, SILVER);
    const cost = buyBackCost(sim);
    expect(buyBack(sim, c.id)).toBeNull();
    expect(colonyStock(sim, SILVER)).toBe(silver - cost);
    expect(c.away).toBeUndefined();
    expect(sim.living()).toContain(c);
    expect(c.thoughts.some((t) => t.key === 'wasTaken')).toBe(true);
    expect(sim.living().some((o) => o.thoughts.some((t) => t.key === 'broughtHome'))).toBe(true);
    expect(takenList(sim)).toEqual([]);
    expect(sim.stats.boughtBack).toBe(1);
  });

  it('without the silver, it waits; and in exchange for one of their own, not someone else’s', () => {
    const { sim } = overrun();
    certain(sim);
    const c = carryOff(sim, RAIDERS)!;
    expect(buyBack(sim, c.id)).toMatch(/want \d+ silver/);
    expect(c.away).toBe('gone');
    const theirs = prisoner(sim, RAIDERS);
    const notTheirs = { ...prisoner(sim, OTHERS), id: 78 };
    const lying = { ...prisoner(sim, RAIDERS), id: 79, state: 'downed' as const };
    sim.captives = [theirs, notTheirs, lying];
    expect(exchange(sim, c.id, notTheirs.id)).toMatch(/one of their own/);
    // (One of theirs lying wounded where they fell isn't held.)
    expect(exchange(sim, c.id, lying.id)).toMatch(/held prisoner/);
    expect(exchange(sim, c.id, theirs.id)).toBeNull();
    expect(sim.captives.map((p) => p.id)).toEqual([notTheirs.id, lying.id]);
    expect(c.away).toBeUndefined();
    expect(sim.stats.exchanged).toBe(1);
  });

  it('left too long, they are never seen again, and mourned', () => {
    const { sim } = overrun();
    certain(sim);
    const c = carryOff(sim, RAIDERS)!;
    sim.rng.next = () => 0.99;
    sim.tick += HELD_DAYS * 24 * HOUR;
    updateTaken(sim);
    expect(c.health.dead).toBe(true);
    // Lost far off: no body where they fell, and nobody waiting to be buried.
    expect(c.away).toBe('gone');
    expect(sim.unburied.some((u) => u.id === c.id)).toBe(false);
    expect(sim.stats.lostToRaiders).toBe(1);
    expect(sim.stats.deaths?.raiders).toBe(1);
    expect(sim.storyLog.at(-1)?.text ?? sim.log.at(-1)!.text).toMatch(/never seen again/);
    expect(takenList(sim)).toEqual([]);
  });

  it('some get away by themselves, at dawn', () => {
    const { sim } = overrun();
    certain(sim);
    const c = carryOff(sim, RAIDERS)!;
    while (Math.floor(sim.hour) !== 6) {
      sim.tick += HOUR;
      sim.syncClock();
    }
    updateTaken(sim);
    expect(c.away).toBeUndefined();
    expect(sim.stats.escaped).toBe(1);
  });

  it('a save keeps them held, and nothing walks them home by itself', () => {
    const { sim } = overrun();
    certain(sim);
    const c = carryOff(sim, RAIDERS)!;
    const copy = deserialize(serialize(sim));
    expect(takenList(copy)).toEqual(takenList(sim));
    expect(copy.colonists[c.id].away).toBe('gone');
    updateExpeditions(copy);
    expect(copy.colonists[c.id].away).toBe('gone');
  });

  it('a raid that overruns the colony ends with the carrying off', () => {
    // Harsh, everyone down, a raid of theirs leaving: one of the fallen goes with them.
    const { sim } = overrun();
    certain(sim);
    expect(spawnRaid(sim, RAIDERS, 3)).toBe(true);
    sim.raid!.outcome = 'overrun';
    // (One of them got away off the map.)
    sim.raid!.escaped = 1;
    for (const e of sim.enemies) {
      e.hp = 0;
    }
    sim.step();
    expect(sim.raid).toBeNull();
    expect(takenList(sim)).toHaveLength(1);
  });

  it('raiders who all fell on the way out take nothing, and nobody', () => {
    const { sim } = overrun();
    certain(sim);
    expect(spawnRaid(sim, RAIDERS, 3)).toBe(true);
    sim.raid!.outcome = 'overrun';
    for (const e of sim.enemies) {
      e.hp = 0;
    }
    sim.step();
    expect(sim.raid).toBeNull();
    expect(takenList(sim)).toEqual([]);
    expect(sim.log.some((l) => /none of them got away/.test(l.text))).toBe(true);
  });

  it('the price asked stays the price, however long it takes to find', () => {
    const { sim } = overrun();
    certain(sim);
    const c = carryOff(sim, RAIDERS)!;
    const t = takenList(sim)[0];
    const asked = buyBackCost(sim, t);
    sim.tick += 5 * 24 * HOUR;
    sim.syncClock();
    expect(tributeCost(sim)).toBeGreaterThan(asked);
    expect(buyBackCost(sim, takenList(sim)[0])).toBe(asked);
    expect(c.away).toBe('gone');
  });

  it('nobody is taken who leaves no one old enough to look after the rest', () => {
    const { sim } = overrun();
    certain(sim);
    const [adult, child, ...rest] = sim.colonists;
    for (const c of rest) {
      c.health.dead = true;
    }
    adult.age = 30;
    child.age = 8;
    expect(carryOff(sim, RAIDERS)).toBeUndefined();
  });

  it('whoever was on the way to tend them lets them go, and no deal is made while their people attack', () => {
    const { sim } = overrun();
    certain(sim);
    // A doctor on the way to tend the first of the fallen (the one these rolls take).
    const [first, doctor] = sim.colonists;
    doctor.health.downed = false;
    const tend = (sim as unknown as { makeJob(type: string, target: number, extra: object): Colonist['job'] }).makeJob(
      'tend',
      first.tile,
      { patient: first.id },
    );
    doctor.job = tend;
    const c = carryOff(sim, RAIDERS)!;
    expect(c).toBe(first);
    // (They walked to where the taken had lain, and tended them there, held miles off.)
    expect(doctor.job).toBeNull();
    expect(spawnRaid(sim, RAIDERS, 2)).toBe(true);
    expect(buyBack(sim, c.id)).toMatch(/Not while .* attacking/);
    expect(exchange(sim, c.id, 1)).toMatch(/Not while .* attacking/);
  });
});
