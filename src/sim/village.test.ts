import { describe, expect, it } from 'vitest';
import { die } from './health';
import { deserialize, serialize } from './serialize';
import { seasonDay } from './seasons';
import { Simulation } from './simulation';
import { TICKS_PER_HOUR } from './constants';
import { HOUR, run } from './test-helpers';
import { featureId, itemId } from './defs';
import { ignite } from './weather';
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

// Puts a few days' food by, so a day of rest isn't called off.
function stock(sim: Simulation) {
  const w = sim.world;
  let t = sim.colonists[0].tile - 3;
  while (!w.isPassable(t) || w.itemCount[t] > 0) {
    t--;
  }
  w.addItem(t, itemId('meal'), 40);
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
    stock(sim);
    at(sim, 6, 10);
    expect(sim.slotOf(c)).toBe('W');
    sim.apply({ type: 'policy', restDays: true });
    expect(restDay(sim)).toBe(true);
    expect(sim.slotOf(c)).toBe('J');
    expect(villageThoughts(sim, c)).toContain('dayOfRest');
    at(sim, 7, 10);
    updateVillage(sim);
    expect(sim.slotOf(c)).toBe('W');
  });

  it('a day of rest is called off when the stores are nearly empty', () => {
    const sim = colony(11);
    for (const t of [...sim.world.tilesWith('items')]) {
      sim.world.takeItem(t, sim.world.itemCount[t]);
    }
    at(sim, 6, 0);
    sim.apply({ type: 'policy', restDays: true });
    expect(restDay(sim)).toBe(false);
    expect(sim.log.some((l) => l.text.includes('called off'))).toBe(true);
  });

  it('a day of rest still sees fires put out', () => {
    const sim = colony(9);
    const w = sim.world;
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.weather = { ...sim.weather, kind: 'clear', until: 1e9 };
    stock(sim);
    at(sim, 6, 10);
    sim.apply({ type: 'policy', restDays: true });
    const near = sim.colonists[0].tile;
    let target = -1;
    for (let d = 3; d < 8 && target < 0; d++) {
      if (w.isPassable(near + d) && w.feature[near + d] === 0) {
        target = near + d;
      }
    }
    w.setFeature(target, featureId('tree'));
    expect(ignite(sim, target)).toBe(true);
    let firefighting = 0;
    for (let t = 0; t < HOUR && sim.burning.size > 0; t++) {
      sim.step();
      firefighting = Math.max(firefighting, sim.colonists.filter((c) => c.job?.type === 'extinguish').length);
    }
    expect(restDay(sim)).toBe(true);
    expect(firefighting).toBeGreaterThan(0);
  });

  it('a day of rest still keeps the fires fed', () => {
    const sim = colony(10);
    const w = sim.world;
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.weather = { ...sim.weather, kind: 'clear', until: 1e9 };
    stock(sim);
    at(sim, 6, 10);
    sim.apply({ type: 'policy', restDays: true });
    const near = sim.colonists[0].tile;
    const spots: number[] = [];
    for (let d = 2; d < 12 && spots.length < 2; d++) {
      if (w.isPassable(near + d) && w.feature[near + d] === 0 && w.itemCount[near + d] === 0) {
        spots.push(near + d);
      }
    }
    const [fire, pile] = spots;
    w.setFeature(fire, featureId('campfire'));
    w.fuel[fire] = 1;
    w.addItem(pile, itemId('wood'), 30);
    for (const c of sim.colonists) {
      c.priorities.hauling = 1;
    }
    run(sim, HOUR * 3);
    expect(restDay(sim)).toBe(true);
    expect(w.fuel[fire]).toBeGreaterThan(1);
  });

  it('are saved with the colony, along with the leader', () => {
    const sim = colony(8);
    elect(sim);
    sim.apply({ type: 'policy', rations: 'frugal', hours: 'short', restDays: true });
    const loaded = deserialize(structuredClone(serialize(sim)));
    expect(loaded.village).toEqual(sim.village);
  });
});
