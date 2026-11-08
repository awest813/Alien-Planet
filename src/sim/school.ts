import { TICKS_PER_HOUR } from './constants';
import { TRAITS, featureId } from './defs';
import { ADULT, TEEN, TODDLER } from './lifespans';
import type { Simulation } from './simulation';
import { SKILL_LABELS, learn } from './skills';
import { shiftOpinion } from './social';
import { Colonist, SKILL_KEYS, SkillKey } from './types';

// Growing up: lessons at the lesson board, play with the other children, and the memories a childhood
// leaves. A hard one (hunger, a parent lost, parents parting) or a happy one (lessons, play, good days)
// stays with them when they come of age.

export const LESSON_BOARD = featureId('lessonBoard');
// Lessons run each morning, these hours.
export const SCHOOL_START = 9;
export const SCHOOL_END = 12;
// A teacher needs to be good at something to teach it.
export const TEACHER_SKILL = 6;
// Pupils stand this close to the board; the teacher, as close, counts as there.
const BOARD_RANGE = 2;
// What an hour of lessons teaches: more from a better teacher (watching an adult at work teaches 20).
const LESSON_XP = 30;
const LESSON_XP_PER_LEVEL = 4;
// The chance an hour at lessons kindles an interest in the subject.
const KINDLE_CHANCE = 0.03;

const pupilAge = (c: Colonist) => c.age >= TODDLER && c.age < TEEN;
export const isSchoolHour = (sim: Simulation): boolean => {
  const h = Math.floor(sim.hour);
  return h >= SCHOOL_START && h < SCHOOL_END;
};

// The lesson boards standing in the colony (looked up again only when buildings change).
const boardCache = new WeakMap<Simulation, { version: number; boards: number[] }>();
export function lessonBoards(sim: Simulation): number[] {
  const w = sim.world;
  const cached = boardCache.get(sim);
  if (cached?.version === w.featureVersion) {
    return cached.boards;
  }
  const boards: number[] = [];
  for (const i of w.tilesWith('features')) {
    if (w.feature[i] === LESSON_BOARD) {
      boards.push(i);
    }
  }
  boardCache.set(sim, { version: w.featureVersion, boards });
  return boards;
}

const free = (sim: Simulation, c: Colonist) =>
  !c.health.downed && !c.drafted && !c.sleeping && !sim.inMentalBreak(c) && !c.health.dead;
const bestSkill = (c: Colonist): number => Math.max(...SKILL_KEYS.map((k) => c.skills[k]));

// Whether someone can get to a board: one with a free tile beside it in their part of the map.
const reachesBoard = (sim: Simulation, c: Colonist) =>
  lessonBoards(sim).some((b) =>
    sim.world.neighbors(b).some((n) => sim.world.isPassable(n) && sim.regionOf(n) === sim.regionOf(c.tile)),
  );

// Who teaches: the retired first (it's what they're for), then the most skilled grown-up; only someone who'll
// actually come (not on their own time or asleep by the schedule, and able to reach a board).
export function teacherFor(sim: Simulation): Colonist | undefined {
  return sim
    .living()
    .filter(
      (c) =>
        c.age >= ADULT &&
        free(sim, c) &&
        bestSkill(c) >= TEACHER_SKILL &&
        !c.health.ailments?.includes('frailty') &&
        sim.slotOf(c) !== 'J' &&
        sim.slotOf(c) !== 'S' &&
        reachesBoard(sim, c),
    )
    .sort((a, b) => Number(!!b.retired) - Number(!!a.retired) || bestSkill(b) - bestSkill(a) || a.id - b.id)[0];
}

// What's taught this hour: the teacher's best skills, by turns.
function subject(sim: Simulation, teacher: Colonist): SkillKey {
  const best = [...SKILL_KEYS].sort((a, b) => teacher.skills[b] - teacher.skills[a]);
  return best[Math.floor(sim.totalHours) % 2];
}

// Tiles to stand on for a lesson at `board`.
function seats(sim: Simulation, board: number, c: Colonist): number[] {
  const w = sim.world;
  const region = sim.regionOf(c.tile);
  const taken = new Set(sim.living().flatMap((o) => (o !== c && o.job?.type === 'lesson' ? [o.job.target] : [])));
  const spots: number[] = [];
  const bx = w.xOf(board);
  const by = w.yOf(board);
  for (let y = by - BOARD_RANGE; y <= by + BOARD_RANGE; y++) {
    for (let x = bx - BOARD_RANGE; x <= bx + BOARD_RANGE; x++) {
      if (!w.inBounds(x, y)) {
        continue;
      }
      const i = w.idx(x, y);
      if (i !== board && w.isPassable(i) && sim.regionOf(i) === region && !taken.has(i)) {
        spots.push(i);
      }
    }
  }
  return spots;
}

// Called when a colonist looks for something to do in school hours: a child goes to lessons (when
// there's a board and someone to teach), and the teacher goes to teach (when there are children).
export function tryLesson(sim: Simulation, c: Colonist): boolean {
  if (!isSchoolHour(sim)) {
    return false;
  }
  const boards = lessonBoards(sim);
  if (boards.length === 0) {
    return false;
  }
  const teacher = teacherFor(sim);
  if (!teacher) {
    return false;
  }
  const pupil = pupilAge(c);
  if (!pupil && teacher !== c) {
    return false;
  }
  // The teacher goes once a child is on the way (not just because there are children about: a child who's
  // elsewhere left the teacher walking to the board and away again all morning).
  if (!pupil && !sim.living().some((o) => o.job?.type === 'lesson' && o.job.line === 0)) {
    return false;
  }
  // Everyone to the board nearest the teacher, so they meet.
  const board = [...boards].sort(
    (a, b) => sim.world.distance(teacher.tile, a) - sim.world.distance(teacher.tile, b),
  )[0];
  const until = (SCHOOL_END - sim.hour) * TICKS_PER_HOUR;
  return sim.sendTo(c, 'lesson', seats(sim, board, c), {
    source: board,
    wait: Math.max(1, Math.round(until)),
    line: pupil ? 0 : 1,
  });
}

// Each tick at a lesson: it ends with the school day, or for the teacher, once there's nobody to teach.
export function stepLesson(sim: Simulation, c: Colonist): void {
  const job = c.job!;
  const empty = job.line === 1 && !sim.living().some((o) => o.job?.type === 'lesson' && o.job.line === 0);
  if (--job.wait <= 0 || empty || !isSchoolHour(sim) || sim.world.feature[job.source] !== LESSON_BOARD) {
    sim.endJob(c);
  }
}

// Ordinary work a teacher puts down when the children are waiting (not caring for someone, eating,
// sleeping or fighting a fire).
const PUT_DOWN = new Set([
  'mine',
  'chop',
  'forage',
  'construct',
  'deconstruct',
  'sow',
  'harvestCrop',
  'haul',
  'craft',
  'research',
  'clean',
  'sculpt',
  'wander',
  'fish',
  'joy',
]);

const atBoard = (sim: Simulation, c: Colonist, board: number) =>
  c.job?.type === 'lesson' &&
  c.job.source === board &&
  c.path.length === 0 &&
  Math.abs(sim.world.xOf(c.tile) - sim.world.xOf(board)) <= BOARD_RANGE &&
  Math.abs(sim.world.yOf(c.tile) - sim.world.yOf(board)) <= BOARD_RANGE;

const lessonLogged = new WeakMap<Simulation, number>();

// Called every hour: lessons teach the pupils at each board where the teacher is standing.
export function updateSchool(sim: Simulation): void {
  const living = sim.living();
  // Children waiting at the board call the teacher away from their work.
  if (isSchoolHour(sim) && living.some((c) => c.job?.type === 'lesson' && c.job.line === 0)) {
    const teacher = teacherFor(sim);
    if (teacher && teacher.job && PUT_DOWN.has(teacher.job.type) && sim.slotOf(teacher) !== 'J') {
      sim.dropCarried(teacher);
      sim.endJob(teacher);
    }
  }
  for (const board of lessonBoards(sim)) {
    const teacher = living.find((c) => c.job?.line === 1 && atBoard(sim, c, board));
    if (!teacher) {
      continue;
    }
    const pupils = living.filter((c) => c.job?.line === 0 && atBoard(sim, c, board));
    if (pupils.length === 0) {
      continue;
    }
    const skill = subject(sim, teacher);
    const xp = LESSON_XP + LESSON_XP_PER_LEVEL * teacher.skills[skill];
    for (const p of pupils) {
      learn(sim, p, skill, xp);
      if (p.passions[skill] === 0 && sim.rng.chance(KINDLE_CHANCE)) {
        p.passions[skill] = 1;
        sim.addLog(
          `${p.name} has found a love of ${SKILL_LABELS[skill].toLowerCase()} at ${teacher.name}'s lessons.`,
          'good',
        );
      }
      sim.addThought(p, 'hadLesson');
      remember(p, 'happy', 1);
    }
    sim.addThought(teacher, 'taughtLesson');
    sim.stats.lessons = (sim.stats.lessons ?? 0) + 1;
    // One line in the log a morning.
    if (lessonLogged.get(sim) !== sim.day) {
      lessonLogged.set(sim, sim.day);
      sim.addLog(
        `${teacher.name} taught ${pupils.map((p) => p.name).join(', ')} ${SKILL_LABELS[skill].toLowerCase()} at the lesson board.`,
      );
    }
  }
}

// ---- Play ----

// Children this close play together, with this chance an hour; it cheers them and builds friendships.
const PLAY_RANGE = 6;
const PLAY_CHANCE = 0.5;
const PLAY_JOY = 0.15;
const PLAY_OPINION = 4;
// A child with nothing to do looks for the others this far away.
const SEEK_RANGE = 30;
const playing = (sim: Simulation, c: Colonist) =>
  pupilAge(c) && free(sim, c) && (!c.job || c.job.type === 'wander' || c.job.type === 'joy');

// Called every hour: children near each other, and free, play together.
export function updatePlay(sim: Simulation): void {
  const kids = sim.living().filter((c) => playing(sim, c));
  for (let i = 0; i < kids.length; i++) {
    for (let j = i + 1; j < kids.length; j++) {
      const [a, b] = [kids[i], kids[j]];
      if (sim.world.distance(a.tile, b.tile) > PLAY_RANGE || !sim.rng.chance(PLAY_CHANCE)) {
        continue;
      }
      for (const [c, other] of [
        [a, b],
        [b, a],
      ]) {
        c.needs.joy = Math.min(1, c.needs.joy + PLAY_JOY);
        shiftOpinion(other, c, PLAY_OPINION);
        sim.addThought(c, 'playedTogether');
        remember(c, 'happy', 1);
      }
    }
  }
}

// A child with nothing better to do goes to find the other children.
export function trySeekPlaymate(sim: Simulation, c: Colonist): boolean {
  if (!pupilAge(c)) {
    return false;
  }
  const w = sim.world;
  const friend = sim
    .living()
    .filter(
      (o) =>
        o !== c &&
        playing(sim, o) &&
        w.distance(o.tile, c.tile) > PLAY_RANGE / 2 &&
        w.distance(o.tile, c.tile) <= SEEK_RANGE,
    )
    .sort((a, b) => w.distance(a.tile, c.tile) - w.distance(b.tile, c.tile))[0];
  if (!friend) {
    return false;
  }
  const near = w.neighbors(friend.tile).filter((i) => w.isPassable(i));
  return sim.sendTo(c, 'wander', near, { wait: TICKS_PER_HOUR / 2 });
}

// ---- Childhood memories ----

// Hours of a hard childhood (hungry or miserable, a parent lost, parents parting), and of a happy one
// (lessons, play, good days), that leave a lasting mark.
export const HARD_CHILDHOOD = 72;
export const HAPPY_CHILDHOOD = 320;
const MISERABLE_MOOD = 25;
const HAPPY_MOOD = 60;

export function remember(c: Colonist, kind: 'hard' | 'happy', hours: number): void {
  if (c.age >= ADULT) {
    return;
  }
  c.childhood ??= { hard: 0, happy: 0 };
  c.childhood[kind] += hours;
}

// Called every hour: hunger and misery count against a childhood, good days for it.
export function updateChildhood(sim: Simulation): void {
  for (const c of sim.living()) {
    if (c.age >= ADULT || c.age < TODDLER) {
      continue;
    }
    if (c.needs.food <= 0) {
      remember(c, 'hard', 1);
    }
    if (c.mood < MISERABLE_MOOD) {
      remember(c, 'hard', 0.5);
    } else if (c.mood >= HAPPY_MOOD) {
      remember(c, 'happy', 0.5);
    }
  }
}

// On coming of age: the childhood they had stays with them, as a memory, and sometimes in their nature.
// Returns a sentence for the log (empty for an ordinary childhood).
export function comeOfAge(sim: Simulation, c: Colonist): string {
  const { hard, happy } = c.childhood ?? { hard: 0, happy: 0 };
  c.childhood = undefined;
  if (hard >= HARD_CHILDHOOD) {
    sim.addThought(c, 'hardChildhood');
    const trait = gainTrait(sim, c, ['tough', 'pessimist']);
    return ` A hard childhood stays with them${trait ? ` (${TRAITS[trait].label})` : ''}.`;
  }
  if (happy >= HAPPY_CHILDHOOD) {
    sim.addThought(c, 'happyChildhood');
    const trait = gainTrait(sim, c, ['optimist', 'kind']);
    return ` They remember a happy childhood${trait ? ` (${TRAITS[trait].label})` : ''}.`;
  }
  return '';
}

// Half the time, a childhood adds one of these traits (one that fits with what they have).
function gainTrait(sim: Simulation, c: Colonist, options: string[]): string | undefined {
  if (!sim.rng.chance(0.5)) {
    return undefined;
  }
  const fits = options.filter(
    (t) => !c.traits.some((o) => o === t || TRAITS[o].excludes === t || TRAITS[t].excludes === o),
  );
  const trait = fits.length > 0 ? sim.rng.pick(fits) : undefined;
  if (trait) {
    c.traits.push(trait);
  }
  return trait;
}
