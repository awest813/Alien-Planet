import { describe, expect, it } from 'vitest';
import { featureId } from './defs';
import { TEACHER_SKILL } from './school';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { SKILL_KEYS, WORK_TYPES } from './types';

// As school.test.ts's classroom, but the teacher is good at one thing only.
function classroom(seed: number) {
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
      c.skills[k] = 0;
    }
  }
  teacher.age = 40;
  teacher.skills.crafting = 12;
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
  sim.world.setFeature(sim.world.idx(x + 3, y), featureId('lessonBoard'));
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
  it('only teach what the teacher is good at', () => {
    const { teacher, kids, hours } = classroom(31);
    hours(6);
    for (const kid of kids) {
      expect(kid.skillXp.crafting).toBeGreaterThan(0);
    }
    // The teacher's second best (nothing at all) was taught every other hour.
    const untaught = SKILL_KEYS.filter((k) => teacher.skills[k] < TEACHER_SKILL);
    for (const kid of kids) {
      const learned = untaught.filter((k) => kid.skillXp[k] > 0 || kid.skills[k] > 0);
      expect(learned).toEqual([]);
    }
  });
});
