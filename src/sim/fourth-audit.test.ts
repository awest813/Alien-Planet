import { describe, expect, it } from 'vitest';
import { populationFor } from './constants';
import { featureId, itemId } from './defs';
import { infect } from './health';
import { FAMILY_ROOM, updateLifespans } from './lifespans';
import { deserialize, serialize } from './serialize';
import { START_HOUR, Simulation } from './simulation';
import { checkMarriages } from './social';
import { triggerEvent, updateStoryteller } from './storyteller';
import { WORK_TYPES } from './types';
import { villageThoughts } from './village';
import { HOUR, clearAround, run } from './test-helpers';

// Found by the fourth audit (less-reviewed systems, and saving and loading), each first seen failing.

const DAY = HOUR * 24;

describe('illness events', () => {
  it("don't fire on colonists just over the illness, who can't catch it", () => {
    for (const [event, key] of [
      ['winterCough', 'winterCough'],
      ['disease', 'marshFever'],
    ]) {
      const sim = Simulation.newColony(3);
      sim.tick = DAY * 30;
      for (const c of sim.colonists) {
        c.health.recovered = { key, until: sim.tick + DAY * 5 };
      }
      const logged = sim.log.length;
      expect(triggerEvent(sim, event)).toBe(false);
      expect(sim.colonists.some((c) => c.health.disease)).toBe(false);
      expect(sim.log.length).toBe(logged);
    }
  });
});

describe('a raid', () => {
  // The breather before the next threat counts from the raid's end, a short raid's too.
  function breatherAfter(raidHours: number): number {
    const sim = Simulation.newColony(5);
    const t0 = DAY * 20;
    sim.tick = t0;
    sim.story.lastEventTick = t0;
    // What the raid's own breather set as it began (Standard).
    sim.story.nextThreatTick = t0 + DAY;
    sim.raid = {} as never;
    for (let h = 1; h <= raidHours; h++) {
      sim.tick = t0 + h * HOUR;
      updateStoryteller(sim);
    }
    sim.raid = null;
    return (sim.story.nextThreatTick - (t0 + raidHours * HOUR)) / HOUR;
  }

  it('gives a full breather after it ends, however short it was', () => {
    expect(breatherAfter(6)).toBe(24);
    expect(breatherAfter(12)).toBe(24);
  });
});

describe('families', () => {
  it("don't start more children one morning than there is room left for", () => {
    const sim = Simulation.newColony(4);
    while (sim.colonists.length < 8) {
      sim.addWanderer();
    }
    const cs = sim.colonists;
    for (let k = 0; k < 8; k += 2) {
      const [a, b] = [cs[k], cs[k + 1]];
      a.age = b.age = 30;
      a.spouse = a.lover = b.id;
      b.spouse = b.lover = a.id;
      a.parents = [];
      b.parents = [];
    }
    const left = populationFor(sim.world.width).maxColonists + FAMILY_ROOM - sim.headcount();
    // 06:00 on day 3: the morning check.
    sim.tick = (2 * 24 + 6 - START_HOUR + 24) * HOUR;
    expect(Math.floor(sim.hour)).toBe(6);
    sim.rng.chance = () => true;
    updateLifespans(sim);
    expect(cs.filter((c) => c.expectingUntil !== undefined).length).toBe(Math.min(left, 4));
  });

  it("start a widow's new marriage without the old one's rough patch", () => {
    const sim = Simulation.newColony(4);
    sim.addWanderer();
    const [a, b, c] = sim.colonists;
    for (const x of [a, b, c]) {
      x.age = 30;
      x.parents = [];
      x.mood = 60;
    }
    const marry = (x: typeof a, y: typeof a) => {
      x.spouse = x.lover = y.id;
      y.spouse = y.lover = x.id;
      x.opinions[y.id] = 0;
      y.opinions[x.id] = 0;
    };
    marry(a, b);
    sim.tick = DAY * 10;
    checkMarriages(sim);
    expect(a.strainedSince).toBe(sim.day);
    sim.dieOf(b, 'old age');
    expect(a.strainedSince).toBeUndefined();
    sim.tick = DAY * 30;
    marry(a, c);
    sim.rng.chance = () => true;
    checkMarriages(sim);
    // The first strained morning is a warning, with days to mend it, not the end.
    expect(a.spouse).toBe(c.id);
    expect(a.strainedSince).toBe(sim.day);
  });
});

describe('loading a game', () => {
  it("doesn't let two games loaded from one save share a colonist's parts", () => {
    const sim = Simulation.newColony(7);
    run(sim, HOUR * 6);
    const data = serialize(sim);
    const a = deserialize(data);
    const b = deserialize(data);
    expect(a.colonists[0].practicedAt).not.toBe(b.colonists[0].practicedAt);
    expect(a.colonists[0].parents).not.toBe(b.colonists[0].parents);
  }, 60000);

  it('counts a concert under way when the game was saved as given', () => {
    const sim = Simulation.newColony(3);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.tick = (18 - START_HOUR) * HOUR;
    sim.syncClock();
    w.setFeature(w.idx(x + 3, y), featureId('lute'));
    for (const c of sim.colonists) {
      c.needs.food = 1;
      c.needs.rest = 1;
      c.needs.joy = 0.5;
      c.schedule.fill('J');
      for (const k of Object.keys(c.priorities) as (keyof typeof c.priorities)[]) {
        c.priorities[k] = 0;
      }
    }
    sim.temperatureAt = () => 18;
    (sim as unknown as { nextPartyTick: number }).nextPartyTick = Number.MAX_SAFE_INTEGER;
    const [player] = sim.colonists;
    player.skills.artistic = 12;
    player.recentJoy = { gaming: 2, relaxing: 2, outdoor: 2, social: 2 };
    for (let t = 0; t < HOUR * 4 && !sim.concert; t++) {
      sim.step();
      player.needs.joy = Math.min(player.needs.joy, 0.2);
    }
    expect(sim.concert).not.toBeNull();
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.concert).toBeNull();
    expect(copy.stats.concerts).toBe(1);
    expect(copy.log.some((l) => l.text.endsWith('concert is over.'))).toBe(true);
  }, 60000);
});

// What the fourth audit read and left as found, since fixed.
describe('after a load', () => {
  // A cleared patch, everyone fed, rested and idle, no events.
  function quiet(seed: number) {
    const sim = Simulation.newColony(seed);
    const { x, y } = clearAround(sim, 14);
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.temperatureAt = () => 18;
    for (const c of sim.colonists) {
      c.needs.food = 1;
      c.needs.rest = 1;
      c.needs.joy = 0.6;
      for (const work of WORK_TYPES) {
        c.priorities[work] = 0;
      }
      c.schedule.fill('A');
    }
    return { sim, w: sim.world, x, y };
  }
  const reload = (sim: Simulation) => {
    const copy = deserialize(structuredClone(serialize(sim)));
    copy.temperatureAt = () => 18;
    return copy;
  };

  it('a patient on bed rest stays on bed rest', () => {
    const { sim, w, x, y } = quiet(21);
    w.setFeature(w.idx(x + 2, y), featureId('bed'));
    const [patient] = sim.colonists;
    infect(sim, patient, 'winterCough');
    for (let t = 0; t < HOUR * 2 && !(patient.job?.type === 'rest' && patient.sleeping); t++) {
      sim.step();
    }
    expect(patient.job?.type).toBe('rest');
    expect(patient.sleeping).toBe(true);
    const copy = reload(sim);
    expect(copy.colonists[0].job?.type).toBe('rest');
  });

  it('someone eating finishes the meal, but a hauler with a stack of food is no eater', () => {
    const { sim } = quiet(22);
    const [eater, hauler] = sim.colonists;
    eater.needs.food = 0.1;
    eater.carrying = { item: itemId('meal'), count: 1 };
    hauler.needs.food = 0.1;
    hauler.carrying = { item: itemId('berries'), count: 40 };
    const copy = reload(sim);
    const [e, h] = copy.colonists;
    expect(e.job?.type).toBe('eat');
    expect(h.job).toBeNull();
    for (let t = 0; t < HOUR && e.carrying; t++) {
      copy.step();
    }
    expect(e.carrying).toBeNull();
    expect(e.needs.food).toBeGreaterThan(0.5);
  });

  it('guests at a gathering under way go straight back to it', () => {
    const { sim, w, x, y } = quiet(23);
    sim.tick = (2 * 24 + 18 - START_HOUR) * HOUR;
    sim.syncClock();
    sim.gathering = {
      kind: 'party',
      tile: w.idx(x, y + 2),
      startsAt: sim.tick,
      endsAt: sim.tick + HOUR * 3,
      host: sim.colonists[0].id,
    };
    run(sim, HOUR / 2);
    expect(sim.colonists.every((c) => c.job?.gathering)).toBe(true);
    const copy = reload(sim);
    expect(copy.colonists.every((c) => c.job?.gathering)).toBe(true);
  });
});

describe('a leader away on a trip', () => {
  it("doesn't lift or lower anyone's spirits", () => {
    const sim = Simulation.newColony(24);
    const [leader, other] = sim.colonists;
    sim.village.leader = leader.id;
    leader.mood = 95;
    expect(villageThoughts(sim, other).some((k) => k.startsWith('wellLed'))).toBe(true);
    leader.away = 'gone';
    expect(villageThoughts(sim, other).some((k) => k.startsWith('wellLed'))).toBe(false);
    leader.mood = 5;
    expect(villageThoughts(sim, other)).not.toContain('poorlyLed');
  });
});
