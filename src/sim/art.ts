import type { Simulation, StoryEntry } from './simulation';
import { Colonist } from './types';

// Works of art: how well a piece comes out, and what it shows.

// Sculptures use the same 0–20 quality scale (and labels) as crafted goods.
export const EXCELLENT = 13;
export const MASTERWORK = 17;

// Artistic skill, give or take three, plus three for an inspired artist.
export function rollQuality(sim: Simulation, c: Colonist): number {
  const inspired = c.thoughts.some((t) => t.key === 'inspired') ? 3 : 0;
  return Math.max(0, Math.min(20, c.skills.artistic + sim.rng.int(-3, 3) + inspired));
}

// How much of a sculpture's base beauty its quality brings out: 0.4 for the shoddiest, about 1.2
// at average skill, 3 for a perfect piece.
export const artBeauty = (quality: number): number => 0.4 + Math.max(0, Math.min(20, quality)) * 0.13;

// Moments from the colony's own story that a sculpture can show, newest first. Each pattern turns a
// story entry into a title.
const SUBJECTS: [RegExp, (m: RegExpMatchArray, e: StoryEntry) => string][] = [
  [/^(\w+) has died of/, (m) => `In Memory of ${m[1]}`],
  [/^(\w+) and (\w+) have fallen in love/, (m) => `${m[1]} and ${m[2]}, in Love`],
  [/^(\w+) and (\w+) have become friends/, (m) => `${m[1]} and ${m[2]}`],
  [/^The raid is over/, (_m, e) => `The Raid of Day ${e.day}`],
  [/^The raiders left the colony for dead/, () => 'The Day We Fell'],
  [/maddened wolves/, () => 'Wolves at the Door'],
  [/maddened boars/, () => 'The Boar Charge'],
  [/^Spring has come. The colony made it through the winter/, () => 'The Long Winter'],
  [/^An aurora/, () => 'Lights over the Valley'],
  [/^A meteorite/, () => 'The Fallen Star'],
  [/^(\w+), a traveller/, (m) => `${m[1]} Arrives`],
  [/^(\w+), wounded and fleeing/, (m) => `${m[1]}, Fleeing`],
  [/^(\w+) is inspired/, (m) => `${m[1]}'s Bright Morning`],
  [/^Research complete: ([^.]+)\./, (m) => `The Discovery of ${m[1]}`],
  [/^Traders from (.+) have arrived/, (m) => `Traders from ${m[1].replace(/^The /, 'the ')}`],
  [/^Three colonists have landed|colonists have landed/, () => 'The Landing'],
];

// A title for a new piece: a moment from the colony's recent story if there's one to show,
// otherwise a study of the artist's surroundings.
export function titleFor(sim: Simulation, artist: Colonist): string {
  const options: string[] = [];
  for (const entry of sim.storyLog.slice(-40)) {
    for (const [pattern, make] of SUBJECTS) {
      const m = entry.text.match(pattern);
      if (m) {
        options.push(make(m, entry));
        break;
      }
    }
  }
  if (options.length > 0) {
    return sim.rng.pick(options);
  }
  return `${artist.name}'s ${sim.season} Study`;
}
