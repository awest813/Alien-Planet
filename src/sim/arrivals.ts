import { MOVE_SPEED, TICKS_PER_HOUR } from './constants';
import type { World } from './world';

// Parties that walk in from the edge (raiders, thieves, maddened packs) give at least this long between
// the warning and reaching the colony. On a small map they'd be there in minutes, so they gather at the
// edge for the difference first; on a big map the walk alone is longer.
export const MIN_WARNING = TICKS_PER_HOUR * 1.5;
// They give up waiting and come on if a colonist gets this close (or one of them is hurt).
export const MUSTER_ALERT = 12;
// Ground is rarely all open grass: a straight-line walk takes about this much longer.
const WALK_SLACK = 1.2;

// Roughly how many ticks a party at `from`, walking at `tilesPerTick`, takes to come within `range` of `to`.
export function walkTicks(w: World, from: number, to: number, tilesPerTick: number, range: number): number {
  const d = Math.max(0, w.distance(from, to) - range);
  return Math.round((d * WALK_SLACK) / tilesPerTick);
}

// Roughly how many ticks from the nearest edge of the map to `tile` (where friends come in).
export function fromEdgeTicks(w: World, tile: number, tilesPerTick: number): number {
  const x = w.xOf(tile);
  const y = w.yOf(tile);
  const d = Math.min(x, y, w.width - 1 - x, w.height - 1 - y);
  return Math.round((d * WALK_SLACK) / tilesPerTick);
}

// How long to hold at the edge so the warning lasts at least MIN_WARNING.
export const musterTicks = (walk: number): number => Math.max(0, Math.round(MIN_WARNING - walk));

// Raiders' and animals' speed in tiles per tick (as their movement code adds it up).
export const raiderTilesPerTick = (speed: number): number => MOVE_SPEED * speed;
export const animalTilesPerTick = (speed: number): number => MOVE_SPEED * 0.8 * speed;

// "within the hour", "in about an hour", "in about 3 hours".
export function inAbout(ticks: number): string {
  const hours = Math.round(ticks / TICKS_PER_HOUR);
  return hours < 1 ? 'within the hour' : hours === 1 ? 'in about an hour' : `in about ${hours} hours`;
}
