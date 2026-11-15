// Colonists carried off by raiders. When raiders overrun a colony (everyone down), they may take one of the fallen
// with them, as well as goods: on Harsh often, on Standard now and then, never on Peaceful, and never the last
// colonist. The colony has a few days to get them back: silver (on the same scale as tribute), or one of the
// raiders' own people it holds, in exchange. Some get away by themselves. Anyone still held when the time is up
// is never seen again, and mourned.
//
// (Walled, armed colonies lost nobody to raids in ten years, Harsh included: the fallen were patched up, since
// raiders pass over anyone down. Half or more of a colony went down at once in most Harsh colonies.)

import { FACTIONS, itemId } from './defs';
import { hostileDealing, tributeCost } from './diplomacy';
import { arrival, letGo } from './expeditions';
import { DRAFT_AGE } from './lifespans';
import { die } from './health';
import { handOver } from './prisoners';
import { TICKS_PER_HOUR } from './constants';
import type { Simulation } from './simulation';
import type { Difficulty } from './storyteller';
import { colonyStock, takeFromStockpiles } from './trade';
import type { Colonist } from './types';

export interface Taken {
  colonist: number;
  faction: number;
  // When the raiders give up on being paid: the colonist is lost.
  until: number;
  // Their price, fixed when they were taken (tribute's rises by the day: a colony that put by what was asked
  // found it short). Missing in a save from before it was kept: today's tribute.
  cost?: number;
}

const DAY = TICKS_PER_HOUR * 24;
// The chance an overrun ends with someone carried off.
export const TAKEN_CHANCE: Record<Difficulty, number> = { peaceful: 0, standard: 0.15, harsh: 0.35 };
// Days the raiders hold someone, waiting to be paid.
export const HELD_DAYS = 6;
// Each day, the chance a captive gets away by themselves.
const ESCAPE_CHANCE = 0.06;
// The youngest the raiders take.
const TAKEN_AGE = 16;

export const takenList = (sim: Simulation): Taken[] => sim.diplomacy.taken ?? [];
export const isTaken = (sim: Simulation, id: number): boolean => takenList(sim).some((t) => t.colonist === id);
export const takenBy = (sim: Simulation, id: number): Taken | undefined =>
  takenList(sim).find((t) => t.colonist === id);
// What the raiders ask: as much as a season's peace from them.
// (A function, not tributeCost itself: this module and expeditions.ts import each other.)
export const buyBackCost = (sim: Simulation, t?: Taken): number => t?.cost ?? tributeCost(sim);

// Why the colony can't deal for someone just now (their people attacking: the one handed back walked in among
// them), or null.
export function dealBlocked(sim: Simulation, t: Taken): string | null {
  return sim.enemies.some((e) => e.faction === t.faction && e.hp > 0 && !e.fleeing)
    ? `Not while ${FACTIONS[t.faction].name} are attacking.`
    : null;
}

// After a raid that overran the colony: maybe one of the fallen goes with the raiders. Returns who.
export function carryOff(sim: Simulation, faction: number): Colonist | undefined {
  const living = sim.living();
  const fallen = living.filter((c) => c.health.downed && c.age >= TAKEN_AGE);
  if (fallen.length === 0 || sim.rng.next() >= TAKEN_CHANCE[sim.story.difficulty]) {
    return undefined;
  }
  // Never the last who could look after the rest: someone old enough to fight stays (taking a lone parent left a
  // baby with nobody, and a child who could neither haul the silver nor send anyone).
  const c = sim.rng.pick(fallen);
  if (!living.some((o) => o !== c && o.age >= DRAFT_AGE)) {
    return undefined;
  }
  // (As anyone leaving the map: whoever was on their way to tend them, a concert they were giving, an animal
  // after them, all let go. A doctor walked to where they had lain and tended them, held miles off.)
  letGo(sim, c);
  c.away = 'gone';
  c.path = [];
  c.moveProgress = 0;
  const cost = buyBackCost(sim);
  const d = sim.diplomacy;
  d.taken = [...takenList(sim), { colonist: c.id, faction, until: sim.tick + HELD_DAYS * DAY, cost }];
  sim.stats.taken = (sim.stats.taken ?? 0) + 1;
  sim.addLog(
    `${FACTIONS[faction].name} carried ${c.name} off with them. They'll give ${c.name} back for ${cost} silver, or one of their own you hold, within ${HELD_DAYS} days (Factions).`,
    'danger',
    true,
    { colonist: c.id },
  );
  return c;
}

// Pays the raiders' price for a colonist they hold. Returns why not, if it can't be done.
export function buyBack(sim: Simulation, id: number): string | null {
  const t = takenBy(sim, id);
  if (!t) {
    return 'Nobody by that name is held.';
  }
  const blocked = dealBlocked(sim, t);
  if (blocked) {
    return blocked;
  }
  const cost = buyBackCost(sim, t);
  if (colonyStock(sim, itemId('silver')) < cost) {
    return `They want ${cost} silver.`;
  }
  takeFromStockpiles(sim, itemId('silver'), cost);
  sim.stats.boughtBack = (sim.stats.boughtBack ?? 0) + 1;
  bringBack(sim, t, `The colony paid ${FACTIONS[t.faction].name} ${cost} silver.`);
  return null;
}

// Gives back one of the raiders' own people the colony holds, for a colonist they hold.
export function exchange(sim: Simulation, id: number, captive: number): string | null {
  const t = takenBy(sim, id);
  if (!t) {
    return 'Nobody by that name is held.';
  }
  const blocked = dealBlocked(sim, t);
  if (blocked) {
    return blocked;
  }
  // (A prisoner: one of theirs lying wounded where they fell isn't held, and was a swap for the taking.)
  const p = sim.captives.find((q) => q.id === captive && q.state === 'prisoner');
  if (!p || p.faction !== t.faction) {
    return `${FACTIONS[t.faction].name} want one of their own back, held prisoner.`;
  }
  handOver(sim, p);
  hostileDealing(sim, t.faction, 'released');
  sim.stats.exchanged = (sim.stats.exchanged ?? 0) + 1;
  bringBack(sim, t, `${p.name} went back to ${FACTIONS[t.faction].name} in exchange.`);
  return null;
}

// Every in-game hour: someone getting away (a chance each day, at dawn), and anyone held too long lost.
export function updateTaken(sim: Simulation): void {
  for (const t of takenList(sim)) {
    const c = sim.colonists[t.colonist];
    if (!c || c.health.dead) {
      forget(sim, t);
    } else if (sim.tick >= t.until) {
      forget(sim, t);
      sim.stats.lostToRaiders = (sim.stats.lostToRaiders ?? 0) + 1;
      // (Their gear went with them.)
      c.weapon = 'fists';
      c.armor = null;
      c.apparel = null;
      c.tool = null;
      die(
        sim,
        c,
        'raiders',
        `${c.name} was never seen again: ${FACTIONS[t.faction].name} gave up waiting to be paid and took them beyond the hills.`,
        false,
      );
      // (Still away, as they were: no body lies where they fell. They're mourned, but there's nobody to bury.)
    } else if (Math.floor(sim.hour) === 6 && sim.rng.next() < ESCAPE_CHANCE) {
      sim.stats.escaped = (sim.stats.escaped ?? 0) + 1;
      bringBack(sim, t, `${c.name} slipped away from ${FACTIONS[t.faction].name} in the night.`);
    }
  }
}

function forget(sim: Simulation, t: Taken): void {
  sim.diplomacy.taken = takenList(sim).filter((x) => x !== t);
}

// Home again, in from the edge nearest the colony: still hurt (their wounds bound), shaken, and glad to see them
// back.
function bringBack(sim: Simulation, t: Taken, how: string): void {
  forget(sim, t);
  const c = sim.colonists[t.colonist];
  c.away = undefined;
  c.tile = arrival(sim, [c]);
  c.path = [];
  c.moveProgress = 0;
  c.job = null;
  c.needs.food = Math.max(c.needs.food, 0.3);
  for (const injury of c.health.injuries) {
    injury.bleeding = 0;
  }
  sim.addThought(c, 'wasTaken');
  for (const o of sim.living()) {
    if (o !== c) {
      sim.addThought(o, 'broughtHome');
    }
  }
  sim.addLog(`${how} ${c.name} is coming home.`, 'good', true, { colonist: c.id });
}
