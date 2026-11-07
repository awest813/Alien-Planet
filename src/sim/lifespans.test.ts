import { describe, expect, it } from 'vitest';
import {
  ADULT,
  BACKSTORIES,
  COLONY_BORN,
  CHILD_GROWTH,
  DRAFT_AGE,
  EXPECTING_DAYS,
  OLD_AGE,
  TEEN,
  TODDLER,
  canRomance,
  canWork,
  stageOf,
  updateLifespans,
} from './lifespans';
import { deserialize, serialize } from './serialize';
import { DAYS_PER_YEAR } from './seasons';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { WORK_TYPES } from './types';

const DAY = HOUR * 24;

// A quiet colony: no events, everyone kept fed and rested by `days`.
function family(seed: number) {
  const sim = Simulation.newColony(seed);
  clearAround(sim, 12);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  const days = (n: number) => {
    for (let h = 0; h < n * 24; h++) {
      for (const c of sim.living()) {
        c.needs.food = 1;
        c.needs.rest = 1;
        c.needs.joy = 1;
        c.health.hypothermia = 0;
      }
      run(sim, HOUR);
    }
  };
  return { sim, days };
}

describe('ages and backstories', () => {
  it('give every starting colonist an adult age and a past', () => {
    const sim = Simulation.newColony(1);
    for (const c of sim.colonists) {
      expect(c.age).toBeGreaterThanOrEqual(ADULT);
      expect(c.age).toBeLessThan(53);
      const story = BACKSTORIES.find((b) => b.key === c.backstory)!;
      expect(story).toBeDefined();
      expect(story.hidden).toBeFalsy();
    }
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.colonists.map((c) => [c.age, c.backstory])).toEqual(sim.colonists.map((c) => [c.age, c.backstory]));
  });

  it('age a year every year, and children grow faster', () => {
    const { sim, days } = family(2);
    const c = sim.colonists[0];
    c.age = 30;
    days(DAYS_PER_YEAR / 2);
    expect(c.age).toBeCloseTo(30.5, 1);
    const kid = sim.colonists[1];
    kid.age = 5;
    days(DAYS_PER_YEAR / 4);
    expect(kid.age).toBeCloseTo(5 + CHILD_GROWTH / 4, 1);
  });

  it('let teens do light work only, children none, and nobody young be drafted', () => {
    const { sim } = family(3);
    const c = sim.colonists[0];
    c.age = 8;
    expect(stageOf(c.age)).toBe('child');
    expect(WORK_TYPES.some((w) => canWork(c, w))).toBe(false);
    c.age = 14;
    expect(canWork(c, 'hauling')).toBe(true);
    expect(canWork(c, 'mining')).toBe(false);
    sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    expect(c.drafted).toBe(false);
    c.age = DRAFT_AGE;
    sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    expect(c.drafted).toBe(true);
  });
});

describe('families', () => {
  it('give married couples a baby, who grows up into a colonist taking after their parents', () => {
    const { sim, days } = family(4);
    const [a, b] = sim.colonists;
    a.age = 26;
    b.age = 28;
    a.lover = b.id;
    b.lover = a.id;
    a.spouse = b.id;
    b.spouse = a.id;
    // Expecting straight away.
    a.expectingUntil = sim.tick + EXPECTING_DAYS * DAY;
    days(EXPECTING_DAYS + 1);
    expect(sim.infants).toHaveLength(1);
    const baby = sim.infants[0];
    expect(baby.parents.sort()).toEqual([a.id, b.id].sort());
    expect(sim.thoughtsOf(a).map((t) => t.label)).toContain('Became a parent');
    expect(sim.stats.births).toBe(1);
    // Saved with the colony.
    expect(deserialize(structuredClone(serialize(sim))).infants).toEqual(sim.infants);
    // A baby walks at three: about TODDLER / CHILD_GROWTH years of the calendar.
    const before = sim.colonists.length;
    days(Math.ceil((TODDLER / CHILD_GROWTH) * DAYS_PER_YEAR) + 1);
    expect(sim.infants).toHaveLength(0);
    expect(sim.colonists.length).toBe(before + 1);
    const child = sim.colonists.at(-1)!;
    expect(child.name).toBe(baby.name);
    expect(child.backstory).toBe(COLONY_BORN);
    expect(child.parents.sort()).toEqual([a.id, b.id].sort());
    expect(stageOf(child.age)).toBe('child');
    // Family don't fall for each other.
    expect(canRomance(child, a)).toBe(false);
  });

  it('teach children by watching the adults at work', () => {
    const { sim } = family(5);
    const [adult, kid] = sim.colonists;
    kid.age = 8;
    kid.skillXp.construction = 0;
    const before = kid.skills.construction;
    adult.age = 35;
    kid.tile = adult.tile;
    adult.job = {
      type: 'construct',
      target: adult.tile,
      source: -1,
      item: 0,
      count: 0,
      line: 0,
      stage: 0,
      progress: 0,
      wait: 0,
      patient: -1,
    };
    updateLifespans(sim);
    expect(kid.skillXp.construction + (kid.skills.construction - before) * 1000).toBeGreaterThan(0);
    // Too far away to see, nothing learnt.
    kid.skillXp.mining = 0;
    adult.job.type = 'mine';
    kid.tile = sim.world.idx(0, 0);
    updateLifespans(sim);
    expect(kid.skillXp.mining).toBe(0);
  });

  it('come to an end in old age', () => {
    const { sim, days } = family(6);
    const old = sim.colonists[0];
    old.age = OLD_AGE + 25;
    days(DAYS_PER_YEAR + 1);
    expect(old.health.dead).toBe(true);
    expect(sim.unburied.at(-1)?.cause).toBe('old age');
  });

  it('grow children into teenagers and adults', () => {
    const { sim, days } = family(7);
    const kid = sim.colonists[0];
    kid.age = TEEN - 0.1;
    days(1);
    expect(stageOf(kid.age)).toBe('teen');
    kid.age = ADULT - 0.05;
    days(1);
    expect(stageOf(kid.age)).toBe('adult');
    expect(sim.thoughtsOf(kid).map((t) => t.label)).toContain('All grown up');
  });
});
