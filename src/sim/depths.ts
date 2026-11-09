import { creaturesEmerge } from './animals';
import { featureDef, itemDef, itemId } from './defs';
import type { Simulation } from './simulation';
import { Colonist } from './types';
import { Designation, Filth } from './world';

// Mine shafts: miners dig down again and again, and each time the shaft goes deeper and the rock gives up
// more: stone always, iron ore and silver more often the deeper it goes. Dig deep enough and the miners
// may break into the dark below, and what lives there comes up; beyond such a breach lies a cavern, and
// the shaft yields richer ore from then on. Dig on, and in time it happens again.

export interface Shaft {
  // How many times it has been dug deeper (each about two metres).
  depth: number;
  // Broken through into a cavern: richer ore from then on.
  cavern: boolean;
  // After a breach, the shaft is quiet until it's dug this deep.
  quietTo?: number;
  // The player stopped the digging (so a rebuilt shaft isn't dug again until they say so).
  stopped?: boolean;
}

export const METRES_PER_LEVEL = 2;
// Bedrock: how many stretches deep a shaft can go.
export const MAX_DEPTH = 60;
// Below this depth something may break through.
export const BREACH_DEPTH = 10;
// After a breach, this many more stretches before anything else can come up.
const QUIET_STRETCHES = 15;
// How deep a shaft must go before something may break through (again).
export const breachFrom = (shaft: Shaft): number => shaft.quietTo ?? BREACH_DEPTH;
// How much richer the ore is once a cavern has been found.
const CAVERN_BONUS = 1.5;

export const shaftAt = (sim: Simulation, tile: number): Shaft => (sim.shafts[tile] ??= { depth: 0, cavern: false });

export const isShaft = (sim: Simulation, tile: number): boolean => {
  const f = sim.world.feature[tile];
  return f !== 0 && featureDef(f).shaft;
};

// Every shaft standing, deepest first.
export function shafts(sim: Simulation): { tile: number; shaft: Shaft }[] {
  return Object.keys(sim.shafts)
    .map(Number)
    .filter((t) => isShaft(sim, t))
    .map((tile) => ({ tile, shaft: sim.shafts[tile] }))
    .sort((a, b) => b.shaft.depth - a.shaft.depth || a.tile - b.tile);
}

// The work for one more stretch: harder going the deeper it gets (a miner manages four or five stretches
// a day at the top, under two far down).
export const digWork = (shaft: Shaft): number => Math.min(1200, 450 + shaft.depth * 40);

// What one more stretch of digging brings up at this depth (the chances, for the inspector too).
export function oreChances(shaft: Shaft): { iron: number; silver: number } {
  const rich = shaft.cavern ? CAVERN_BONUS : 1;
  return {
    iron: Math.min(0.85, (0.25 + shaft.depth * 0.025) * rich),
    silver: Math.min(0.5, (0.08 + shaft.depth * 0.012) * rich),
  };
}

// A miner finished a stretch of digging: the shaft goes deeper, and up comes stone and maybe ore.
export function digDeeper(sim: Simulation, c: Colonist, tile: number): void {
  const w = sim.world;
  const shaft = shaftAt(sim, tile);
  const { iron, silver } = oreChances(shaft);
  // (Prospecting brings up a third more of whatever ore there is.)
  const rich = (shaft.cavern ? CAVERN_BONUS : 1) * (sim.isResearched('prospecting') ? 4 / 3 : 1);
  const found: [string, number][] = [['stone', 6 + Math.min(4, Math.floor(shaft.depth / 4))]];
  if (sim.rng.next() < iron) {
    found.push(['ironOre', Math.round(Math.min(6, 2 + Math.floor(shaft.depth / 5)) * rich)]);
  }
  if (sim.rng.next() < silver) {
    found.push(['silver', Math.round(Math.min(25, 6 + shaft.depth) * rich)]);
  }
  for (const [key, count] of found) {
    w.dropItemNear(tile, itemId(key), count);
    sim.stats.produced[key] = (sim.stats.produced[key] ?? 0) + count;
  }
  // At bedrock it goes no deeper, and keeps giving what it gives there (without saying so each time).
  const deeper = shaft.depth < MAX_DEPTH;
  if (deeper) {
    shaft.depth++;
    if (shaft.depth === MAX_DEPTH) {
      sim.addLog(
        `The mine shaft has reached bedrock at ${MAX_DEPTH * METRES_PER_LEVEL} metres. It goes no deeper.`,
        'info',
      );
    }
  }
  w.progress[tile] = 0;
  // Spoil from the shaft lands beside it.
  const beside = w.neighbors(tile, false).find((n) => w.isPassable(n));
  if (beside !== undefined) {
    w.addFilth(beside, Filth.RUBBLE);
  }
  c.workStreak++;
  if (deeper && shaft.depth % 5 === 0) {
    const ore = found
      .slice(1)
      .map(([key, count]) => `${count} ${itemDef(itemId(key)).name.toLowerCase()}`)
      .join(' and ');
    sim.addLog(
      `${c.name} has dug the mine shaft down to ${shaft.depth * METRES_PER_LEVEL} metres${ore ? `, bringing up ${ore}` : ''}.`,
      'good',
    );
  }
  if (deeper && shaft.depth === breachFrom(shaft) && sim.story.difficulty !== 'peaceful') {
    sim.addLog('The mine shaft is deep now. The miners hear things moving in the rock below.', 'warn', true);
  }
}

// How likely a breach is (the storyteller's weight): nothing until a shaft is deep enough, then more the
// deeper it goes. After a breach the shaft stays quiet for a while, then the danger starts again.
// Only a shaft that's being dug can break through: one the player has stopped (Cancel), at bedrock or not, stays
// quiet. (Breaches went on for years from a shaft nobody touched, and nothing would stop them.)
const digging = (sim: Simulation, tile: number): boolean => sim.world.designation[tile] === Designation.MINE;

export function breachWeight(sim: Simulation): number {
  const ready = shafts(sim).filter((s) => s.shaft.depth >= breachFrom(s.shaft) && digging(sim, s.tile));
  if (ready.length === 0) {
    return 0;
  }
  const over = Math.max(...ready.map((s) => s.shaft.depth - breachFrom(s.shaft)));
  return Math.min(2, 0.8 + over * 0.1);
}

// The miners break through: cave crawlers pour out of the deepest shaft, and the cavern beyond is open to
// the miners from then on. Returns whether anything came up.
export function breach(sim: Simulation, count: number): boolean {
  const deepest = shafts(sim).find((s) => s.shaft.depth >= breachFrom(s.shaft) && digging(sim, s.tile));
  if (!deepest) {
    return false;
  }
  // More of them the deeper it is.
  const n = Math.min(6, count + Math.floor((deepest.shaft.depth - BREACH_DEPTH) / 10));
  const came = creaturesEmerge(sim, deepest.tile, 'crawler', n);
  if (came === 0) {
    return false;
  }
  const first = !deepest.shaft.cavern;
  deepest.shaft.cavern = true;
  // (No deeper than bedrock, or a shaft dug to the bottom would never stir again; the event's own cooldown
  // keeps the breaches apart there.)
  deepest.shaft.quietTo = Math.min(MAX_DEPTH, deepest.shaft.depth + QUIET_STRETCHES);
  sim.stats.breaches = (sim.stats.breaches ?? 0) + 1;
  sim.addLog(
    `The miners have broken into ${first ? 'a cavern' : 'another cavern'}, and ${came} cave crawlers are pouring up out of the mine shaft! Draft colonists and fight them off.`,
    'danger',
    true,
  );
  if (first) {
    sim.addLog('Beyond the breach lies a cavern: the shaft will bring up richer ore from now on.', 'good');
  }
  return true;
}
