import { describe, expect, it } from 'vitest';
import type { Biome } from './biomes';
import { deserialize, serialize } from './serialize';
import { Simulation, TICKS_PER_HOUR } from './simulation';
import { WEATHER, snowOnGround, sunStrength, updateWeather, windFrom, windStrength } from './weather';

// The weather, the sun and the wind over years, hour by hour (only the weather moves; the colony stands still).

function years(biome: Biome, n: number, each: (sim: Simulation) => void): Simulation {
  const sim = Simulation.newColony(17, 'standard', 64, { biome });
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  for (let h = 0; h < 24 * 24 * n; h++) {
    sim.tick += TICKS_PER_HOUR;
    updateWeather(sim);
    each(sim);
  }
  return sim;
}

describe('rain and snow', () => {
  it('rain never shows below freezing, nor snow well above it', () => {
    for (const biome of ['temperate', 'tundra', 'forest'] as Biome[]) {
      let rainBelow = 0;
      let snowAbove = 0;
      years(biome, 3, (sim) => {
        const t = sim.outdoorTemperature();
        rainBelow += (sim.weather.kind === 'rain' || sim.weather.kind === 'storm') && t < 0 ? 1 : 0;
        snowAbove += sim.weather.kind === 'snow' && t > 3 ? 1 : 0;
      });
      // (Rain at -1°C showed in the top bar: rain's own chill took it below the line it was checked against.)
      expect(rainBelow, biome).toBe(0);
      expect(snowAbove, biome).toBe(0);
    }
  });

  it('snow settles while it falls, lies in a cold winter, and melts in a thaw (and a save keeps it)', () => {
    let tundraWinter = 0;
    let tundraWhite = 0;
    let temperateWinter = 0;
    let temperateWhite = 0;
    let summerWhite = 0;
    years('tundra', 2, (sim) => {
      if (sim.season === 'Winter') {
        tundraWinter++;
        tundraWhite += snowOnGround(sim) ? 1 : 0;
      }
      summerWhite += sim.season === 'Summer' && snowOnGround(sim) ? 1 : 0;
    });
    years('temperate', 2, (sim) => {
      if (sim.season === 'Winter') {
        temperateWinter++;
        temperateWhite += snowOnGround(sim) ? 1 : 0;
      }
    });
    // The tundra white most of its winter, a temperate winter (mostly rain, at about 4°C) mostly bare.
    expect(tundraWhite / tundraWinter).toBeGreaterThan(0.6);
    expect(temperateWhite / temperateWinter).toBeLessThan(0.4);
    expect(summerWhite).toBe(0);
    // Snow falling covers the ground; a thaw takes it.
    // In a tundra winter (a new colony lands in a mild spring, where snow rightly gives way by the afternoon).
    const sim = Simulation.newColony(5, 'standard', 64, { biome: 'tundra' });
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    while (sim.season !== 'Winter') {
      sim.tick += 24 * TICKS_PER_HOUR;
    }
    sim.weather = { kind: 'snow', until: sim.tick + 100 * TICKS_PER_HOUR, snow: 0 };
    for (let h = 0; h < 10; h++) {
      sim.tick += TICKS_PER_HOUR;
      updateWeather(sim);
    }
    expect(snowOnGround(sim)).toBe(true);
    const copy = deserialize(serialize(sim));
    expect(copy.weather.snow).toBe(sim.weather.snow);
    // A thaw (a heat wave, and rain): it melts.
    sim.story.heatWaveUntil = sim.tick + 100 * TICKS_PER_HOUR;
    sim.weather = { ...sim.weather, kind: 'rain', until: sim.tick + 100 * TICKS_PER_HOUR };
    for (let h = 0; h < 48; h++) {
      sim.tick += TICKS_PER_HOUR;
      updateWeather(sim);
    }
    expect(snowOnGround(sim)).toBe(false);
  });
});

describe('droughts and fog', () => {
  it('a drought is a hard spell of a summer, not half of it', () => {
    let summer = 0;
    let dry = 0;
    years('temperate', 4, (sim) => {
      if (sim.season === 'Summer') {
        summer++;
        dry += sim.weather.kind === 'drought' ? 1 : 0;
      }
    });
    expect(WEATHER.drought.hours[1]).toBeLessThanOrEqual(48);
    expect(dry / summer).toBeGreaterThan(0.05);
    expect(dry / summer).toBeLessThan(0.38);
  });

  it('fog is a thing of nights and mornings', () => {
    let fog = 0;
    let afternoon = 0;
    years('forest', 3, (sim) => {
      if (sim.weather.kind === 'fog') {
        fog++;
        afternoon += sim.hour >= 13 && sim.hour < 19 ? 1 : 0;
      }
    });
    expect(fog).toBeGreaterThan(50);
    expect(afternoon / fog).toBeLessThan(0.15);
  });
});

describe('sun and wind', () => {
  it('the sun on a panel follows the hour, the season and the cloud', () => {
    const sim = Simulation.newColony(5);
    const at = (kind: (typeof sim.weather)['kind']) => {
      sim.weather = { kind, until: sim.tick + 10 * TICKS_PER_HOUR };
      return sunStrength(sim);
    };
    // Noon, early spring.
    sim.tick += Math.round(((13 - sim.hour + 24) % 24) * TICKS_PER_HOUR);
    const clear = at('clear');
    expect(clear).toBeGreaterThan(0);
    expect(at('rain')).toBeLessThan(clear);
    expect(at('storm')).toBeLessThan(at('rain'));
    expect(at('fog')).toBeLessThan(clear);
    // Midnight: none.
    sim.tick += 11 * TICKS_PER_HOUR;
    expect(at('clear')).toBe(0);
  });

  it('the wind is one: its strength by the weather, its way changing day to day', () => {
    const sim = Simulation.newColony(5);
    const ways = new Set<number>();
    let calm = 0;
    let gale = 0;
    for (let h = 0; h < 24 * 20; h++) {
      sim.tick += TICKS_PER_HOUR;
      ways.add(windFrom(sim));
      sim.weather = { kind: 'fog', until: Infinity };
      calm += windStrength(sim);
      sim.weather = { kind: 'storm', until: Infinity };
      gale += windStrength(sim);
    }
    expect([...ways].sort()).toEqual([-1, 1]);
    expect(gale).toBeGreaterThan(calm * 4);
  });
});
