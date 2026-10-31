import { NONE, featureId, terrainId } from './defs';
import { computePassRegions } from './regions';
import { fbm, hash2 } from './rng';
import { World } from './world';

// Converts raw noise values to percentiles so terrain proportions stay stable across seeds.
function toPercentiles(values: Float32Array): Float32Array {
  const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
  const out = new Float32Array(values.length);
  order.forEach((index, rank) => (out[index] = rank / (values.length - 1)));
  return out;
}

export interface GeneratedMap {
  world: World;
  spawn: number;
}

export function generateWorld(width: number, height: number, seed: number): GeneratedMap {
  const world = new World(width, height);
  const elevation = new Float32Array(world.size);
  const moisture = new Float32Array(world.size);
  const rockiness = new Float32Array(world.size);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = world.idx(x, y);
      elevation[i] = fbm(x, y, seed, 4, 0.07);
      moisture[i] = fbm(x, y, seed + 7919, 3, 0.09);
      rockiness[i] = fbm(x, y, seed + 104729, 4, 0.06);
    }
  }

  const elev = toPercentiles(elevation);
  const moist = toPercentiles(moisture);
  const rock = toPercentiles(rockiness);

  const DEEP = terrainId('deepWater');
  const SHALLOW = terrainId('shallowWater');
  const SAND = terrainId('sand');
  const GRASS = terrainId('grass');
  const SOIL = terrainId('soil');
  const STONE = terrainId('stoneFloor');
  const TREE = featureId('tree');
  const BUSH = featureId('berryBush');
  const ROCK = featureId('rock');

  for (let i = 0; i < world.size; i++) {
    const x = world.xOf(i);
    const y = world.yOf(i);
    const e = elev[i];
    let t: number;
    if (e < 0.06) {
      t = DEEP;
    } else if (e < 0.11) {
      t = SHALLOW;
    } else if (e < 0.16) {
      t = SAND;
    } else if (rock[i] > 0.8) {
      t = STONE;
      world.feature[i] = ROCK;
    } else if (rock[i] > 0.76) {
      t = STONE;
    } else {
      t = moist[i] > 0.7 ? SOIL : GRASS;
      const roll = hash2(x, y, seed + 31);
      if (roll < Math.max(0, moist[i] - 0.35) * 0.55) {
        world.feature[i] = TREE;
      } else if (roll > 0.982) {
        world.feature[i] = BUSH;
      }
    }
    world.terrain[i] = t;
  }

  // Spawn in the largest walkable region, as close to the map centre as possible.
  const { region, sizes } = computePassRegions(world);
  let largest = 0;
  sizes.forEach((size, id) => {
    if (size > sizes[largest]) {
      largest = id;
    }
  });
  const cx = width / 2;
  const cy = height / 2;
  let spawn = 0;
  let best = Infinity;
  for (let i = 0; i < world.size; i++) {
    if (region[i] !== largest || world.feature[i] !== NONE || world.terrain[i] === SHALLOW) {
      continue;
    }
    const d = Math.hypot(world.xOf(i) - cx, world.yOf(i) - cy);
    if (d < best) {
      best = d;
      spawn = i;
    }
  }

  // Clear a small landing area around the spawn point.
  const sx = world.xOf(spawn);
  const sy = world.yOf(spawn);
  for (let y = sy - 2; y <= sy + 2; y++) {
    for (let x = sx - 2; x <= sx + 2; x++) {
      if (!world.inBounds(x, y)) {
        continue;
      }
      const i = world.idx(x, y);
      if (world.feature[i] === TREE || world.feature[i] === BUSH) {
        world.feature[i] = NONE;
      }
    }
  }

  world.structureVersion++;
  return { world, spawn };
}
