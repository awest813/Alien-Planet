import { describe, expect, it } from 'vitest';
import { featureId } from './defs';
import { updateLifespans } from './lifespans';
import { HAPPY_CHILDHOOD, HARD_CHILDHOOD, teacherFor, updatePlay } from './school';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { SKILL_KEYS, WORK_TYPES } from './types';

// A teacher, two children and a lesson board beside them, at dawn on a quiet day.
function classroom(seed: number, board = true) {
  const sim = Simulation.newColony(seed);
  const { x, y } = clearAround(sim, 12);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  while (sim.colonists.length < 3) {
    sim.addWanderer();
  }
  const [teacher, kidA, kidB, ...rest] = sim.colonists;
  for (const c of sim.colonists) {
    c.traits = [];
    for (const k of SKILL_KEYS) {
      c.skills[k] = 2;
    }
  }
  teacher.age = 40;
  teacher.skills.crafting = 12;
  teacher.skills.construction = 10;
  for (const work of WORK_TYPES) {
    teacher.priorities[work] = 0;
  }
  kidA.age = 8;
  kidB.age = 9;
  for (const c of rest) {
    c.age = 30;
  }
  for (const kid of [kidA, kidB]) {
    for (const k of SKILL_KEYS) {
      kid.skills[k] = 0;
      kid.skillXp[k] = 0;
      kid.passions[k] = 0;
    }
    for (const work of WORK_TYPES) {
      kid.priorities[work] = 0;
    }
  }
  if (board) {
    sim.world.setFeature(sim.world.idx(x + 3, y), featureId('lessonBoard'));
  }
  const hours = (n: number) => {
    for (let h = 0; h < n; h++) {
      for (const c of sim.living()) {
        c.needs.food = 1;
        c.needs.rest = 1;
        c.needs.joy = 1;
        c.health.hypothermia = 0;
      }
      run(sim, HOUR);
    }
  };
  return { sim, teacher, kids: [kidA, kidB], hours };
}

describe('lessons', () => {
  it('teach the children at the lesson board in the morning, from the most skilled grown-up', () => {
    const { sim, teacher, kids, hours } = classroom(31);
    // Dawn is 7: lessons run from 9 to 12.
    hours(2);
    let teaching = false;
    let pupils = 0;
    for (let t = 0; t < HOUR * 3; t++) {
      sim.step();
      teaching ||= teacher.job?.type === 'lesson';
      pupils = Math.max(pupils, kids.filter((k) => k.job?.type === 'lesson').length);
    }
    expect(teaching).toBe(true);
    expect(pupils).toBe(2);
    for (const kid of kids) {
      expect(kid.skillXp.crafting + kid.skillXp.construction).toBeGreaterThan(50);
      expect(kid.thoughts.some((t) => t.key === 'hadLesson')).toBe(true);
    }
    expect(teacher.thoughts.some((t) => t.key === 'taughtLesson')).toBe(true);
    expect(sim.stats.lessons).toBeGreaterThan(0);
    expect(sim.log.some((l) => l.text.includes(`${teacher.name} taught`))).toBe(true);
    // School's out at noon.
    hours(1);
    expect(kids.some((k) => k.job?.type === 'lesson')).toBe(false);
  });

  it("don't happen without a board", () => {
    const { sim, kids, hours } = classroom(32, false);
    hours(5);
    expect(kids.some((k) => k.thoughts.some((t) => t.key === 'hadLesson'))).toBe(false);
    expect(sim.stats.lessons ?? 0).toBe(0);
  });

  it('go to a retired elder before a busy grown-up', () => {
    const { sim, teacher } = classroom(33);
    const elder = sim.colonists[2];
    elder.age = 70;
    elder.retired = true;
    elder.skills.plants = 7;
    expect(teacherFor(sim)).toBe(elder);
    elder.retired = false;
    expect(teacherFor(sim)).toBe(teacher);
  });
});

describe('play', () => {
  it('cheers children up and makes them friends', () => {
    const { sim, kids } = classroom(34);
    const [a, b] = kids;
    b.tile = a.tile;
    a.needs.joy = 0.2;
    for (let h = 0; h < 12; h++) {
      a.job = null;
      b.job = null;
      updatePlay(sim);
    }
    expect(a.needs.joy).toBeGreaterThan(0.5);
    expect(a.opinions[b.id]).toBeGreaterThan(10);
    expect(b.opinions[a.id]).toBeGreaterThan(10);
    expect(a.thoughts.some((t) => t.key === 'playedTogether')).toBe(true);
    expect(a.childhood!.happy).toBeGreaterThan(0);
  });
});

describe('childhood memories', () => {
  it('a hard childhood or a happy one stays with them when they come of age', () => {
    const { sim, kids } = classroom(35);
    const [hard, happy] = kids;
    hard.age = 17.999;
    hard.childhood = { hard: HARD_CHILDHOOD + 10, happy: 0 };
    happy.age = 17.999;
    happy.childhood = { hard: 0, happy: HAPPY_CHILDHOOD + 10 };
    updateLifespans(sim);
    expect(hard.age).toBeGreaterThanOrEqual(18);
    expect(hard.thoughts.some((t) => t.key === 'hardChildhood')).toBe(true);
    expect(happy.thoughts.some((t) => t.key === 'happyChildhood')).toBe(true);
    expect(hard.childhood).toBeUndefined();
    expect(
      sim.log.some((l) => l.text.includes(`${hard.name} has come of age`) && l.text.includes('hard childhood')),
    ).toBe(true);
    expect(sim.log.some((l) => l.text.includes('happy childhood'))).toBe(true);
  });

  it('count losing a parent as a child towards a hard one', () => {
    const { sim, teacher, kids } = classroom(36);
    const [kid] = kids;
    kid.parents = [teacher.id];
    sim.dieOf(teacher, 'old age');
    expect(kid.thoughts.some((t) => t.key === 'parentDied')).toBe(true);
    expect(kid.childhood!.hard).toBeGreaterThanOrEqual(HARD_CHILDHOOD);
  });
});
