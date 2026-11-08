import { TICKS_PER_HOUR, populationFor } from './constants';
import { FACTIONS, featureId } from './defs';
import { traitFactor, traitValue } from './social';
import type { Simulation } from './simulation';
import { Captive, Colonist, Enemy } from './types';

// Prisoners and recruiting. A raider brought down may fall wounded instead of dying. Marked with the
// Capture order, a warden carries them to a prisoner bed; there wardens feed them and talk them round
// until their resistance is worn away and they agree to join. Left lying, they die of their wounds;
// left unfed in a cell, they starve.

// Chance a raider brought down falls wounded rather than dying.
export const DOWN_CHANCE = 0.5;
// A downed raider dies of their wounds this long after falling, unless taken prisoner.
export const DOWNED_TICKS = TICKS_PER_HOUR * 24;
// A prisoner in bed gets hungry half as fast as a colonist up and about; a warden brings food below
// FEED_BELOW.
export const PRISONER_FOOD_PER_HOUR = 1 / 32;
export const FEED_BELOW = 0.4;
// A prisoner starving this many hours dies.
export const STARVE_HOURS = 48;
// Wardens talk with each prisoner at most this often, and only while the prisoner is awake.
export const VISIT_GAP = TICKS_PER_HOUR * 6;
export const AWAKE_FROM = 8;
export const AWAKE_UNTIL = 21;
// A talk takes this long.
export const TALK_TICKS = 80;
// Once resistance is gone, each talk has this chance of winning them over (better from a happy,
// kind warden).
export const RECRUIT_CHANCE = 0.35;

export const PRISONER_BED = featureId('prisonerBed');

// Called as a raider falls: whether they go down wounded (and become a captive) instead of dying.
// `inPain`: knocked down by pain rather than struck dead, they always live to be taken.
export function fallWounded(sim: Simulation, e: Enemy, inPain = false): boolean {
  if (!inPain && sim.rng.next() >= DOWN_CHANCE) {
    return false;
  }
  sim.captives.push({
    id: e.id,
    name: e.name,
    faction: e.faction,
    tile: e.tile,
    state: 'downed',
    capture: false,
    since: sim.tick,
    food: 0.6,
    // Hardened raiders take longer to win over.
    resistance: 3 + FACTIONS[e.faction].skill * 0.5 + sim.rng.next() * 3,
    skill: e.skill,
    lastVisit: 0,
    hungryHours: 0,
  });
  return true;
}

export const prisoners = (sim: Simulation): Captive[] => sim.captives.filter((p) => p.state === 'prisoner');

// Called every in-game hour: the downed bleed out, prisoners get hungry.
export function updateCaptives(sim: Simulation): void {
  for (const p of [...sim.captives]) {
    if (p.state === 'downed') {
      if (sim.tick - p.since >= DOWNED_TICKS) {
        remove(sim, p);
        sim.addLog(`${p.name} died of their wounds.`, 'info');
      }
      continue;
    }
    // With their bed gone, nothing holds them.
    if (sim.world.feature[p.tile] !== PRISONER_BED) {
      remove(sim, p);
      sim.addLog(`The prisoner ${p.name} slipped away when their bed was taken down.`, 'warn', true);
      continue;
    }
    p.food = Math.max(0, p.food - PRISONER_FOOD_PER_HOUR);
    if (p.food > 0) {
      p.hungryHours = 0;
      continue;
    }
    p.hungryHours++;
    // Mistreatment hardens them.
    p.resistance += 0.1;
    if (p.hungryHours === 12) {
      sim.addLog(`The prisoner ${p.name} is starving. Give a colonist Warden work to bring them food.`, 'warn');
    }
    if (p.hungryHours >= STARVE_HOURS) {
      remove(sim, p);
      sim.addLog(`The prisoner ${p.name} starved to death.`, 'danger', true);
    }
  }
}

// Whether a prisoner is due a talk.
export function visitDue(sim: Simulation, p: Captive): boolean {
  const hour = sim.hour;
  return p.state === 'prisoner' && sim.tick - p.lastVisit >= VISIT_GAP && hour >= AWAKE_FROM && hour < AWAKE_UNTIL;
}

// How persuasive a warden is: their mood, and a kind manner (an abrasive one hardly helps).
export function persuasion(c: Colonist): number {
  const manner = traitFactor(c, 'opinionGiven') * ((traitValue(c, 'insultChance') ?? 0) > 0.2 ? 0.7 : 1);
  return Math.max(0.3, (0.5 + c.mood / 100) * manner);
}

// A warden's talk with a prisoner: wears down their resistance, and once that's gone, may win them over.
// Returns the new colonist if they join.
export function talk(sim: Simulation, warden: Colonist, p: Captive): Colonist | null {
  p.lastVisit = sim.tick;
  const power = persuasion(warden);
  if (p.resistance > 0) {
    p.resistance = Math.max(0, p.resistance - power);
    if (p.resistance > 0) {
      sim.addLog(`${warden.name} talked with the prisoner ${p.name}.`);
      return null;
    }
    sim.addLog(`${p.name} is warming to the colony: ${warden.name} may win them over soon.`, 'good');
    return null;
  }
  // A full colony can't take them in (as with travellers asking to join): they'll wait, or can be let go.
  if (!roomToJoin(sim)) {
    sim.addLog(`${p.name} would join, but the colony has no room for more. Release them, or wait.`);
    return null;
  }
  if (!sim.rng.chance(Math.min(0.9, RECRUIT_CHANCE * power))) {
    sim.addLog(`${warden.name} tried to win over ${p.name}, who isn't ready yet.`);
    return null;
  }
  remove(sim, p);
  const c = sim.adopt(p.name, p.tile);
  c.skills.combat = Math.max(c.skills.combat, Math.min(20, Math.round(p.skill)));
  sim.stats.recruited = (sim.stats.recruited ?? 0) + 1;
  sim.addLog(`${warden.name} has won over ${p.name}, who joins the colony!`, 'good', true);
  return c;
}

// Whether the colony has room for another member (the map's population cap).
export const roomToJoin = (sim: Simulation): boolean =>
  sim.living().length < populationFor(sim.world.width).maxColonists;

// Lets a prisoner (or a downed raider) go.
export function release(sim: Simulation, id: number): boolean {
  const p = sim.captives.find((q) => q.id === id);
  if (!p) {
    return false;
  }
  remove(sim, p);
  sim.addLog(`${p.name} was released and limped away from the valley.`, 'info', true);
  return true;
}

function remove(sim: Simulation, p: Captive): void {
  sim.captives = sim.captives.filter((q) => q !== p);
  // Anyone on their way to capture, feed or visit them gives up.
  for (const c of sim.colonists) {
    if ((c.job?.type === 'capture' || c.job?.type === 'warden') && c.job.patient === p.id) {
      sim.endJob(c);
    }
  }
}
