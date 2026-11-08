import { TRAITS, TraitDef } from './defs';
import { Rng, hash2 } from './rng';
import { canRomance } from './lifespans';
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

function interact(sim: Simulation, a: Colonist, b: Colonist, insults = 1): void {
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
  } else {
    adjust(a, b, 1.5 + 2 * chemistry);
    adjust(b, a, 1.5 + 2 * chemistry);
  }

  // Married couples see their rough patches through.
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
