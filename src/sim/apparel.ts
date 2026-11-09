import { COMFORT_MAX, COMFORT_MIN } from './climate';
import { itemDef, itemId } from './defs';
import type { Simulation } from './simulation';
import { Colonist, WornApparel } from './types';

// Clothing widens the range of temperatures a colonist is comfortable in. Better-made clothes
// insulate more; worn-out clothes insulate less, and eventually fall apart.

export const QUALITY_TIERS: [number, string][] = [
  [0, 'Poor'],
  [4, 'Normal'],
  [8, 'Good'],
  [13, 'Excellent'],
  [17, 'Masterwork'],
];

export function qualityLabel(quality: number): string {
  let label = QUALITY_TIERS[0][1];
  for (const [min, name] of QUALITY_TIERS) {
    if (quality >= min) {
      label = name;
    }
  }
  return label;
}

// 0.7 for the shoddiest work up to 1.3 for a masterwork.
export function qualityFactor(quality: number): number {
  return 0.7 + Math.max(0, Math.min(20, quality)) * 0.03;
}

// Below this much wear left, clothes look (and feel) tattered.
export const TATTERED = 0.2;

export function insulationOf(item: number, quality: number, wear: number): { cold: number; heat: number } {
  const spec = itemDef(item).apparel;
  if (!spec || wear <= 0) {
    return { cold: 0, heat: 0 };
  }
  // Tattered clothes keep out only part of the weather.
  const factor = qualityFactor(quality) * (wear < TATTERED ? 0.6 : 1);
  return { cold: spec.cold * factor, heat: spec.heat * factor };
}

// The temperatures a colonist can stand indefinitely in what they're wearing.
export function comfortRange(c: Colonist): { min: number; max: number } {
  const a = c.apparel;
  const { cold, heat } = a ? insulationOf(a.item, a.quality, a.wear) : { cold: 0, heat: 0 };
  return { min: COMFORT_MIN - cold, max: COMFORT_MAX + heat };
}

// How well clothing with this insulation suits the weather: the degrees of discomfort it leaves
// uncovered (fewer is better). Plans for the cold of the night and the heat of the afternoon.
function weatherFit(cold: number, heat: number, outdoor: number): number {
  const tooCold = Math.max(0, COMFORT_MIN - cold - (outdoor - 6));
  const tooHot = Math.max(0, outdoor + 6 - (COMFORT_MAX + heat));
  return -(tooCold + tooHot) * 10;
}

// Higher is better; quality and condition break ties.
export function apparelScore(item: number, quality: number, wear: number, outdoor: number): number {
  if (wear <= 0) {
    return -Infinity;
  }
  const { cold, heat } = insulationOf(item, quality, wear);
  return weatherFit(cold, heat, outdoor) + qualityFactor(quality) + wear;
}

export function wornScore(c: Colonist, outdoor: number): number {
  const a = c.apparel;
  return a ? apparelScore(a.item, a.quality, a.wear, outdoor) : weatherFit(0, 0, outdoor);
}

// What people arrive in: a tunic, or a parka where it's cold (the tundra outside summer). A tundra colony,
// short of leather for its first winters, froze in tunics; the founders bring tunics for the summer too.
export const starterApparel = (cold = false): WornApparel => ({
  item: itemId(cold ? 'parka' : 'tunic'),
  quality: 6,
  wear: 1,
});

// Clothes wear out with use, and fall apart in the end.
export function wearApparel(sim: Simulation, c: Colonist, hours: number): void {
  const a = c.apparel;
  if (!a) {
    return;
  }
  const spec = itemDef(a.item).apparel!;
  a.wear -= hours / (24 * spec.wearDays);
  if (a.wear <= 0) {
    sim.addLog(`${c.name}'s ${itemDef(a.item).name.toLowerCase()} fell apart.`, 'warn');
    c.apparel = null;
  }
}
