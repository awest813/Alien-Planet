import { describe, expect, it } from 'vitest';
import { RETIRE_AGE, ailmentsOf, elderBirthday, needsCare } from './ageing';
import { scarMove, scarWork } from './body';
import { itemId } from './defs';
import { griefMood, updateGrief } from './grief';
import { damage, painOf } from './health';
import { ageBy, canWork } from './lifespans';
import { DAYS_PER_YEAR } from './seasons';
import { OBJECTIVES, Simulation } from './simulation';
import { HOUR, clearAround } from './test-helpers';
import { WORK_TYPES } from './types';
import { GOOD_LEADER_MOOD, bedroomExpectation, leaderBar, villageThoughts } from './village';

const DAY = HOUR * 24;

function colony(seed: number, people = 5) {
  const sim = Simulation.newColony(seed);
  clearAround(sim, 12);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  while (sim.colonists.length < people) {
    sim.addWanderer();
  }
  for (const c of sim.colonists) {
    c.age = 30;
    c.traits = [];
  }
  return sim;
}

const labels = (sim: Simulation, c: { id: number }) => sim.thoughtsOf(sim.colonists[c.id]).map((t) => t.label);

describe('old age', () => {
  it('brings aches that slow the old and hurt a little, but never put them to bed', () => {
    const sim = colony(41);
    const old = sim.colonists[0];
    old.age = 74;
    for (let k = 0; k < 60; k++) {
      elderBirthday(sim, old);
    }
    const ailments = ailmentsOf(old);
    expect(ailments.length).toBe(4);
    expect(new Set(ailments).size).toBe(4);
    expect(scarWork(old)).toBeLessThan(0.7);
    expect(scarMove(old)).toBeLessThan(0.8);
    expect(painOf(old)).toBeGreaterThan(0.15);
    expect(painOf(old)).toBeLessThan(0.25);
    expect(labels(sim, old)).toContain('Frail with age');
    expect(labels(sim, old)).toContain('Sore back');
    expect(sim.log.some((l) => l.text.includes('grown frail'))).toBe(true);
  });

  it("doesn't come before sixty-five", () => {
    const sim = colony(42);
    const c = sim.colonists[0];
    c.age = 60;
    for (let k = 0; k < 60; k++) {
      elderBirthday(sim, c);
    }
    expect(ailmentsOf(c)).toEqual([]);
    expect(c.retired).toBeFalsy();
  });

  it('lets elders retire to light work and teaching, glad of it, when enough others are working', () => {
    const sim = colony(43, 5);
    const old = sim.colonists[0];
    old.age = RETIRE_AGE;
    elderBirthday(sim, old);
    expect(old.retired).toBe(true);
    expect(canWork(old, 'mining')).toBe(false);
    expect(canWork(old, 'hauling')).toBe(false);
    expect(canWork(old, 'growing')).toBe(true);
    expect(canWork(old, 'art')).toBe(true);
    expect(labels(sim, old)).toContain('Enjoying retirement');
    expect(sim.log.some((l) => l.text.includes('has retired'))).toBe(true);
  });

  it('lets the player retire an elder, or call them back to work, but not retire the young', () => {
    const sim = colony(50, 3);
    const [old, young] = sim.colonists;
    old.age = 66;
    sim.apply({ type: 'retire', colonist: young.id, retired: true });
    expect(young.retired).toBeFalsy();
    sim.apply({ type: 'retire', colonist: old.id, retired: true });
    expect(old.retired).toBe(true);
    sim.apply({ type: 'retire', colonist: old.id, retired: false });
    expect(old.retired).toBe(false);
    expect(canWork(old, 'mining')).toBe(true);
    // Kept on by the player: a later birthday doesn't retire them again.
    old.age = RETIRE_AGE + 1;
    elderBirthday(sim, old);
    expect(old.retired).toBe(false);
  });

  it('keeps an elder working when the colony is too small to spare them', () => {
    const sim = colony(44, 3);
    const old = sim.colonists[0];
    old.age = RETIRE_AGE + 2;
    elderBirthday(sim, old);
    expect(old.retired).toBeFalsy();
  });

  it('has someone bring the frail their meals', () => {
    const sim = colony(45, 3);
    const w = sim.world;
    const [old, carer, other] = sim.colonists;
    old.age = 78;
    old.health.ailments = ['frailty'];
    old.needs.food = 0.3;
    expect(needsCare(old)).toBe(true);
    for (const c of [carer, other]) {
      for (const work of WORK_TYPES) {
        c.priorities[work] = 0;
      }
    }
    carer.priorities.doctor = 1;
    other.tile = carer.tile;
    // Meals a little way off, and the elder somewhere else.
    let food = w.idx(w.xOf(carer.tile) + 4, w.yOf(carer.tile));
    while (!w.isPassable(food)) {
      food++;
    }
    w.addItem(food, itemId('meal'), 5);
    let fed = false;
    for (let t = 0; t < HOUR * 3 && !fed; t++) {
      for (const c of sim.living()) {
        c.needs.rest = 1;
        c.needs.joy = 1;
      }
      sim.step();
      fed = sim.log.some((l) => l.text.includes(`fed ${old.name}`));
    }
    expect(fed).toBe(true);
    expect(old.needs.food).toBeGreaterThan(0.5);
    expect(old.thoughts.some((t) => t.key === 'caredFor')).toBe(true);
  });
});

describe('grief', () => {
  it('lasts for weeks after a spouse dies, fading, and returns on the anniversary', () => {
    const sim = colony(46, 4);
    const [widow, late, friend] = sim.colonists;
    widow.spouse = late.id;
    late.spouse = widow.id;
    widow.lover = late.id;
    late.lover = widow.id;
    friend.opinions[late.id] = 50;
    late.opinions[friend.id] = 50;
    sim.dieOf(late, 'old age');
    const grief = () => sim.thoughtsOf(widow).find((t) => t.label === `Grieving for ${late.name}`)?.mood ?? 0;
    expect(grief()).toBeLessThanOrEqual(-6);
    expect(widow.thoughts.some((t) => t.key === 'loverDied')).toBe(true);
    expect(sim.thoughtsOf(friend).some((t) => t.label === `Grieving for ${late.name}`)).toBe(true);
    // Two weeks on it still weighs, less.
    sim.tick += 14 * DAY;
    expect(grief()).toBeLessThan(0);
    expect(grief()).toBeGreaterThan(-6);
    // The friend's has passed.
    expect(sim.thoughtsOf(friend).some((t) => t.label.startsWith('Grieving'))).toBe(false);
    sim.tick += (DAYS_PER_YEAR - 14) * DAY;
    expect(sim.thoughtsOf(widow).some((t) => t.label === `A year since ${late.name} died`)).toBe(true);
    updateGrief(sim);
    expect(sim.log.some((l) => l.text.includes(`It is a year since ${late.name} died`))).toBe(true);
    sim.tick += DAY;
    expect(sim.thoughtsOf(widow).some((t) => t.label.startsWith('A year'))).toBe(false);
    // Six weeks on, the grief itself has eased.
    sim.tick += 14 * DAY;
    expect(sim.thoughtsOf(widow).some((t) => t.label.includes(late.name))).toBe(false);
  });

  it('weighs by how close they were', () => {
    expect(griefMood(3, 0)).toBeLessThan(griefMood(2, 0));
    expect(griefMood(2, 0)).toBeLessThan(griefMood(1, 0));
    expect(griefMood(1, 13)).toBe(0);
    expect(griefMood(3, 30)).toBeLessThan(0);
  });

  it("is shared by a dead colonist's brothers, sisters and grandchildren", () => {
    const sim = colony(47, 5);
    const [gran, mum, aunt, kid] = sim.colonists;
    mum.parents = [gran.id];
    aunt.parents = [gran.id];
    kid.parents = [mum.id];
    sim.dieOf(mum, 'old age');
    expect(aunt.thoughts.some((t) => t.key === 'siblingDied')).toBe(true);
    expect(kid.thoughts.some((t) => t.key === 'parentDied')).toBe(true);
    expect(gran.thoughts.some((t) => t.key === 'childDied')).toBe(true);
    sim.dieOf(gran, 'old age');
    expect(kid.thoughts.some((t) => t.key === 'kinDied')).toBe(true);
  });
});

describe('the leader and the old', () => {
  it('expect a room of their own (the leader, a nice one)', () => {
    const sim = colony(48);
    const [leader, old, young] = sim.colonists;
    sim.village.leader = leader.id;
    old.age = 70;
    expect(bedroomExpectation(sim, leader, false, false)).toBe('leaderNoRoom');
    expect(bedroomExpectation(sim, leader, true, false)).toBe('leaderPlainRoom');
    expect(bedroomExpectation(sim, leader, true, true)).toBeNull();
    expect(bedroomExpectation(sim, old, false, false)).toBe('elderNoRoom');
    expect(bedroomExpectation(sim, old, true, false)).toBeNull();
    expect(bedroomExpectation(sim, young, false, false)).toBeNull();
  });

  it('as the years pass, the colony expects more of its leader, and leading weighs on them', () => {
    const sim = colony(49);
    const [leader, voter] = sim.colonists;
    sim.village.leader = leader.id;
    leader.mood = GOOD_LEADER_MOOD + 2;
    expect(leaderBar(sim)).toBe(0);
    expect(villageThoughts(sim, voter)).toContain('wellLed');
    expect(villageThoughts(sim, leader)).not.toContain('weightOfOffice');
    sim.tick = DAYS_PER_YEAR * 5 * DAY;
    expect(leaderBar(sim)).toBeGreaterThan(4);
    expect(villageThoughts(sim, voter)).not.toContain('wellLed');
    expect(villageThoughts(sim, leader)).toContain('weightOfOffice');
  });
});

describe('audit fixes', () => {
  it("a retired elder isn't pulled out of bed to doctor", () => {
    const sim = colony(47, 4);
    const [old, hurt, ...rest] = sim.colonists;
    old.age = 75;
    old.retired = true;
    old.priorities.doctor = 3;
    for (const o of rest) {
      o.priorities.doctor = 0;
    }
    hurt.tile = sim.world.neighbors(old.tile).find((n) => sim.world.isPassable(n))!;
    for (let k = 0; k < 4; k++) {
      damage(sim, hurt, 0.3, 'cut');
    }
    sim.step();
    expect(hurt.health.downed).toBe(true);
    for (let t = 0; t < HOUR * 2; t++) {
      sim.step();
      expect(['tend', 'rescue']).not.toContain(old.job?.type);
    }
  });

  it("a funeral eases grief for one's family as well as friends", () => {
    const sim = colony(48, 3);
    const c = sim.colonists[0];
    for (const key of ['childDied', 'parentDied', 'siblingDied', 'kinDied', 'friendDied']) {
      sim.addThought(c, key);
    }
    const left = () => Object.fromEntries(c.thoughts.map((t) => [t.key, t.expires - sim.tick]));
    const before = left();
    (sim as unknown as { easeGrief(c: unknown): void }).easeGrief(c);
    const after = left();
    for (const key of ['childDied', 'parentDied', 'siblingDied', 'kinDied', 'friendDied']) {
      expect(after[key]).toBeLessThan(before[key]);
    }
  });
});

describe('the goal of living to 65', () => {
  it('needs someone to turn 65 here, not to arrive older', () => {
    const sim = colony(49, 3);
    const goal = OBJECTIVES.find((o) => o.label.includes('live to 65'))!;
    sim.colonists[0].age = 70;
    expect(goal.check(sim)).toBe(false);
    const c = sim.colonists[1];
    c.age = 64.999;
    ageBy(sim, c, 24 * DAYS_PER_YEAR);
    expect(goal.check(sim)).toBe(true);
  });
});
