import { NONE, terrainId } from './defs';
import { Simulation, TICKS_PER_HOUR } from './simulation';
import { World } from './world';

export const HOUR = TICKS_PER_HOUR;

export function run(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    sim.step();
  }
}

// Turns a square around the first colonist into plain grass so tests don't depend on map luck.
export function clearAround(sim: Simulation, radius: number): { x: number; y: number } {
  const w = sim.world;
  const x = w.xOf(sim.colonists[0].tile);
  const y = w.yOf(sim.colonists[0].tile);
  for (let ty = y - radius; ty <= y + radius; ty++) {
    for (let tx = x - radius; tx <= x + radius; tx++) {
      if (w.inBounds(tx, ty)) {
        const i = w.idx(tx, ty);
        w.setFeature(i, NONE);
        w.setTerrain(i, terrainId('grass'));
      }
    }
  }
  return { x, y };
}

// Tile indices of a rectangle's outline.
export function outline(w: World, x0: number, y0: number, x1: number, y1: number): number[] {
  const tiles: number[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x === x0 || x === x1 || y === y0 || y === y1) {
        tiles.push(w.idx(x, y));
      }
    }
  }
  return tiles;
}

export function totalItems(sim: Simulation): number {
  return sim.resourceTotals().reduce((sum, r) => sum + r.total, 0);
}
