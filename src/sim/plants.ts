import { NONE, featureId, terrainDef } from './defs';
import type { Simulation } from './simulation';

// Tries per dawn on a 64×64 map; bigger maps get proportionally more.
const TRIES_PER_4096_TILES = 24;
// Wild plants keep clear of the colony.
const HOME_CLEARANCE = 10;
// Spreading stops once wild plants cover this share of the map (a fresh map has about 8%).
const MAX_COVER = 0.09;

// Each morning outside winter, trees and berry bushes spread a little: a seedling takes root on open
// grass or soil beside a plant of its kind. It's slow, so a forest cut down comes back over seasons,
// not days, and nothing sprouts in zones, under roofs or floors, on items or plans, or near home.
export function spreadWildPlants(sim: Simulation): void {
  if (sim.season === 'Winter') {
    return;
  }
  const w = sim.world;
  const spreading = [featureId('tree'), featureId('berryBush')];
  if (sim.countFeature((f) => spreading.includes(f)) >= w.size * MAX_COVER) {
    return;
  }
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
      terrainDef(w.terrain[i]).fertility <= 0 ||
      (home !== undefined && w.distance(i, home) <= HOME_CLEARANCE)
    ) {
      continue;
    }
    const parent = w.neighbors(i).find((nb) => spreading.includes(w.feature[nb]));
    if (parent !== undefined && sim.rng.chance(0.5)) {
      w.setFeature(i, w.feature[parent]);
    }
  }
}
