import { TRAITS, TraitDef } from './defs';
import { Rng, hash2 } from './rng';
import { ADULT, TEEN, canRomance } from './lifespans';
import { damage, painOf } from './health';
import type { Simulation } from './simulation';
import { Colonist } from './types';

export const FRIEND_OPINION = 30;
export const RIVAL_OPINION = -30;
const LOVER_OPINION = 50;
const BREAKUP_OPINION = 15;
// Chance per slow update that two nearby colonists interact.
const INTERACTION_CHANCE = 0.03;
const INTERACTION_RANGE = 5;

type NumericTraitField = 'workSpeed' | 'plantSpeed' | 'joyDecay' | 'foodDecay' | 'damageTaken' | 'opinionGiven';

// Product of a multiplicative trait modifier across a colonist's traits (1 if none apply).
export function traitFactor(c: Colonist, field: NumericTraitField): number {
  return c.traits.reduce((product, key) => product * (TRAITS[key][field] ?? 1), 1);
}

export function traitValue<K extends keyof TraitDef>(c: Colonist, field: K): TraitDef[K] | undefined {
  for (const key of c.traits) {
    if (TRAITS[key][field] !== undefined) {
      return TRAITS[key][field];
    }
  }
  return undefined;
}

export function rollTraits(rng: Rng): string[] {
  const keys = Object.keys(TRAITS);
  const traits: string[] = [];
  while (traits.length < 2) {
    const key = rng.pick(keys);
    const clashes = traits.some((t) => t === key || TRAITS[t].excludes === key || TRAITS[key].excludes === t);
    if (!clashes) {
      traits.push(key);
    }
  }
  return traits;
}

// Fixed chemistry between two colonists, -1 (oil and water) to 1 (kindred spirits).
export function compatibility(sim: Simulation, a: Colonist, b: Colonist): number {
  return hash2(Math.min(a.id, b.id), Math.max(a.id, b.id), sim.seed) * 2 - 1;
}

// Opinions are one-way; relationships use the lower of the two.
export function mutualOpinion(a: Colonist, b: Colonist): number {
  return Math.min(a.opinions[b.id] ?? 0, b.opinions[a.id] ?? 0);
}

export function relationLabel(a: Colonist, b: Colonist): string | null {
  if (a.lover === b.id) {
    return 'Lover';
  }
  const opinion = mutualOpinion(a, b);
  if (opinion >= FRIEND_OPINION) {
    return 'Friend';
  }
  if (opinion <= RIVAL_OPINION) {
    return 'Rival';
  }
  return null;
}

export function socialThoughts(sim: Simulation, c: Colonist): string[] {
  const keys: string[] = [];
  const others = sim.living().filter((o) => o.id !== c.id);
  if (c.lover >= 0 && !sim.colonists[c.lover].health.dead) {
    keys.push('hasLover');
  }
  if (c.spouse >= 0 && !sim.colonists[c.spouse].health.dead) {
    keys.push('married');
  }
  if (others.some((o) => o.id !== c.lover && mutualOpinion(c, o) >= FRIEND_OPINION)) {
    keys.push('hasFriend');
  }
  if (others.some((o) => mutualOpinion(c, o) <= RIVAL_OPINION)) {
    keys.push('hasRival');
  }
  return keys;
}

// `to` warms to (or cools on) `from` by `amount`.
export const shiftOpinion = (from: Colonist, to: Colonist, amount: number): void => adjust(from, to, amount);

function adjust(from: Colonist, to: Colonist, amount: number): void {
  // `to` changes its opinion of `from`; kind people are liked faster.
  const scaled = amount > 0 ? amount * traitFactor(from, 'opinionGiven') : amount;
  to.opinions[from.id] = Math.max(-100, Math.min(100, (to.opinions[from.id] ?? 0) + scaled));
}

// Talk over a game: friendlier than talk in passing, with far fewer insults.
const GAME_INSULTS = 0.3;

// One exchange between two colonists sharing a game.
export function converse(sim: Simulation, a: Colonist, b: Colonist): void {
  interact(sim, a, b, GAME_INSULTS);
}

// Talk between people who can't stand each other, or between anyone in a foul mood, can turn into an
// argument; between bitter rivals an argument can come to blows. Each person argues at most once in
// ARGUED hours (the thought it leaves is the cooldown).
const ARGUE_OPINION = -10;
const ARGUE_CHANCE = 0.1;
// Below this mood, anyone gets short-tempered: up to this much more chance of a row.
const IRRITABLE_MOOD = 25;
const IRRITABLE_ARGUE = 0.12;
const BLOWS_CHANCE = 0.1;
// Bruises from a scuffle: enough to hurt and slow them for a day, never enough to put anyone down.
const BRUISE_MIN = 0.04;
const BRUISE_MAX = 0.1;
// Too hurt to throw a punch.
const FIGHT_PAIN = 0.3;
const PEACEMAKER_RANGE = 8;

const argued = (sim: Simulation, c: Colonist) => c.thoughts.some((t) => t.key === 'argued' && t.expires > sim.tick);

// The chance this exchange turns into an argument.
export function argueChance(a: Colonist, b: Colonist): number {
  if (a.age < TEEN / 2 || b.age < TEEN / 2) {
    return 0;
  }
  // A kind soul doesn't pick fights; a sour one picks more.
  const manner = traitValue(a, 'insultChance');
  if (manner === 0) {
    return 0;
  }
  const temper = (manner ?? 0) > 0.2 ? 1.5 : 1;
  const grudge = mutualOpinion(a, b) <= ARGUE_OPINION ? ARGUE_CHANCE : 0;
  const mood = Math.min(a.mood, b.mood);
  const irritable = mood < IRRITABLE_MOOD ? ((IRRITABLE_MOOD - mood) / IRRITABLE_MOOD) * IRRITABLE_ARGUE : 0;
  return (grudge + irritable) * temper;
}

function argue(sim: Simulation, a: Colonist, b: Colonist): void {
  adjust(a, b, -5);
  adjust(b, a, -5);
  sim.addThought(a, 'argued');
  sim.addThought(b, 'argued');
  sim.stats.arguments = (sim.stats.arguments ?? 0) + 1;
  const fit = (c: Colonist) =>
    c.age >= TEEN && !c.drafted && !c.health.downed && painOf(c) < FIGHT_PAIN && !sim.inMentalBreak(c);
  const rivals = mutualOpinion(a, b) <= RIVAL_OPINION;
  const temper = (traitValue(a, 'insultChance') ?? 0) > 0.2 || (traitValue(b, 'insultChance') ?? 0) > 0.2 ? 2 : 1;
  if (rivals && !sim.raid && fit(a) && fit(b) && sim.rng.chance(BLOWS_CHANCE * temper)) {
    fistfight(sim, a, b);
    return;
  }
  sim.addLog(`${a.name} and ${b.name} argued bitterly.`, 'warn');
}

// A scuffle: a few bruises each, worse feelings, and over quickly (someone nearby pulls them apart).
function fistfight(sim: Simulation, a: Colonist, b: Colonist): void {
  for (const c of [a, b]) {
    const blows = sim.rng.int(1, 2);
    for (let k = 0; k < blows; k++) {
      damage(sim, c, BRUISE_MIN + sim.rng.next() * (BRUISE_MAX - BRUISE_MIN), 'bruise');
    }
    sim.addThought(c, 'fistfight');
  }
  adjust(a, b, -8);
  adjust(b, a, -8);
  sim.stats.fights = (sim.stats.fights ?? 0) + 1;
  const peacemaker = sim
    .living()
    .filter(
      (o) =>
        o !== a &&
        o !== b &&
        o.age >= ADULT &&
        !o.sleeping &&
        !o.health.downed &&
        sim.world.distance(o.tile, a.tile) <= PEACEMAKER_RANGE,
    )
    .sort((x, y) => sim.world.distance(x.tile, a.tile) - sim.world.distance(y.tile, a.tile))[0];
  sim.addLog(
    peacemaker
      ? `${a.name} and ${b.name} came to blows, until ${peacemaker.name} pulled them apart.`
      : `${a.name} and ${b.name} came to blows, and fought until both were spent.`,
    'danger',
    true,
  );
}

// A married colonist growing close to someone they have real chemistry with makes their spouse jealous
// (a seed of the troubles that can end a marriage). At most once a day for each spouse (the thought is
// the cooldown).
const JEALOUS_CHEMISTRY = 0.4;
const JEALOUS_CHANCE = 0.25;
const JEALOUS_OPINION = -12;
function jealousy(sim: Simulation, c: Colonist, other: Colonist, chemistry: number): void {
  const spouse = sim.colonists[c.spouse];
  if (
    !spouse ||
    spouse.health.dead ||
    // (Away on an expedition: they don't see it.)
    !!spouse.away ||
    spouse === other ||
    chemistry < JEALOUS_CHEMISTRY ||
    !canRomance(sim, c, other) ||
    mutualOpinion(c, other) < LOVER_OPINION ||
    spouse.thoughts.some((t) => t.key === 'jealous' && t.expires > sim.tick) ||
    !sim.rng.chance(JEALOUS_CHANCE)
  ) {
    return;
  }
  adjust(c, spouse, JEALOUS_OPINION);
  sim.addThought(spouse, 'jealous');
  sim.addLog(`${spouse.name} is jealous of how close ${c.name} and ${other.name} have grown.`, 'warn');
}

function interact(sim: Simulation, a: Colonist, b: Colonist, insults = 1): void {
  if (!argued(sim, a) && !argued(sim, b) && sim.rng.next() < argueChance(a, b) * insults) {
    argue(sim, a, b);
    return;
  }
  const before = relationLabel(a, b);
  const chemistry = compatibility(sim, a, b);
  // Bad chemistry breeds insults; good chemistry, deep talks.
  const traitInsults = traitValue(a, 'insultChance');
  const insultChance = traitInsults === 0 ? 0 : ((traitInsults ?? 0.04) + Math.max(0, -chemistry) * 0.08) * insults;
  const deepTalkChance = 0.06 + Math.max(0, chemistry) * 0.14;
  const roll = sim.rng.next();
  if (roll < insultChance) {
    adjust(a, b, -10);
    adjust(b, a, -3);
    sim.addThought(b, 'insulted');
    sim.addLog(`${a.name} insulted ${b.name}.`, 'warn');
  } else if (roll < insultChance + deepTalkChance) {
    adjust(a, b, 6);
    adjust(b, a, 6);
    sim.addThought(a, 'deepTalk');
    sim.addThought(b, 'deepTalk');
    if (
      a.lover < 0 &&
      b.lover < 0 &&
      canRomance(sim, a, b) &&
      chemistry > 0.2 &&
      mutualOpinion(a, b) >= LOVER_OPINION &&
      sim.rng.next() < 0.3
    ) {
      a.lover = b.id;
      b.lover = a.id;
      sim.addLog(`${a.name} and ${b.name} have fallen in love.`, 'good', true);
      return;
    }
    jealousy(sim, a, b, chemistry);
    jealousy(sim, b, a, chemistry);
  } else {
    adjust(a, b, 1.5 + 2 * chemistry);
    adjust(b, a, 1.5 + 2 * chemistry);
  }

  // Married couples see their rough patches through (or part in time; see checkMarriages).
  if (a.lover === b.id && a.spouse !== b.id && mutualOpinion(a, b) < BREAKUP_OPINION) {
    a.lover = -1;
    b.lover = -1;
    sim.addLog(`${a.name} and ${b.name} have broken up.`, 'warn', true);
    return;
  }
  const after = relationLabel(a, b);
  if (after !== before && after === 'Friend') {
    sim.addLog(`${a.name} and ${b.name} have become friends.`, 'good', true);
  } else if (after !== before && after === 'Rival') {
    sim.addLog(`${a.name} and ${b.name} have become rivals.`, 'warn', true);
  }
}

// Each morning, feelings fade a little towards indifference: a friendship needs keeping up, and a
// grudge wears off unless it's fed. So relationships can change over the years instead of settling
// for good.
const OPINION_FADE = 0.02;
export function fadeOpinions(sim: Simulation): void {
  const living = sim.living();
  const before = new Map<string, string | null>();
  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) {
      before.set(`${i}:${j}`, relationLabel(living[i], living[j]));
    }
  }
  for (const c of living) {
    for (const o of living) {
      if (o !== c && c.opinions[o.id] !== undefined) {
        c.opinions[o.id] *= 1 - OPINION_FADE;
      }
    }
  }
  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) {
      const [a, b] = [living[i], living[j]];
      const was = before.get(`${i}:${j}`);
      const now = relationLabel(a, b);
      if (was === 'Rival' && now !== 'Rival') {
        sim.addLog(`${a.name} and ${b.name} have let their quarrel go.`, 'good');
      } else if (was === 'Friend' && now !== 'Friend' && now !== 'Lover') {
        sim.addLog(`${a.name} and ${b.name} have drifted apart.`, 'info');
      }
    }
  }
}

// A married couple at odds (their opinion of each other this low) for this many days may part; each
// morning after that, with this chance. A hard time (either of them miserable) strains a marriage a
// little each day.
const STRAINED_OPINION = 10;
const SEPARATE_AFTER_DAYS = 6;
const SEPARATE_CHANCE = 0.3;
const HARD_TIMES_MOOD = 25;
const HARD_TIMES_STRAIN = 3;
// Hours of a hard childhood that seeing your parents part counts for.
const PARENTS_PARTED = 48;

// Called each morning: marriages under strain, and the ones that end.
export function checkMarriages(sim: Simulation): void {
  for (const a of sim.living()) {
    const b = sim.colonists[a.spouse];
    // (Not while one of them is away: no strain from a distance, and none settled either.)
    if (!b || b.health.dead || b.away || a.id > b.id) {
      continue;
    }
    if (Math.min(a.mood, b.mood) < HARD_TIMES_MOOD) {
      adjust(a, b, -HARD_TIMES_STRAIN);
      adjust(b, a, -HARD_TIMES_STRAIN);
    }
    if (mutualOpinion(a, b) >= STRAINED_OPINION) {
      a.strainedSince = undefined;
      b.strainedSince = undefined;
      continue;
    }
    if (a.strainedSince === undefined) {
      a.strainedSince = sim.day;
      b.strainedSince = sim.day;
      sim.addLog(`${a.name} and ${b.name} are going through a rough patch.`, 'warn');
      continue;
    }
    if (sim.day - a.strainedSince >= SEPARATE_AFTER_DAYS && sim.rng.chance(SEPARATE_CHANCE)) {
      separate(sim, a, b);
    }
  }
}

export function separate(sim: Simulation, a: Colonist, b: Colonist): void {
  for (const [c, other] of [
    [a, b],
    [b, a],
  ]) {
    c.spouse = -1;
    c.lover = -1;
    c.strainedSince = undefined;
    c.separatedFrom = other.id;
    sim.addThought(c, 'separated');
    adjust(other, c, -10);
  }
  // Their children feel it too, the young ones most.
  for (const child of sim.living()) {
    if (child.parents.includes(a.id) || child.parents.includes(b.id)) {
      sim.addThought(child, child.age < ADULT ? 'parentsSeparated' : 'parentsSeparatedGrown');
      if (child.age < ADULT) {
        child.childhood ??= { hard: 0, happy: 0 };
        child.childhood.hard += PARENTS_PARTED;
      }
    }
  }
  sim.stats.separations = (sim.stats.separations ?? 0) + 1;
  sim.addLog(`${a.name} and ${b.name} have separated: their marriage is over.`, 'warn', true);
}
// Nearby, awake colonists occasionally talk, which slowly shifts their opinions of each other.
export function updateSocial(sim: Simulation): void {
  const w = sim.world;
  const awake = sim.living().filter((c) => !c.sleeping && !c.health.downed && !sim.inMentalBreak(c));
  for (let i = 0; i < awake.length; i++) {
    for (let j = i + 1; j < awake.length; j++) {
      const a = awake[i];
      const b = awake[j];
      if (w.distance(a.tile, b.tile) > INTERACTION_RANGE || sim.rng.next() >= INTERACTION_CHANCE) {
        continue;
      }
      if (sim.rng.next() < 0.5) {
        interact(sim, a, b);
      } else {
        interact(sim, b, a);
      }
    }
  }
}
