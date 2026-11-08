import { ANIMALS, NONE, featureDef, featureId, itemDef } from './defs';
import type { Simulation } from './simulation';
import { Animal } from './types';

// Animal pens: ground fenced in (fences, walls, rock or water all do) with a gate. Colonists walk
// through gates; animals don't, except tame ones on their way in. Tame animals find the nearest pen
// and stay in it, and eat from the troughs along its edge. Fed pairs breed in any season.

const GATE = featureId('gate');
// Bigger than this, or open to the map edge, and it's not a pen but the open country.
export const MAX_PEN = 400;
const RECHECK_TICKS = 60;

export interface Pen {
  tiles: number[];
  // Troughs on its edge (or inside it).
  troughs: number[];
}

interface PenMap {
  structure: number;
  features: number;
  tick: number;
  // Whether there are any gates at all (most colonies have none).
  gates: boolean;
  pens: Pen[];
  // Each tile's pen, or -1.
  penOf: Int32Array;
}

const maps = new WeakMap<Simulation, PenMap>();

export const isGate = (sim: Simulation, i: number): boolean => sim.world.feature[i] === GATE;

// What a trough is filled with, and how much it holds.
export const troughFeed = (sim: Simulation, i: number): { item: number; capacity: number } | undefined => {
  const f = sim.world.feature[i];
  return f !== NONE ? featureDef(f).feeds : undefined;
};

// The colony's pens, worked out again whenever buildings change.
export function penMap(sim: Simulation): PenMap {
  const w = sim.world;
  const known = maps.get(sim);
  // Fences going up or down change it at once; anything else (a gate, a trough, a bed) is noticed within
  // a few minutes, since buildings and plants change all the time.
  if (
    known &&
    known.structure === w.structureVersion &&
    (known.features === w.featureVersion || sim.tick - known.tick < RECHECK_TICKS)
  ) {
    return known;
  }
  const penOf = new Int32Array(w.size).fill(-1);
  const pens: Pen[] = [];
  // Tiles already looked at from some gate (a pen, or open country that's no pen).
  const seen = new Uint8Array(w.size);
  const gates = [...w.tilesWith('features')].filter((i) => w.feature[i] === GATE);
  const troughs = [...w.tilesWith('features')].filter((i) => !!troughFeed(sim, i));
  for (const gate of gates) {
    // (Straight through the gate: nobody walks into a pen across a fence corner.)
    for (const start of w.neighbors(gate, false)) {
      if (seen[start] || !w.isPassable(start) || isGate(sim, start)) {
        continue;
      }
      // Flood out from beside the gate, with fences, walls and other gates as the edge.
      const tiles = [start];
      seen[start] = 1;
      let open = false;
      for (let q = 0; q < tiles.length; q++) {
        const i = tiles[q];
        const x = w.xOf(i);
        const y = w.yOf(i);
        const f = w.feature[i];
        // Too big, open to the map edge, or somewhere people sleep (a house): no pen. The flood carries on to
        // the end all the same, so another gate into the same ground can't find a pen in what's left of it.
        if (
          tiles.length > MAX_PEN ||
          x === 0 ||
          y === 0 ||
          x === w.width - 1 ||
          y === w.height - 1 ||
          (f !== NONE && featureDef(f).bed)
        ) {
          open = true;
        }
        for (const n of w.neighbors(i, false)) {
          if (!seen[n] && w.isPassable(n) && !isGate(sim, n)) {
            seen[n] = 1;
            tiles.push(n);
          }
        }
      }
      if (open) {
        continue;
      }
      const id = pens.length;
      for (const i of tiles) {
        penOf[i] = id;
      }
      pens.push({ tiles, troughs: [] });
    }
  }
  for (const t of troughs) {
    const ids = new Set([t, ...w.neighbors(t)].map((n) => penOf[n]).filter((id) => id >= 0));
    for (const id of ids) {
      pens[id].troughs.push(t);
    }
  }
  const map = {
    structure: w.structureVersion,
    features: w.featureVersion,
    tick: sim.tick,
    gates: gates.length > 0,
    pens,
    penOf,
  };
  maps.set(sim, map);
  return map;
}

export const penAt = (sim: Simulation, tile: number): number => penMap(sim).penOf[tile];

// A path-finding filter for an animal: the gates it may not pass (none to check if there are no gates).
export function gateFilter(sim: Simulation, a: Animal): ((i: number) => boolean) | undefined {
  return penMap(sim).gates ? (i) => !animalMayEnter(sim, a, i) : undefined;
}

// Whether an animal may step onto this tile: no animal passes a gate, but a tame one not yet in a pen
// may (to get into one).
export function animalMayEnter(sim: Simulation, a: Animal, tile: number): boolean {
  return !isGate(sim, tile) || (a.tame && penAt(sim, a.tile) < 0);
}

// The pen a tame animal belongs in: the one it's in, or else the nearest it can get to.
export function penFor(sim: Simulation, a: Animal): Pen | undefined {
  const { pens, penOf } = penMap(sim);
  if (!a.tame || pens.length === 0) {
    return undefined;
  }
  if (penOf[a.tile] >= 0) {
    return pens[penOf[a.tile]];
  }
  const region = sim.regionOf(a.tile);
  const w = sim.world;
  return pens
    .filter((p) => sim.regionOf(p.tiles[0]) === region)
    .sort((x, y) => w.distance(x.tiles[0], a.tile) - w.distance(y.tiles[0], a.tile))[0];
}

// Somewhere for a penned animal to go next: about the pen, often up to a trough.
export function penTarget(sim: Simulation, a: Animal, pen: Pen): number {
  const w = sim.world;
  if (penAt(sim, a.tile) >= 0 && pen.troughs.length > 0 && sim.rng.chance(0.3)) {
    const trough = sim.rng.pick(pen.troughs);
    const beside = pen.tiles.filter((i) => w.distance(i, trough) <= 1);
    if (beside.length > 0) {
      return sim.rng.pick(beside);
    }
  }
  return sim.rng.pick(pen.tiles);
}

// What a tame animal eats from a trough in a day: more for the big ones.
export const dailyFeed = (kind: string): number => Math.max(1, Math.round(ANIMALS[kind].hp * 2));

// Each morning the penned animals eat from their pen's troughs. Returns the ones that got their fill.
export function feedPenned(sim: Simulation, tame: Animal[]): Set<Animal> {
  const w = sim.world;
  const { pens, penOf } = penMap(sim);
  const fed = new Set<Animal>();
  for (const a of tame) {
    const id = penOf[a.tile];
    if (id < 0) {
      continue;
    }
    let want = dailyFeed(a.kind);
    for (const t of [...pens[id].troughs].sort((x, y) => w.fuel[y] - w.fuel[x])) {
      const take = Math.min(want, Math.floor(w.fuel[t]));
      w.fuel[t] -= take;
      want -= take;
      if (want === 0) {
        break;
      }
    }
    if (want === 0) {
      fed.add(a);
    }
  }
  return fed;
}

// "Potatoes" for the tile info.
export const feedName = (item: number): string => itemDef(item).name.toLowerCase();
