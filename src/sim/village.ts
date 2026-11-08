import { seasonDay } from './seasons';
import { foodDays } from './storyteller';
import { ADULT } from './lifespans';
import type { Simulation } from './simulation';
import { traitValue } from './social';
import { Colonist } from './types';

// The village: a leader the colonists choose for themselves, and the policies the colony lives by. Each
// policy pleases some and annoys others, by their nature.

export type Rations = 'frugal' | 'normal' | 'generous';
export type Hours = 'short' | 'normal' | 'long';

export interface Village {
  // The leader's colonist id (-1: none).
  leader: number;
  // When the last vote was held.
  electedOn: number;
  rations: Rations;
  hours: Hours;
  // One day in six, nobody works.
  restDays: boolean;
  // Whether today is a day of rest after all (called off when the stores are nearly empty), and the
  // day that was decided.
  resting: boolean;
  restDecidedOn: number;
}

export const freshVillage = (): Village => ({
  leader: -1,
  electedOn: -1,
  rations: 'normal',
  hours: 'normal',
  restDays: false,
  resting: false,
  restDecidedOn: -1,
});

export const POLICY_TEXT = {
  rations: {
    frugal: 'Frugal rations: everyone eats a fifth less, and grumbles about it (gluttons most)',
    normal: 'Normal rations',
    generous: 'Generous rations: everyone eats sooner and more, and enjoys it',
  },
  hours: {
    short: 'Short hours: work goes 10% slower, and everyone is glad of it (the lazy most)',
    normal: 'Normal hours',
    long: "Long hours: work goes 10% faster, and everyone resents it (hard workers don't mind)",
  },
} as const;

// Only so many votes: at least this many adults make an election worth holding.
const MIN_VOTERS = 3;
// How much a kind nature counts for with the voters, and a sour one against.
const KIND_VOTES = 15;
const ABRASIVE_VOTES = -15;
// A leader in good spirits lifts everyone; a miserable one drags them down.
export const GOOD_LEADER_MOOD = 45;
export const POOR_LEADER_MOOD = 25;

const adults = (sim: Simulation) => sim.living().filter((c) => c.age >= ADULT && !c.health.downed);

// Who the colony would choose: each adult backs whoever they think best of (never themselves), with a
// kind nature counting for a candidate and an abrasive one against.
export function tally(sim: Simulation): Map<number, number> {
  const voters = adults(sim);
  const votes = new Map<number, number>();
  if (voters.length < MIN_VOTERS) {
    return votes;
  }
  for (const voter of voters) {
    let best: Colonist | undefined;
    let bestScore = -Infinity;
    for (const candidate of voters) {
      if (candidate === voter) {
        continue;
      }
      const manner =
        traitValue(candidate, 'insultChance') === 0
          ? KIND_VOTES
          : (traitValue(candidate, 'insultChance') ?? 0) > 0.2
            ? ABRASIVE_VOTES
            : 0;
      const score = (voter.opinions[candidate.id] ?? 0) + manner + candidate.mood * 0.1;
      if (score > bestScore || (score === bestScore && best && candidate.id < best.id)) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best) {
      votes.set(best.id, (votes.get(best.id) ?? 0) + 1);
    }
  }
  return votes;
}

// Holds a vote: the most votes wins (ties go to whoever the colony likes more overall).
export function elect(sim: Simulation): Colonist | null {
  const voters = adults(sim);
  if (voters.length < MIN_VOTERS) {
    return null;
  }
  const votes = tally(sim);
  const liked = (c: Colonist) => voters.reduce((sum, v) => sum + (v.opinions[c.id] ?? 0), 0);
  const winner = [...votes.entries()]
    .map(([id, n]) => ({ c: sim.colonists[id], n }))
    .sort((a, b) => b.n - a.n || liked(b.c) - liked(a.c) || a.c.id - b.c.id)[0];
  if (!winner) {
    return null;
  }
  const v = sim.village;
  const again = v.leader === winner.c.id;
  v.leader = winner.c.id;
  v.electedOn = sim.day;
  sim.stats.elections = (sim.stats.elections ?? 0) + 1;
  if (!again) {
    sim.addThought(winner.c, 'chosenLeader');
  }
  sim.addLog(
    again
      ? `${winner.c.name} has been chosen to lead the colony again (${winner.n} of ${voters.length} votes).`
      : `The colony has chosen ${winner.c.name} as its leader (${winner.n} of ${voters.length} votes).`,
    'good',
    // A new leader is news; the same one again isn't worth a card.
    !again,
  );
  return winner.c;
}

// Called every in-game hour: a vote at dawn on the first day of each season, and as soon as the colony
// finds itself without a leader (and has the adults to choose one).
export function updateVillage(sim: Simulation): void {
  updateRest(sim);
  const v = sim.village;
  // (A leader who dies leaves office at once; see `die`. This catches anything else, like an old save.)
  const leader = sim.colonists[v.leader];
  if (v.leader >= 0 && (!leader || leader.health.dead)) {
    v.leader = -1;
  }
  const dawn = Math.floor(sim.hour) === 7;
  const newSeason = seasonDay(sim.totalHours) === 1 && v.electedOn !== sim.day;
  if (v.leader < 0 || (dawn && newSeason)) {
    elect(sim);
  }
}

// ---- What the policies do ----

// How fast a colonist gets hungry, and how hungry before they go to eat.
export const rationsHunger = (v: Village): number =>
  v.rations === 'frugal' ? 0.8 : v.rations === 'generous' ? 1.15 : 1;
export const rationsEatBelow = (v: Village): number => (v.rations === 'generous' ? 0.45 : 0.3);
export const hoursSpeed = (v: Village): number => (v.hours === 'long' ? 1.1 : v.hours === 'short' ? 0.9 : 1);
// Whether today is a day of rest.
export const restDay = (sim: Simulation): boolean => sim.village.resting;
// Less than this many days of food and nobody takes the day off.
const REST_NEEDS_FOOD_DAYS = 1.5;

// Whether today is a day of rest: one day in six, decided once that day, and called off if the stores are
// nearly empty. Called every hour and when the policy changes.
export function updateRest(sim: Simulation): void {
  const v = sim.village;
  if (!v.restDays || sim.day % 6 !== 0) {
    v.resting = false;
    v.restDecidedOn = -1;
    return;
  }
  if (v.restDecidedOn === sim.day) {
    return;
  }
  v.restDecidedOn = sim.day;
  v.resting = foodDays(sim) >= REST_NEEDS_FOOD_DAYS;
  if (!v.resting) {
    sim.addLog('The stores are nearly empty: the day of rest is called off.', 'warn');
  }
}

// How each colonist feels about the leader and the policies, as thought keys.
export function villageThoughts(sim: Simulation, c: Colonist): string[] {
  const v = sim.village;
  const keys: string[] = [];
  const leader = sim.colonists[v.leader];
  if (leader && !leader.health.dead && leader !== c && c.age >= ADULT) {
    if (leader.mood >= GOOD_LEADER_MOOD) {
      keys.push(sim.isResearched('civics') ? 'wellLedCivic' : 'wellLed');
    } else if (leader.mood < POOR_LEADER_MOOD) {
      keys.push('poorlyLed');
    }
  }
  if (v.rations === 'frugal') {
    keys.push(c.traits.includes('glutton') ? 'frugalRationsGlutton' : 'frugalRations');
  } else if (v.rations === 'generous') {
    keys.push('generousRations');
  }
  if (v.hours === 'long' && !c.traits.includes('hardWorker')) {
    keys.push(c.traits.includes('lazy') ? 'longHoursLazy' : 'longHours');
  } else if (v.hours === 'short') {
    keys.push(c.traits.includes('lazy') ? 'shortHoursLazy' : 'shortHours');
  }
  if (restDay(sim)) {
    keys.push('dayOfRest');
  }
  return keys;
}
