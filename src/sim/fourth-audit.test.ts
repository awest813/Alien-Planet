import { describe, expect, it } from 'vitest';
import { populationFor } from './constants';
import { featureId } from './defs';
import { FAMILY_ROOM, updateLifespans } from './lifespans';
import { deserialize, serialize } from './serialize';
import { START_HOUR, Simulation } from './simulation';
import { checkMarriages } from './social';
import { triggerEvent, updateStoryteller } from './storyteller';
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
