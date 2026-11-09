import { ADULT, ELDER } from './lifespans';
import type { Simulation } from './simulation';
import { AilmentKey, Colonist } from './types';

// Old age: the aches that come with it (stiff joints, a sore back, failing eyes, and at last frailty),
// the frail needing someone to bring them their meals, and retirement from heavy work.

interface AilmentDef {
  label: string;
  // Standing pain, and what it does to work, walking and aim.
  pain: number;
  work: number;
  move: number;
  aim: number;
  // What the log says when it sets in.
  onset: string;
}

// The pains add up to less than the 0.25 that sends someone to bed: the old ache, but stay on their feet.
export const AILMENTS: Record<AilmentKey, AilmentDef> = {
  stiffJoints: {
    label: 'Stiff joints: walks slower',
    pain: 0.04,
    work: 1,
    move: 0.85,
    aim: 0,
    onset: 'joints have grown stiff with age',
  },
  soreBack: {
    label: 'Sore back: works slower, and it aches',
    pain: 0.08,
    work: 0.85,
    move: 1,
    aim: 0,
    onset: "back has gone sore, and it won't get better",
  },
  dimEyes: {
    label: 'Failing eyes: aims worse, and fine work is slower',
    pain: 0,
    work: 0.92,
    move: 1,
    aim: -0.1,
    onset: 'eyes are failing',
  },
  frailty: {
    label: 'Frail: slow, and needs meals brought to them',
    pain: 0.05,
    work: 0.8,
    move: 0.85,
    aim: 0,
    onset: 'strength is going: they have grown frail, and need looking after',
  },
};
const AILMENT_KEYS = Object.keys(AILMENTS) as AilmentKey[];

// The chance of a new ailment on each birthday from ELDER, rising with every year past it. Frailty only
// comes to the very old, or to someone already worn down by another ailment.
const AILMENT_CHANCE = 0.15;
const AILMENT_CHANCE_PER_YEAR = 0.03;
const FRAIL_AGE = 72;
// Elders retire at this age (or sooner, when frail), as long as enough others are working.
export const RETIRE_AGE = 68;
const WORKERS_TO_RETIRE = 3;

export const ailmentsOf = (c: Colonist): AilmentKey[] => c.health.ailments ?? [];
// While a doctor's herbal rub lasts, the aches hurt less than half as much.
export const EASED_PAIN = 0.4;
export const ailmentPain = (c: Colonist): number =>
  ailmentsOf(c).reduce((sum, a) => sum + AILMENTS[a].pain, 0) * (c.health.easedUntil !== undefined ? EASED_PAIN : 1);
export const ailmentWork = (c: Colonist): number => ailmentsOf(c).reduce((p, a) => p * AILMENTS[a].work, 1);
export const ailmentMove = (c: Colonist): number => ailmentsOf(c).reduce((p, a) => p * AILMENTS[a].move, 1);
export const ailmentAim = (c: Colonist): number => ailmentsOf(c).reduce((sum, a) => sum + AILMENTS[a].aim, 0);
export const frail = (c: Colonist): boolean => ailmentsOf(c).includes('frailty');

// Whether someone should have their meals brought to them: the downed, and the frail.
export const needsCare = (c: Colonist): boolean => c.health.downed || (frail(c) && !c.drafted);

// Called on each birthday: from ELDER, the years may bring an ailment, and in time retirement.
export function elderBirthday(sim: Simulation, c: Colonist): void {
  const age = Math.floor(c.age);
  if (age < ELDER) {
    return;
  }
  const had = ailmentsOf(c);
  const open = AILMENT_KEYS.filter((a) => !had.includes(a) && (a !== 'frailty' || age >= FRAIL_AGE || had.length > 0));
  if (open.length > 0 && sim.rng.chance(AILMENT_CHANCE + AILMENT_CHANCE_PER_YEAR * (age - ELDER))) {
    const ailment = sim.rng.pick(open);
    (c.health.ailments ??= []).push(ailment);
    sim.addLog(`${c.name}'s ${AILMENTS[ailment].onset}.`, 'warn', ailment === 'frailty');
  }
  // (Not one the player has kept on: `retired: false` is their choice, undefined is nobody's yet.)
  if (c.retired === undefined && (age >= RETIRE_AGE || frail(c)) && workersBesides(sim, c) >= WORKERS_TO_RETIRE) {
    retire(sim, c);
  }
}

// Grown-ups still working, other than `c`.
const workersBesides = (sim: Simulation, c: Colonist) =>
  sim.living().filter((o) => o !== c && o.age >= ADULT && !o.retired && !o.health.downed).length;

export function retire(sim: Simulation, c: Colonist): void {
  c.retired = true;
  // Heavy work in hand is put down.
  if (c.job && !['sleep', 'rest', 'eat', 'joy', 'wander', 'lesson'].includes(c.job.type)) {
    sim.dropCarried(c);
    sim.endJob(c);
  }
  sim.addLog(
    `${c.name} has retired from heavy work, and spends the days on gardening, crafts and teaching the young.`,
    'good',
    true,
  );
}

// The player's choice: only elders can retire, but anyone retired can be called back to work.
export function setRetired(sim: Simulation, c: Colonist, retired: boolean): void {
  if (retired && !c.retired && c.age >= ELDER) {
    retire(sim, c);
  } else if (!retired && c.retired) {
    c.retired = false;
    sim.addLog(`${c.name} is back at work.`, 'info');
  }
}

// Situational thoughts for the old: each ailment weighs on them; retirement is a pleasure.
export function ageThoughts(c: Colonist): string[] {
  const keys: string[] = [...ailmentsOf(c)];
  if (c.retired) {
    keys.push('retired');
  }
  return keys;
}
