import { Biome, MapKind, biomeDef } from './biomes';
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

export function generateWorld(
  width: number,
  height: number,
  seed: number,
  biome: Biome = 'temperate',
  map: MapKind = 'valley',
): GeneratedMap {
  const land = biomeDef(biome).land;
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
    if (e < land.deep) {
      t = DEEP;
    } else if (e < land.shallow) {
      t = SHALLOW;
    } else if (e < land.beach) {
      t = SAND;
    } else if (rock[i] > land.rock) {
      t = STONE;
      world.feature[i] = ROCK;
    } else if (rock[i] > land.stone) {
      t = STONE;
    } else {
      t = moist[i] > land.soil ? SOIL : moist[i] < land.sand ? SAND : GRASS;
      const roll = hash2(x, y, seed + 31);
      if (roll < Math.max(0, moist[i] - land.treeFrom) * land.treeRate) {
        world.feature[i] = TREE;
      } else if (roll > land.bushAbove) {
        world.feature[i] = BUSH;
      }
    }
    world.terrain[i] = t;
  }

  if (map === 'river') {
    carveRiver(world, seed);
  } else if (map === 'island') {
    carveLake(world, seed);
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

  const sx = world.xOf(spawn);
  const sy = world.yOf(spawn);

  // Every colony needs granite: if there's little rock nearby, raise a small outcrop.
  let nearbyRock = 0;
  for (let i = 0; i < world.size; i++) {
    if (world.feature[i] === ROCK && Math.hypot(world.xOf(i) - sx, world.yOf(i) - sy) <= 16) {
      nearbyRock++;
    }
  }
  if (nearbyRock < 40) {
    const dry = (x: number, y: number) =>
      world.inBounds(x, y) && world.terrain[world.idx(x, y)] !== DEEP && world.terrain[world.idx(x, y)] !== SHALLOW;
    for (let k = 0; k < 16; k++) {
      const angle = (k / 16) * Math.PI * 2 + hash2(seed, 7, seed);
      const ox = Math.round(sx + Math.cos(angle) * 10);
      const oy = Math.round(sy + Math.sin(angle) * 10);
      let fits = true;
      for (let y = oy - 3; y <= oy + 3 && fits; y++) {
        for (let x = ox - 3; x <= ox + 3; x++) {
          if (!dry(x, y)) {
            fits = false;
            break;
          }
        }
      }
      if (!fits) {
        continue;
      }
      for (let y = oy - 3; y <= oy + 3; y++) {
        for (let x = ox - 3; x <= ox + 3; x++) {
          if (Math.hypot(x - ox, y - oy) <= 3.2) {
            const i = world.idx(x, y);
            world.terrain[i] = STONE;
            world.feature[i] = ROCK;
          }
        }
      }
      break;
    }
  }

  // Clay along the water's edge, and veins of iron through the rock.
  const CLAY = featureId('clayBank');
  const IRON = featureId('ironVein');
  const oreNoise = new Float32Array(world.size);
  for (let i = 0; i < world.size; i++) {
    oreNoise[i] = fbm(world.xOf(i), world.yOf(i), seed + 7741, 2, 0.35);
  }
  const ore = toPercentiles(oreNoise);
  for (let i = 0; i < world.size; i++) {
    const x = world.xOf(i);
    const y = world.yOf(i);
    if (world.feature[i] === ROCK && ore[i] > 0.93) {
      world.feature[i] = IRON;
    } else if (
      world.feature[i] === NONE &&
      world.terrain[i] === SAND &&
      hash2(x, y, seed + 5503) < 0.3 &&
      world.neighbors(i).some((n) => world.terrain[n] === SHALLOW)
    ) {
      world.feature[i] = CLAY;
    }
  }
  // Every colony can find some iron: if none is near, the nearest rock holds a small vein.
  const near = (i: number) => Math.hypot(world.xOf(i) - sx, world.yOf(i) - sy);
  let ironNear = false;
  for (let i = 0; i < world.size && !ironNear; i++) {
    ironNear = world.feature[i] === IRON && near(i) <= 30;
  }
  if (!ironNear) {
    const rocks: number[] = [];
    for (let i = 0; i < world.size; i++) {
      if (world.feature[i] === ROCK) {
        rocks.push(i);
      }
    }
    rocks.sort((a, b) => near(a) - near(b));
    for (const i of rocks.slice(0, 4)) {
      world.feature[i] = IRON;
    }
  }

  // Every start has timber and something to eat close by (in a desert, an oasis of sorts).
  if (biome !== 'temperate' || map !== 'valley') {
    ensureNear(world, spawn, TREE, MIN_TREES, 14, seed + 811);
    ensureNear(world, spawn, BUSH, MIN_BUSHES, 16, seed + 823);
  }

  // Clear a small landing area around the spawn point.
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

// A start has at least this many trees and berry bushes within reach of the landing.
const MIN_TREES = 36;
const MIN_BUSHES = 8;

const growsHere = (world: World, i: number) =>
  world.feature[i] === NONE &&
  world.floor[i] === NONE &&
  [terrainId('grass'), terrainId('soil'), terrainId('sand')].includes(world.terrain[i]);

// Plants trees (or bushes) in clumps around `spawn` until there are `count` within `radius`, so
// no biome or map starts a colony with nothing to build or eat. Away from the landing itself.
function ensureNear(world: World, spawn: number, feature: number, count: number, radius: number, seed: number): void {
  const sx = world.xOf(spawn);
  const sy = world.yOf(spawn);
  const near = (i: number) => Math.hypot(world.xOf(i) - sx, world.yOf(i) - sy);
  let have = 0;
  for (let i = 0; i < world.size; i++) {
    if (world.feature[i] === feature && near(i) <= radius) {
      have++;
    }
  }
  // Clumps: a few centres around the landing, then the open ground nearest each.
  for (let k = 0; k < 24 && have < count; k++) {
    const angle = hash2(k, 1, seed) * Math.PI * 2;
    const dist = 5 + hash2(k, 2, seed) * (radius - 7);
    const cx = Math.round(sx + Math.cos(angle) * dist);
    const cy = Math.round(sy + Math.sin(angle) * dist);
    for (let r = 0; r <= 2 && have < count; r++) {
      for (let y = cy - r; y <= cy + r && have < count; y++) {
        for (let x = cx - r; x <= cx + r && have < count; x++) {
          if (!world.inBounds(x, y)) {
            continue;
          }
          const i = world.idx(x, y);
          if (growsHere(world, i) && near(i) > 3 && near(i) <= radius && hash2(x, y, seed + k) < 0.7) {
            world.feature[i] = feature;
            have++;
          }
        }
      }
    }
  }
}

// A deep river across the map, a little to one side of the middle, with sandy banks and a few shallow
// fords where people (and raiders, and animals) can wade across. A bridge is quicker.
function carveRiver(world: World, seed: number): void {
  const DEEP = terrainId('deepWater');
  const SHALLOW = terrainId('shallowWater');
  const SAND = terrainId('sand');
  // Running north to south, or west to east.
  const across = hash2(seed, 3, seed + 17) < 0.5;
  const length = across ? world.width : world.height;
  const span = across ? world.height : world.width;
  const side = hash2(seed, 5, seed + 17) < 0.5 ? -1 : 1;
  const base = span / 2 + side * span * (0.14 + hash2(seed, 6, seed + 17) * 0.05);
  const phase = hash2(seed, 7, seed + 17) * Math.PI * 2;
  const bend = span * 0.05;
  const fords = [0.2, 0.5, 0.8].map((f) => Math.round(length * (f + (hash2(seed, f * 10, seed + 19) - 0.5) * 0.1)));
  for (let along = 0; along < length; along++) {
    const centre = base + Math.sin((along / length) * Math.PI * 2 + phase) * bend + Math.sin(along * 0.37 + phase);
    const ford = fords.some((f) => Math.abs(f - along) <= 1);
    for (let off = 0; off < span; off++) {
      const d = Math.abs(off + 0.5 - centre);
      const i = across ? world.idx(along, off) : world.idx(off, along);
      if (d <= 1.6 && !ford) {
        world.terrain[i] = DEEP;
      } else if (d <= 2.8) {
        world.terrain[i] = SHALLOW;
      } else if (d <= 3.8 && world.terrain[i] !== DEEP && world.terrain[i] !== SHALLOW) {
        world.terrain[i] = SAND;
      } else {
        continue;
      }
      world.feature[i] = NONE;
    }
  }
}

// The colony lands on an island in a lake: a ring of deep water round the middle of the map, crossed
// by two shallow fords. Little room to farm, lots of fish, and only two ways in.
function carveLake(world: World, seed: number): void {
  const DEEP = terrainId('deepWater');
  const SHALLOW = terrainId('shallowWater');
  const SAND = terrainId('sand');
  const cx = world.width / 2;
  const cy = world.height / 2;
  const half = Math.min(world.width, world.height) / 2;
  const fordAngle = hash2(seed, 9, seed + 29) * Math.PI * 2;
  const fordAt = [fordAngle, fordAngle + Math.PI * (0.8 + hash2(seed, 10, seed + 29) * 0.4)];
  for (let i = 0; i < world.size; i++) {
    const dx = world.xOf(i) + 0.5 - cx;
    const dy = world.yOf(i) + 0.5 - cy;
    const angle = Math.atan2(dy, dx);
    // The shores wander a little.
    const r = Math.hypot(dx, dy) / half + (fbm(world.xOf(i), world.yOf(i), seed + 31337, 2, 0.12) - 0.5) * 0.12;
    const ford = fordAt.some((a) => {
      const gap = Math.abs(Math.atan2(Math.sin(angle - a), Math.cos(angle - a)));
      return gap * Math.hypot(dx, dy) <= 1.5;
    });
    if (r < 0.4 || r > 0.7) {
      continue;
    }
    if (r < 0.44 || r > 0.66) {
      world.terrain[i] = world.terrain[i] === DEEP || world.terrain[i] === SHALLOW ? world.terrain[i] : SAND;
    } else if (ford || r < 0.47 || r > 0.63) {
      world.terrain[i] = SHALLOW;
    } else {
      world.terrain[i] = DEEP;
    }
    world.feature[i] = NONE;
  }
}
