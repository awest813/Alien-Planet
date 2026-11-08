import { describe, expect, it } from 'vitest';
import { Biome, MapKind } from './biomes';
import { ANIMALS, NONE, featureDef, featureId, terrainDef, terrainId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, outline, run } from './test-helpers';
import { updateWeather } from './weather';
import { GROW_ZONE, STOCKPILE_ZONE } from './world';

const within = (sim: Simulation, from: number, radius: number, key: string) => {
  const w = sim.world;
  let n = 0;
  for (let i = 0; i < w.size; i++) {
    if (w.feature[i] !== NONE && featureDef(w.feature[i]).key === key && w.distance(i, from) <= radius) {
      n++;
    }
  }
  return n;
};

const LANDS: [Biome, MapKind][] = [
  ['temperate', 'valley'],
  ['tundra', 'valley'],
  ['desert', 'valley'],
  ['forest', 'valley'],
  ['temperate', 'river'],
  ['temperate', 'island'],
  ['desert', 'river'],
  ['tundra', 'island'],
];

describe('biomes and maps', () => {
  it.each(LANDS)('%s %s: lands with timber, food and stone near, and a way out to the edge', (biome, map) => {
    for (const seed of [3, 11, 29]) {
      const sim = Simulation.newColony(seed, 'standard', 64, { biome, map });
      const home = sim.colonists[0].tile;
      expect(sim.biome).toBe(biome);
      expect(within(sim, home, 16, 'tree')).toBeGreaterThanOrEqual(25);
      expect(within(sim, home, 18, 'berryBush')).toBeGreaterThanOrEqual(4);
      expect(within(sim, home, 18, 'rock') + within(sim, home, 18, 'ironVein')).toBeGreaterThan(10);
      // Fords join an island or the far bank to the rest of the map: raiders, traders and herds can come.
      expect(sim.outsideRegion()).toBe(sim.regionOf(home));
      expect(sim.animals.length).toBeGreaterThan(0);
    }
  });

  it('cuts a river with fords, and an island in a lake', () => {
    const count = (sim: Simulation, key: string) =>
      Array.from(sim.world.terrain).filter((t) => t === terrainId(key)).length;
    const valley = Simulation.newColony(8);
    const river = Simulation.newColony(8, 'standard', 64, { map: 'river' });
    const island = Simulation.newColony(8, 'standard', 64, { map: 'island' });
    expect(count(river, 'deepWater')).toBeGreaterThan(count(valley, 'deepWater') + 100);
    expect(count(island, 'deepWater')).toBeGreaterThan(count(valley, 'deepWater') + 300);
    // The landing is on the island, in the middle of the lake.
    const w = island.world;
    const home = island.colonists[0].tile;
    expect(Math.hypot(w.xOf(home) - 32, w.yOf(home) - 32)).toBeLessThan(10);
  });

  it('keeps the temperate valley as it always was', () => {
    // The default land is generated exactly as before biomes existed (old seeds give the same maps).
    const a = Simulation.newColony(17);
    const b = Simulation.newColony(17, 'standard', 64, { biome: 'temperate', map: 'valley' });
    expect(Array.from(a.world.feature)).toEqual(Array.from(b.world.feature));
    expect(a.biome).toBe('temperate');
  });

  it('gives each biome its own climate', () => {
    const temps = (biome: Biome, season?: string) => {
      const sim = Simulation.newColony(5, 'standard', 64, { biome });
      const seen: number[] = [];
      for (let hour = 0; hour < 24 * 24; hour++) {
        sim.tick = hour * HOUR;
        if (!season || sim.season === season) {
          seen.push(sim.outdoorTemperature());
        }
      }
      return { mean: seen.reduce((a, b) => a + b, 0) / seen.length, max: Math.max(...seen), min: Math.min(...seen) };
    };
    expect(temps('tundra', 'Winter').mean).toBeLessThan(temps('temperate', 'Winter').mean - 6);
    expect(temps('tundra', 'Summer').mean).toBeLessThan(temps('temperate', 'Summer').mean);
    // Desert afternoons are hotter and its nights colder.
    expect(temps('desert', 'Summer').max).toBeGreaterThan(temps('temperate', 'Summer').max + 2);
    expect(temps('desert', 'Spring').min).toBeLessThan(temps('desert', 'Spring').max - 22);
    expect(temps('forest').mean).toBeGreaterThan(temps('tundra').mean);
  });

  it('brings little rain to the desert and snow to the tundra', () => {
    const tally = (biome: Biome, season: number) => {
      const sim = Simulation.newColony(9, 'standard', 64, { biome });
      sim.tick = (season * 6 + 2) * 24 * HOUR;
      const seen: Record<string, number> = {};
      for (let n = 0; n < 300; n++) {
        sim.weather.until = 0;
        updateWeather(sim);
        seen[sim.weather.kind] = (seen[sim.weather.kind] ?? 0) + 1;
      }
      return seen;
    };
    // Spring (season 0, after the first day) and winter (season 3).
    expect(tally('desert', 0).rain ?? 0).toBeLessThan(tally('temperate', 0).rain ?? 0);
    expect(tally('tundra', 3).snow ?? 0).toBeGreaterThan(tally('temperate', 3).snow ?? 0);
  });

  it('stocks the tundra with muskoxen and the desert with none', () => {
    const kinds = (biome: Biome) =>
      [3, 4, 5, 6, 7, 8].flatMap((seed) =>
        Simulation.newColony(seed, 'standard', 64, { biome }).animals.map((a) => a.kind),
      );
    const tundra = kinds('tundra');
    expect(tundra.filter((k) => k === 'muskox').length).toBeGreaterThan(tundra.length / 5);
    expect(tundra).not.toContain('boar');
    expect(kinds('desert')).not.toContain('muskox');
    expect(Object.keys(ANIMALS)).toContain('muskox');
  });

  it('saves the biome, and old saves load as temperate', () => {
    const sim = Simulation.newColony(4, 'standard', 64, { biome: 'tundra' });
    expect(deserialize(serialize(sim)).biome).toBe('tundra');
    const old = serialize(sim);
    delete old.biome;
    expect(deserialize(old).biome).toBe('temperate');
  });
});

// A plain first few days in every land: a hut with beds and a fire, a field, wood and berries.
function settle(sim: Simulation): void {
  const w = sim.world;
  const home = sim.colonists[0].tile;
  const fits = (x0: number, y0: number, x1: number, y1: number) => {
    // Open ground (trees and bushes are cleared first), with a walkable margin all round.
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        const i = w.idx(x, y);
        if (
          !w.inBounds(x, y) ||
          !terrainDef(w.terrain[i]).buildable ||
          (w.feature[i] !== NONE && featureDef(w.feature[i]).harvest?.work === 'mine') ||
          !w.isPassable(i) ||
          sim.regionOf(i) !== sim.regionOf(home)
        ) {
          return false;
        }
      }
    }
    return true;
  };
  const site = (wide: number, high: number, avoid: Set<number>) => {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = 1; y < w.height - high - 1; y++) {
      for (let x = 1; x < w.width - wide - 1; x++) {
        const d = Math.hypot(x - w.xOf(home), y - w.yOf(home));
        if (d < bestD && !avoid.has(w.idx(x, y)) && fits(x, y, x + wide - 1, y + high - 1)) {
          let clear = true;
          for (let ty = y - 1; ty <= y + high && clear; ty++) {
            for (let tx = x - 1; tx <= x + wide && clear; tx++) {
              clear = !avoid.has(w.idx(tx, ty));
            }
          }
          if (clear) {
            best = { x, y };
            bestD = d;
          }
        }
      }
    }
    return best!;
  };
  const used = new Set<number>();
  const claim = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        used.add(w.idx(x, y));
      }
    }
  };
  const hut = site(7, 5, used);
  claim(hut.x, hut.y, hut.x + 6, hut.y + 4);
  const door = w.idx(hut.x + 3, hut.y + 4);
  sim.apply({
    type: 'build',
    feature: featureId('woodWall'),
    tiles: outline(w, hut.x, hut.y, hut.x + 6, hut.y + 4).filter((i) => i !== door),
  });
  sim.apply({ type: 'build', feature: featureId('door'), tiles: [door] });
  sim.apply({
    type: 'build',
    feature: featureId('bed'),
    tiles: [1, 2, 3, 4, 5].map((k) => w.idx(hut.x + k, hut.y + 1)),
  });
  sim.apply({ type: 'build', feature: featureId('campfire'), tiles: [w.idx(hut.x + 1, hut.y + 3)] });
  const field = site(6, 6, used);
  claim(field.x, field.y, field.x + 5, field.y + 5);
  sim.apply({
    type: 'zone',
    rect: { x0: field.x, y0: field.y, x1: field.x + 5, y1: field.y + 5 },
    zone: GROW_ZONE + featureId('potatoPlant'),
  });
  const store = site(4, 4, used);
  sim.apply({
    type: 'zone',
    rect: { x0: store.x, y0: store.y, x1: store.x + 3, y1: store.y + 3 },
    zone: STOCKPILE_ZONE,
  });
  const x = w.xOf(home);
  const y = w.yOf(home);
  sim.apply({ type: 'designate', rect: { x0: x - 14, y0: y - 14, x1: x + 14, y1: y + 14 }, kind: 'chop' });
  sim.apply({ type: 'designate', rect: { x0: x - 18, y0: y - 18, x1: x + 18, y1: y + 18 }, kind: 'forage' });
}

describe('a colony in every land', () => {
  it.each(LANDS.slice(1))('gets through the first days: %s %s', (biome, map) => {
    const sim = Simulation.newColony(21, 'standard', 64, { biome, map });
    // Just the land and the weather: no raids or illness in the first days of this test.
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    settle(sim);
    run(sim, HOUR * 24 * 3);
    expect(sim.living().length).toBe(sim.colonists.length);
    expect(sim.living().every((c) => !c.health.downed && c.needs.food > 0.1)).toBe(true);
    expect(sim.countFeature((f) => featureDef(f).bed)).toBeGreaterThan(0);
  });
});
