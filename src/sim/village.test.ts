import { describe, expect, it } from 'vitest';
import { die } from './health';
import { deserialize, serialize } from './serialize';
import { seasonDay } from './seasons';
import { Simulation } from './simulation';
import { TICKS_PER_HOUR } from './constants';
import {
  elect,
  hoursSpeed,
  rationsEatBelow,
  rationsHunger,
  restDay,
  tally,
  updateVillage,
  villageThoughts,
} from './village';

// Sets the clock to a given day and hour.
function at(sim: Simulation, day: number, hour: number) {
  const target = (day - 1) * 24 + hour;
  sim.tick += Math.round((target - sim.totalHours) * TICKS_PER_HOUR);
  sim.syncClock();
}

function colony(seed: number) {
  const sim = Simulation.newColony(seed);
  sim.addWanderer();
  for (const c of sim.colonists) {
    c.age = 30;
    c.opinions = {};
    c.mood = 50;
  }
  return sim;
}

describe('the vote', () => {
  it('chooses whoever the colony thinks best of', () => {
    const sim = colony(1);
    const [a, b, ...rest] = sim.colonists;
    for (const c of sim.colonists) {
      c.opinions[b.id] = c === b ? 0 : 60;
    }
    b.opinions[a.id] = 40;
    expect(tally(sim).get(b.id)).toBe(sim.colonists.length - 1);
    expect(elect(sim)).toBe(b);
    expect(sim.village.leader).toBe(b.id);
    expect(sim.thoughtsOf(b).map((t) => t.label).length).toBeGreaterThan(0);
    expect(rest.length).toBeGreaterThan(0);
  });

  it('needs at least three adults', () => {
    const sim = colony(2);
    for (const c of sim.colonists.slice(2)) {
      c.age = 8;
    }
    expect(elect(sim)).toBeNull();
    expect(sim.village.leader).toBe(-1);
  });

  it('is held at once with no leader, again each season, and when the leader dies', () => {
    const sim = colony(3);
    at(sim, 2, 7);
    updateVillage(sim);
    const first = sim.village.leader;
    expect(first).toBeGreaterThanOrEqual(0);
    // Mid-season: no new vote.
    at(sim, 3, 7);
    const votes = sim.stats.elections;
    updateVillage(sim);
    expect(sim.stats.elections).toBe(votes);
    // The first day of the next season: a vote.
    let day = 3;
    do {
      at(sim, ++day, 7);
    } while (seasonDay(sim.totalHours) !== 1);
    updateVillage(sim);
    expect(sim.stats.elections).toBe(votes! + 1);
    // The leader dies: someone else leads.
    die(sim, sim.colonists[sim.village.leader], 'old age');
    expect(sim.village.leader).toBe(-1);
    at(sim, day + 1, 7);
    updateVillage(sim);
    expect(sim.village.leader).toBeGreaterThanOrEqual(0);
    expect(sim.colonists[sim.village.leader].health.dead).toBe(false);
  });

  it('makes a cheerful leader lift the colony and a miserable one drag it down', () => {
    const sim = colony(4);
    elect(sim);
    const leader = sim.colonists[sim.village.leader];
    const other = sim.colonists.find((c) => c !== leader)!;
    leader.mood = 70;
    expect(villageThoughts(sim, other)).toContain('wellLed');
    expect(villageThoughts(sim, leader)).not.toContain('wellLed');
    leader.mood = 10;
    expect(villageThoughts(sim, other)).toContain('poorlyLed');
  });
});

describe('policies', () => {
  it('rations change how fast and how soon colonists eat, and how they feel about it', () => {
    const sim = colony(5);
    const c = sim.colonists[0];
    sim.apply({ type: 'policy', rations: 'frugal' });
    expect(rationsHunger(sim.village)).toBeLessThan(1);
    c.traits = ['glutton'];
    expect(villageThoughts(sim, c)).toContain('frugalRationsGlutton');
    sim.apply({ type: 'policy', rations: 'generous' });
    expect(rationsHunger(sim.village)).toBeGreaterThan(1);
    expect(rationsEatBelow(sim.village)).toBeGreaterThan(0.3);
    expect(villageThoughts(sim, c)).toContain('generousRations');
  });

  it('hours change the pace of work; the lazy and the hard-working feel differently', () => {
    const sim = colony(6);
    const c = sim.colonists[0];
    sim.apply({ type: 'policy', hours: 'long' });
    expect(hoursSpeed(sim.village)).toBeCloseTo(1.1);
    c.traits = ['hardWorker'];
    expect(villageThoughts(sim, c)).toEqual([]);
    c.traits = ['lazy'];
    expect(villageThoughts(sim, c)).toContain('longHoursLazy');
    sim.apply({ type: 'policy', hours: 'short' });
    expect(hoursSpeed(sim.village)).toBeCloseTo(0.9);
    expect(villageThoughts(sim, c)).toContain('shortHoursLazy');
  });

  it('a day of rest turns work time into free time, one day in six', () => {
    const sim = colony(7);
    const c = sim.colonists[0];
    c.schedule[10] = 'W';
    at(sim, 6, 10);
    expect(sim.slotOf(c)).toBe('W');
    sim.apply({ type: 'policy', restDays: true });
    expect(restDay(sim)).toBe(true);
    expect(sim.slotOf(c)).toBe('J');
    expect(villageThoughts(sim, c)).toContain('dayOfRest');
    at(sim, 7, 10);
    expect(sim.slotOf(c)).toBe('W');
  });

  it('are saved with the colony, along with the leader', () => {
    const sim = colony(8);
    elect(sim);
    sim.apply({ type: 'policy', rations: 'frugal', hours: 'short', restDays: true });
    const loaded = deserialize(structuredClone(serialize(sim)));
    expect(loaded.village).toEqual(sim.village);
  });
});
