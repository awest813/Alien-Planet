import backstoriesJson from '../data/backstories.json';
import { TICKS_PER_HOUR, populationFor } from './constants';
import { DAYS_PER_YEAR } from './seasons';
import { learn } from './skills';
import type { Rng } from './rng';
import type { Simulation } from './simulation';
import { Colonist, Infant, SKILL_KEYS, SkillKey, WorkTypeKey } from './types';

// Lifespans and families. Colonists have ages and backstories; married couples have children, who
// are carried as babies, then grow up through childhood (playing, and learning by watching the adults
// at work) and their teens (light work) into adults; the old slow down and in time die of old age.
// A year is DAYS_PER_YEAR days. Children grow CHILD_GROWTH times faster than adults age, so a child
// born in the colony comes of age within a long game.

export interface Backstory {
  key: string;
  title: string;
  description: string;
  skills: Partial<Record<SkillKey, number>>;
  hidden?: boolean;
}
export const BACKSTORIES: Backstory[] = backstoriesJson as Backstory[];
export const backstoryOf = (key: string): Backstory => BACKSTORIES.find((b) => b.key === key) ?? BACKSTORIES[0];
export const COLONY_BORN = 'colonyBorn';

export const CHILD_GROWTH = 6;
// Babies are carried until they toddle; children play and learn; teens do light work.
export const TODDLER = 3;
export const TEEN = 13;
export const ADULT = 18;
export const ELDER = 65;
// From this age, each birthday may be the last.
export const OLD_AGE = 70;
export const OLD_AGE_DEATH_PER_YEAR = 0.07;
// Married couples between these ages may have children.
export const PARENT_MIN = 18;
export const PARENT_MAX = 50;
// Chance a couple who could have a child starts expecting, each day; and how long until the birth.
export const CONCEPTION_PER_DAY = 0.05;
export const EXPECTING_DAYS = 6;
// Only this many people (counting babies) above the colony's usual size.
export const FAMILY_ROOM = 3;
// The youngest anyone can be drafted.
export const DRAFT_AGE = 16;
// Work a teenager can do.
export const TEEN_WORK: readonly WorkTypeKey[] = ['hauling', 'cleaning', 'growing', 'plantCutting', 'art'];
// A carer gets hungry this much faster while looking after a baby.
export const CARER_HUNGER = 1.2;
// How far a child watches the adults at work, and what an hour of watching teaches (a tenth of doing).
const WATCH_RANGE = 6;
const WATCH_XP = 20;

const HOURS_PER_YEAR = DAYS_PER_YEAR * 24;

export type LifeStage = 'baby' | 'child' | 'teen' | 'adult' | 'elder';
export function stageOf(age: number): LifeStage {
  return age < TODDLER ? 'baby' : age < TEEN ? 'child' : age < ADULT ? 'teen' : age < ELDER ? 'adult' : 'elder';
}
export const isAdult = (c: Colonist): boolean => c.age >= ADULT;

// Years gained in `hours`: children grow fast, adults age at the calendar's pace.
const yearsIn = (age: number, hours: number) => (hours / HOURS_PER_YEAR) * (age < ADULT ? CHILD_GROWTH : 1);

// Whether a colonist does this kind of work at their age.
export function canWork(c: Colonist, work: WorkTypeKey): boolean {
  return c.age >= ADULT || (c.age >= TEEN && TEEN_WORK.includes(work));
}

// Family: parents and children, or brothers and sisters.
export function related(a: Colonist, b: Colonist): boolean {
  return a.parents.includes(b.id) || b.parents.includes(a.id) || a.parents.some((p) => b.parents.includes(p));
}

// Who may fall in love: grown adults who aren't family.
export const canRomance = (a: Colonist, b: Colonist): boolean => isAdult(a) && isAdult(b) && !related(a, b);

// Work and walking pace for age: the young and the old are slower.
export const agePace = (c: Colonist): { work: number; move: number } =>
  c.age < TEEN ? { work: 0.6, move: 0.85 } : c.age >= ELDER ? { work: 0.85, move: 0.9 } : { work: 1, move: 1 };

// A starting adult: an age, and a past that tilts their skills.
export function rollPast(c: Colonist, rng: Rng): void {
  c.age = rng.int(18, 52) + rng.next();
  const pool = BACKSTORIES.filter((b) => !b.hidden);
  applyBackstory(c, rng.pick(pool).key);
}

export function applyBackstory(c: Colonist, key: string): void {
  c.backstory = key;
  for (const [skill, delta] of Object.entries(backstoryOf(key).skills) as [SkillKey, number][]) {
    c.skills[skill] = Math.max(0, Math.min(20, c.skills[skill] + delta));
  }
}

// Called every in-game hour: everyone ages, babies are born and grow, children learn.
export function updateLifespans(sim: Simulation): void {
  for (const c of sim.living()) {
    const before = c.age;
    c.age += yearsIn(c.age, 1);
    if (Math.floor(c.age) > Math.floor(before)) {
      birthday(sim, c);
      if (c.health.dead) {
        continue;
      }
    }
    if (c.expectingUntil !== undefined && sim.tick >= c.expectingUntil) {
      birth(sim, c);
    }
  }
  growInfants(sim);
  watchAndLearn(sim);
  // Once a day, at dawn: couples may start expecting.
  if (Math.floor(sim.hour) === 6) {
    conceive(sim);
  }
}

function birthday(sim: Simulation, c: Colonist): void {
  const age = Math.floor(c.age);
  if (age === TEEN) {
    sim.addLog(`${c.name} is ${TEEN} now: old enough to lend a hand with light work.`, 'good');
  } else if (age === ADULT) {
    sim.addThought(c, 'grewUp');
    sim.addLog(`${c.name} has come of age, and takes on a full share of the work.`, 'good', true);
  } else if (age === ELDER) {
    sim.addLog(`${c.name} turns ${ELDER}, and is slowing down a little.`, 'info');
  }
  if (age >= OLD_AGE && sim.rng.chance(Math.min(0.9, OLD_AGE_DEATH_PER_YEAR * (age - OLD_AGE + 1)))) {
    sim.dieOf(c, 'old age');
  }
}

// Married couples who could raise another child may start expecting.
function conceive(sim: Simulation): void {
  const living = sim.living();
  const room = populationFor(sim.world.width).maxColonists + FAMILY_ROOM;
  if (living.length + sim.infants.length >= room) {
    return;
  }
  for (const a of living) {
    const b = sim.colonists[a.spouse];
    if (
      !b ||
      b.health.dead ||
      a.id > b.id ||
      a.expectingUntil !== undefined ||
      b.expectingUntil !== undefined ||
      [a, b].some((p) => p.age < PARENT_MIN || p.age > PARENT_MAX || p.health.downed) ||
      // One baby at a time.
      sim.infants.some((i) => i.parents.includes(a.id))
    ) {
      continue;
    }
    if (sim.rng.chance(CONCEPTION_PER_DAY)) {
      const carrier = sim.rng.chance(0.5) ? a : b;
      carrier.expectingUntil = sim.tick + EXPECTING_DAYS * 24 * TICKS_PER_HOUR;
      sim.addLog(`${a.name} and ${b.name} are expecting a child!`, 'good', true);
    }
  }
}

function birth(sim: Simulation, carrier: Colonist): void {
  carrier.expectingUntil = undefined;
  const partner = sim.colonists[carrier.spouse];
  const parents = partner && !partner.health.dead ? [carrier.id, partner.id] : [carrier.id];
  const infant: Infant = {
    id: sim.nextInfantId++,
    name: sim.freshName(),
    age: 0,
    parents,
    carer: carrier.id,
  };
  sim.infants.push(infant);
  sim.stats.births = (sim.stats.births ?? 0) + 1;
  const names = parents.map((p) => sim.colonists[p].name).join(' and ');
  sim.addLog(`${infant.name} is born to ${names}.`, 'good', true);
  for (const c of sim.living()) {
    sim.addThought(c, parents.includes(c.id) ? 'newParent' : 'newbornInColony');
  }
}

// Babies grow, passing to another carer if theirs is gone; at TODDLER they join the colony.
function growInfants(sim: Simulation): void {
  for (const infant of [...sim.infants]) {
    infant.age += yearsIn(infant.age, 1);
    const carer = sim.colonists[infant.carer];
    if (!carer || carer.health.dead) {
      const next =
        infant.parents.map((p) => sim.colonists[p]).find((p) => p && !p.health.dead) ??
        sim.living().find((c) => isAdult(c));
      if (!next) {
        sim.infants = sim.infants.filter((i) => i !== infant);
        continue;
      }
      infant.carer = next.id;
    }
    if (infant.age >= TODDLER) {
      sim.infants = sim.infants.filter((i) => i !== infant);
      toddle(sim, infant);
    }
  }
}

// A baby old enough to walk becomes a colonist: young, unskilled, and taking after their parents.
function toddle(sim: Simulation, infant: Infant): Colonist {
  const carer = sim.colonists[infant.carer];
  const c = sim.adopt(infant.name, carer.tile);
  c.age = infant.age;
  c.parents = infant.parents;
  c.backstory = COLONY_BORN;
  for (const key of SKILL_KEYS) {
    c.skills[key] = sim.rng.int(0, 1);
  }
  // Traits, and what they love doing, from their parents.
  const parents = infant.parents.map((p) => sim.colonists[p]).filter(Boolean);
  const inherited = parents.flatMap((p) => p.traits).filter(() => sim.rng.chance(0.5));
  c.traits = [...new Set([...inherited, ...c.traits])].slice(0, 2);
  for (const p of parents) {
    for (const key of SKILL_KEYS) {
      if (p.passions[key] > 0 && sim.rng.chance(0.4)) {
        c.passions[key] = p.passions[key];
      }
    }
    c.opinions[p.id] = 60;
    p.opinions[c.id] = 70;
  }
  sim.addLog(`${c.name} has taken their first steps.`, 'good');
  return c;
}

// Children pick up skills by watching adults at work nearby.
function watchAndLearn(sim: Simulation): void {
  const living = sim.living();
  for (const child of living) {
    if (child.age >= ADULT || child.sleeping || child.health.downed) {
      continue;
    }
    const near = (a: Colonist) => isAdult(a) && sim.world.distance(a.tile, child.tile) <= WATCH_RANGE;
    // An adult in a teaching mood teaches what they know best, three times as well.
    const mentor = living.find((a) => near(a) && a.thoughts.some((t) => t.key === 'teachingInspiration'));
    if (mentor) {
      const best = SKILL_KEYS.reduce((b, k) => (mentor.skills[k] > mentor.skills[b] ? k : b));
      learn(sim, child, best, WATCH_XP * 3);
      continue;
    }
    const teacher = living.find((a) => near(a) && a.job && skillOfJob(a) !== null);
    const skill = teacher ? skillOfJob(teacher) : null;
    if (skill) {
      learn(sim, child, skill, WATCH_XP);
    }
  }
}

function skillOfJob(c: Colonist): SkillKey | null {
  switch (c.job?.type) {
    case 'mine':
      return 'mining';
    case 'construct':
    case 'deconstruct':
      return 'construction';
    case 'sow':
    case 'harvestCrop':
    case 'chop':
    case 'forage':
      return 'plants';
    case 'craft':
      return 'crafting';
    case 'research':
      return 'research';
    case 'tend':
      return 'medicine';
    case 'sculpt':
      return 'artistic';
    case 'tame':
      return 'animals';
    default:
      return null;
  }
}
