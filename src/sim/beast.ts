import { manhuntersArrive } from './animals';
import { TICKS_PER_HOUR } from './constants';
import type { Simulation } from './simulation';
import { Animal, Colonist } from './types';

// The great beast: something huge in the hills that wakes once a year from the colony's second year
// on, comes down hungry, and fights until its fury is spent. Driven off, it comes back the next year,
// bigger; brought down, it's gone for good, and the colony remembers the day.

export interface BeastState {
  name: string;
  // How many times it has come down.
  seen: number;
  // The colony year it last woke (it wakes once a year at most).
  lastYear: number;
  slain: boolean;
}

const NAMES = ['Old Thornhide', 'the Grey Ravager', 'Ashjaw', 'the Hollow King', 'Marrowfang', 'the Stoneback'];
// From the second year; how much tougher it is each time it returns; how long its fury lasts.
const FIRST_DAY = 36;
const GROWTH = 0.35;
const FURY_HOURS = 20;

const year = (sim: Simulation) => Math.floor((sim.day - 1) / 24);
const present = (sim: Simulation) => sim.animals.find((a) => a.kind === 'greatBeast' && a.hp > 0);

// The storyteller's weight for the beast waking: once a year, not on peaceful, never once slain.
export function beastWeight(sim: Simulation): number {
  const b = sim.story.beast;
  if (sim.story.difficulty === 'peaceful' || sim.day < FIRST_DAY || b?.slain || present(sim)) {
    return 0;
  }
  return b && b.lastYear >= year(sim) ? 0 : 1.5;
}

// It wakes and comes down. Returns whether it came.
export function beastWakes(sim: Simulation): boolean {
  const b = (sim.story.beast ??= { name: sim.rng.pick(NAMES), seen: 0, lastYear: -1, slain: false });
  if (manhuntersArrive(sim, 'greatBeast', 1) === 0) {
    return false;
  }
  const a = sim.animals[sim.animals.length - 1];
  a.name = b.name;
  a.toughness = 1 + GROWTH * b.seen;
  a.hp *= a.toughness;
  a.revengeUntil = sim.tick + FURY_HOURS * TICKS_PER_HOUR;
  b.seen++;
  b.lastYear = year(sim);
  const Name = b.name[0].toUpperCase() + b.name.slice(1);
  sim.addLog(
    b.seen === 1
      ? `Something huge is coming down out of the hills: ${b.name}, the great beast the Meadow Kin whisper about. Draft colonists and bring it down!`
      : `${Name} has woken again, bigger than last year, and it's coming for the colony. Draft colonists!`,
    'danger',
    true,
  );
  sim.events.push('manhunters');
  sim.story.manhuntersActive = true;
  return true;
}

// Called every in-game hour: once its fury is spent, it goes back into the hills (and says so once).
export function updateGreatBeast(sim: Simulation): void {
  const a = present(sim);
  if (a && !a.manhunter && a.leaving && !a.told) {
    a.told = true;
    const Name = a.name ? a.name[0].toUpperCase() + a.name.slice(1) : 'The great beast';
    sim.addLog(`${Name} has gone back into the hills. It will be back next year, bigger.`, 'warn', true);
  }
}

// Brought down at last: gone for good, and the colony takes heart.
export function beastSlain(sim: Simulation, a: Animal, by: Colonist): void {
  const b = sim.story.beast;
  if (b) {
    b.slain = true;
  }
  sim.stats.greatBeastSlain = (sim.stats.greatBeastSlain ?? 0) + 1;
  for (const c of sim.living()) {
    sim.addThought(c, 'slewGreatBeast');
  }
  sim.addLog(`The colony has slain ${a.name ?? 'the great beast'}! ${by.name} struck the last blow.`, 'good', true);
}
