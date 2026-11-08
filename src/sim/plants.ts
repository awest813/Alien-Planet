import { NONE, featureId, terrainDef } from './defs';
import type { Simulation } from './simulation';

// Tries per dawn on a 64×64 map; bigger maps get proportionally more.
const TRIES_PER_4096_TILES = 24;
// Wild plants keep clear of the colony.
const HOME_CLEARANCE = 10;
// The chance a seed blowing in takes root on bare ground, on a map cut completely bare.
const BLOWN_IN = 0.25;
// Without a record of the starting cover (an old save), spreading stops at this share of the map.
const DEFAULT_COVER = 0.08;

// Trees and berry bushes on the map.
export function wildPlantCover(sim: Simulation): number {
  const spreading = [featureId('tree'), featureId('berryBush')];
  return sim.countFeature((f) => spreading.includes(f));
}

// Each morning outside winter, trees and berry bushes spread a little: a seedling takes root on open
// grass or soil beside a plant of its kind (or, more rarely, anywhere, from seed blown in). It's slow, so a forest cut down comes back over seasons,
// not days, and nothing sprouts in zones, under roofs or floors, on items or plans, or near home.
export function spreadWildPlants(sim: Simulation): void {
  if (sim.season === 'Winter') {
    return;
  }
  const w = sim.world;
  const spreading = [featureId('tree'), featureId('berryBush')];
  // Back to (about) what the map started with, and no further.
  const start = sim.wildCover || w.size * DEFAULT_COVER;
  const cover = wildPlantCover(sim);
  if (cover >= start) {
    return;
  }
  // Seeds blow in from beyond the valley too, so even a valley cut bare greens again in time: the
  // barer it is, the likelier a lone seedling takes.
  const windBlown = BLOWN_IN * (1 - cover / start);
  const home = sim.homeTile() ?? sim.living()[0]?.tile;
  const tries = Math.round((TRIES_PER_4096_TILES * w.size) / 4096);
  for (let n = 0; n < tries; n++) {
    const i = sim.rng.int(0, w.size - 1);
    if (
      w.feature[i] !== NONE ||
      w.floor[i] !== NONE ||
      w.roof[i] !== NONE ||
      w.blueprint[i] !== NONE ||
      w.itemType[i] !== NONE ||
      w.zone[i] !== 0 ||
      w.designation[i] !== 0 ||
      sim.isIndoors(i) ||
      terrainDef(w.terrain[i]).fertility <= 0 ||
      (home !== undefined && w.distance(i, home) <= HOME_CLEARANCE)
    ) {
      continue;
    }
    const parent = w.neighbors(i).find((nb) => spreading.includes(w.feature[nb]));
    if (parent !== undefined) {
      if (sim.rng.chance(0.5)) {
        w.setFeature(i, w.feature[parent]);
      }
    } else if (sim.rng.chance(windBlown)) {
      w.setFeature(i, sim.rng.chance(0.75) ? spreading[0] : spreading[1]);
    }
  }
}
