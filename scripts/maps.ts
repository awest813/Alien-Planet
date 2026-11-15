// What a new colony lands in, over many seeds: for every land, lie of the land and map size, what's within reach
// of the landing (trees, berries, rock, iron, clay, water, good soil, room to build, wildlife), how much of the map
// can be walked to, and the worst landings, to look at.
//
//   npx rolldown scripts/maps.ts --platform node --format esm --file /tmp/maps.mjs
//   node /tmp/maps.mjs [seeds=24] [size=64|96|128] [biome=...] [map=...]
import { BIOME_LIST, MAP_KINDS } from '../src/sim/biomes';
import { MAP_SIZES } from '../src/sim/constants';
import { NONE, featureDef, terrainDef } from '../src/sim/defs';
import { Simulation } from '../src/sim/simulation';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const seeds = Number(arg('seeds') ?? 24);
const sizes = arg('size') ? [Number(arg('size'))] : MAP_SIZES.map((m) => m.size);
const biomes = arg('biome') ? [arg('biome')!] : BIOME_LIST.map((b) => b.key);
const kinds = arg('map') ? [arg('map')!] : MAP_KINDS.map((k) => k.key);
const NEAR = 20;

interface Survey {
  seed: number;
  trees: number;
  bushes: number;
  rock: number;
  iron: number; // nearest iron vein reachable on foot (Infinity: none)
  clay: number;
  water: number;
  soil: number; // fertile (soil) tiles within NEAR
  open: number; // buildable, clear tiles within 6
  reach: number; // share of the map's land walkable from the landing
  animals: number;
  kinds: string;
}

function survey(seed: number, size: number, biome: string, map: string): Survey {
  const sim = Simulation.newColony(seed, 'standard', size, { biome: biome as never, map: map as never });
  const w = sim.world;
  const home = sim.colonists[0].tile;
  const region = sim.regionOf(home);
  const hx = w.xOf(home);
  const hy = w.yOf(home);
  const dist = (i: number) => Math.hypot(w.xOf(i) - hx, w.yOf(i) - hy);
  let trees = 0;
  let bushes = 0;
  let rock = 0;
  let soil = 0;
  let open = 0;
  let iron = Infinity;
  let clay = Infinity;
  let water = Infinity;
  let land = 0;
  let reached = 0;
  for (let i = 0; i < w.size; i++) {
    const d = dist(i);
    const t = terrainDef(w.terrain[i]).key;
    const f = w.feature[i] !== NONE ? featureDef(w.feature[i]).key : '';
    // Next to a tile walkable from the landing: mineable, fishable or reachable.
    const byRegion = sim.regionOf(i) === region || w.neighbors(i).some((n) => sim.regionOf(n) === region);
    if (t !== 'deepWater' && t !== 'shallowWater') {
      land++;
      reached += sim.regionOf(i) === region ? 1 : 0;
    }
    if (d <= NEAR) {
      trees += f === 'tree' ? 1 : 0;
      bushes += f === 'berryBush' ? 1 : 0;
      rock += f === 'rock' ? 1 : 0;
      soil += t === 'soil' && f === '' ? 1 : 0;
    }
    if (Math.max(Math.abs(w.xOf(i) - hx), Math.abs(w.yOf(i) - hy)) <= 6 && terrainDef(w.terrain[i]).buildable) {
      open += f === '' ? 1 : 0;
    }
    if (f === 'ironVein' && byRegion) {
      iron = Math.min(iron, d);
    }
    if (f === 'clayBank' && byRegion) {
      clay = Math.min(clay, d);
    }
    if ((t === 'shallowWater' || t === 'deepWater') && byRegion) {
      water = Math.min(water, d);
    }
  }
  const counts = new Map<string, number>();
  for (const a of sim.animals) {
    counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  }
  return {
    seed,
    trees,
    bushes,
    rock,
    iron,
    clay,
    water,
    soil,
    open,
    reach: reached / Math.max(1, land),
    animals: sim.animals.length,
    kinds: [...counts].map(([k, n]) => `${k} ${n}`).join(', '),
  };
}

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const fmt = (n: number) => (Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(n < 1 ? 2 : 0)) : 'none');
const KEYS = ['trees', 'bushes', 'rock', 'soil', 'open', 'iron', 'clay', 'water', 'reach', 'animals'] as const;

console.log(`Within ${NEAR} tiles of the landing (iron, clay, water: nearest reachable). min / median / max`);
for (const size of sizes) {
  for (const biome of biomes) {
    for (const map of kinds) {
      const all = Array.from({ length: seeds }, (_, k) => survey(1000 + k * 7919, size, biome, map));
      const line = KEYS.map((key) => {
        const xs = all.map((s) => s[key]);
        return `${key} ${fmt(q(xs, 0))}/${fmt(q(xs, 0.5))}/${fmt(q(xs, 0.999))}`;
      }).join('  ');
      console.log(`${String(size).padStart(3)} ${biome.padEnd(9)} ${map.padEnd(6)} ${line}`);
      const noIron = all.filter((s) => !Number.isFinite(s.iron)).length;
      const noClay = all.filter((s) => !Number.isFinite(s.clay)).length;
      const worst = [...all].sort((a, b) => a.open - b.open)[0];
      const wild = all.filter((s) => s.animals === 0).length;
      if (noIron || noClay || wild || worst.open < 60) {
        console.log(
          `      ! no iron in reach ${noIron}, no clay ${noClay}, no wildlife ${wild}; least room to build: seed ${worst.seed} (${worst.open})`,
        );
      }
      if (size === sizes[0] && map === 'valley') {
        console.log(`      wildlife e.g. seed ${all[0].seed}: ${all[0].kinds}`);
      }
    }
  }
}
