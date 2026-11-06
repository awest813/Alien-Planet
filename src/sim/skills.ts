import { TICKS_PER_HOUR } from './constants';
import { Rng } from './rng';
import type { Simulation } from './simulation';
import { Colonist, Passion, SKILL_KEYS, SkillKey } from './types';

export const MAX_SKILL = 20;
// Learning speed by passion: none, interested, burning.
const PASSION_RATE: Record<Passion, number> = { 0: 0.5, 1: 1.2, 2: 2 };
// Skills at or above this slowly rust without practice.
const RUST_LEVEL = 10;

export const SKILL_LABELS: Record<SkillKey, string> = {
  mining: 'Mining',
  construction: 'Construction',
  plants: 'Plants',
  cooking: 'Cooking',
  crafting: 'Crafting',
  medicine: 'Medicine',
  combat: 'Combat',
  research: 'Intellectual',
  animals: 'Animals',
  artistic: 'Artistic',
};

// Experience needed to go from `level` to the next.
export const xpToNext = (level: number): number => 200 + level * 80;

export const emptyXp = (): Record<SkillKey, number> =>
  Object.fromEntries(SKILL_KEYS.map((k) => [k, 0])) as Record<SkillKey, number>;

// Two skills get a passion; some of those burn.
export function rollPassions(rng: Rng): Record<SkillKey, Passion> {
  const passions = Object.fromEntries(SKILL_KEYS.map((k) => [k, 0])) as Record<SkillKey, Passion>;
  const keys = [...SKILL_KEYS];
  for (let n = 0; n < 2; n++) {
    const key = keys.splice(rng.int(0, keys.length - 1), 1)[0];
    passions[key] = rng.next() < 0.35 ? 2 : 1;
  }
  return passions;
}

// Practice: `amount` is roughly one per tick of work.
export function learn(sim: Simulation, c: Colonist, skill: SkillKey, amount = 1): void {
  const passion = c.passions[skill];
  c.practicedAt[skill] = sim.tick;
  if (passion > 0) {
    const key = passion === 2 ? 'passionWork' : 'interestingWork';
    const current = c.thoughts.find((t) => t.key === key);
    if (!current || current.expires - sim.tick < TICKS_PER_HOUR) {
      sim.addThought(c, key);
    }
  }
  if (c.skills[skill] >= MAX_SKILL) {
    return;
  }
  c.skillXp[skill] += amount * PASSION_RATE[passion];
  while (c.skillXp[skill] >= xpToNext(c.skills[skill]) && c.skills[skill] < MAX_SKILL) {
    c.skillXp[skill] -= xpToNext(c.skills[skill]);
    c.skills[skill]++;
    const level = c.skills[skill];
    // Reaching 10 is worth a notification; later milestones just go in the log.
    const milestone = level === 10;
    sim.addLog(
      `${c.name} reached ${SKILL_LABELS[skill].toLowerCase()} ${level}.`,
      milestone ? 'good' : 'info',
      milestone,
    );
  }
}

// Called once a day: expert skills not practised in the last day lose a little progress
// (never a whole level).
export function rustSkills(c: Colonist, tick: number): void {
  for (const skill of SKILL_KEYS) {
    const practiced = c.practicedAt[skill] ?? -Infinity;
    if (c.skills[skill] >= RUST_LEVEL && tick - practiced > TICKS_PER_HOUR * 24) {
      c.skillXp[skill] = Math.max(0, c.skillXp[skill] - xpToNext(c.skills[skill]) * 0.1);
    }
  }
}

// Work speed multiplier for a skill level: 0.55 at 0, about 1 at 6, 2.05 at 20.
export const skillFactor = (level: number): number => 0.55 + level * 0.075;
