import { ADULT, kinOf } from './lifespans';
import { DAYS_PER_YEAR } from './seasons';
import type { Simulation } from './simulation';
import { FRIEND_OPINION, mutualOpinion } from './social';
import { Colonist } from './types';

// Grief: a death hits hardest at once (a short, sharp thought), but a loved one's loss also weighs for
// weeks after, fading slowly, and comes back each year on the day they died.

// How close the dead were: a spouse, a lover or a child is the heaviest loss; a parent, a brother or
// sister next; then other family, and friends.
const WEIGHT = { spouse: 3, lover: 3, child: 3, parent: 2, sibling: 2, family: 1, friend: 1 } as const;
// Lasting grief: up to this much off the mood for each step of weight, fading to nothing over this many
// days for each step.
const GRIEF_MOOD = 2;
const GRIEF_DAYS = 12;
// Anniversaries are kept for the closest losses, for this many years.
const ANNIVERSARY_WEIGHT = 2;
const ANNIVERSARY_YEARS = 4;
const ANNIVERSARY_MOOD = -4;
// Hours of a hard childhood that losing a parent counts for.
const PARENT_LOST_YOUNG = 96;
// At most this many losses are carried at once (the oldest are let go).
const MAX_GRIEFS = 6;

// Everyone left behind mourns: the sharp thought, by how they were tied, and a lasting grief.
export function mourn(sim: Simulation, dead: Colonist): void {
  for (const other of sim.living()) {
    if (other === dead) {
      continue;
    }
    const kin = kinOf(sim, other, dead);
    const lover = other.lover === dead.id;
    const friend = mutualOpinion(other, dead) >= FRIEND_OPINION;
    let weight = 0;
    if (kin === 'spouse' || lover) {
      sim.addThought(other, 'loverDied');
      weight = WEIGHT.spouse;
    } else if (kin === 'child') {
      // Parents grieve a child above all.
      sim.addThought(other, 'childDied');
      weight = WEIGHT.child;
    } else if (kin === 'parent') {
      sim.addThought(other, 'parentDied');
      weight = WEIGHT.parent;
      if (other.age < ADULT) {
        other.childhood ??= { hard: 0, happy: 0 };
        other.childhood.hard += PARENT_LOST_YOUNG;
      }
    } else if (kin === 'sibling') {
      sim.addThought(other, 'siblingDied');
      weight = WEIGHT.sibling;
    } else if (kin) {
      sim.addThought(other, 'kinDied');
      weight = WEIGHT.family;
    } else if (friend) {
      sim.addThought(other, 'friendDied');
      weight = WEIGHT.friend;
    } else {
      sim.addThought(other, 'colonistDied');
    }
    if (weight > 0) {
      const griefs = (other.grief ??= []);
      griefs.push({ id: dead.id, name: dead.name, day: sim.day, weight });
      if (griefs.length > MAX_GRIEFS) {
        griefs.shift();
      }
    }
  }
}

// How much a loss still weighs, `days` after: from GRIEF_MOOD for each step of weight down to nothing.
export function griefMood(weight: number, days: number): number {
  const lasts = GRIEF_DAYS * weight;
  return days >= lasts ? 0 : -Math.ceil(weight * GRIEF_MOOD * (1 - days / lasts));
}

// The losses weighing on someone today, as thoughts with their own labels.
export function griefThoughts(sim: Simulation, c: Colonist): { label: string; mood: number }[] {
  const out: { label: string; mood: number }[] = [];
  for (const g of c.grief ?? []) {
    const days = sim.day - g.day;
    const mood = griefMood(g.weight, days);
    if (mood < 0) {
      out.push({ label: `Grieving for ${g.name}`, mood });
    }
    if (days > 0 && days % DAYS_PER_YEAR === 0 && g.weight >= ANNIVERSARY_WEIGHT) {
      const years = days / DAYS_PER_YEAR;
      out.push({
        label: `${years === 1 ? 'A year' : `${years} years`} since ${g.name} died`,
        mood: ANNIVERSARY_MOOD,
      });
    }
  }
  return out;
}

// Called each morning: anniversaries are noted, and losses that no longer weigh (and have no more
// anniversaries to keep) are let go.
export function updateGrief(sim: Simulation): void {
  const remembered = new Map<number, { name: string; years: number; by: string[] }>();
  for (const c of sim.living()) {
    if (!c.grief) {
      continue;
    }
    for (const g of c.grief) {
      const days = sim.day - g.day;
      if (days > 0 && days % DAYS_PER_YEAR === 0 && g.weight >= ANNIVERSARY_WEIGHT) {
        const entry = remembered.get(g.id) ?? { name: g.name, years: days / DAYS_PER_YEAR, by: [] };
        entry.by.push(c.name);
        remembered.set(g.id, entry);
      }
    }
    c.grief = c.grief.filter((g) => {
      const keep = g.weight >= ANNIVERSARY_WEIGHT ? DAYS_PER_YEAR * ANNIVERSARY_YEARS : GRIEF_DAYS * g.weight;
      return sim.day - g.day <= keep;
    });
    if (c.grief.length === 0) {
      c.grief = undefined;
    }
  }
  for (const r of remembered.values()) {
    const when = r.years === 1 ? 'a year' : `${r.years} years`;
    sim.addLog(
      `It is ${when} since ${r.name} died: ${r.by.join(' and ')} remember${r.by.length > 1 ? '' : 's'}.`,
      'info',
    );
  }
}
