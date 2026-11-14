import { describe, expect, it } from 'vitest';
import { TOOLS, TOOL_GROUPS } from '../game/controller';
import { NONE, featureDef, featureId, itemId, researchDef } from './defs';
import { daylight, updatePower, windStrength } from './power';
import { BOOKS_BONUS, Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { WORK_TYPES } from './types';

// The wind turbine, park bench, bookshelf, barricade and stone fountain: each does what it says, and sits
// where it should against what was already there.

const colony = (seed = 3) => {
  const sim = Simulation.newColony(seed);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  const { x, y } = clearAround(sim, 12);
  return { sim, w: sim.world, x, y };
};

describe('wind turbine', () => {
  it('turns with the weather, night and day, and not under a roof', () => {
    const { sim, w, x, y } = colony();
    const at = w.idx(x + 5, y + 5);
    w.setFeature(at, featureId('windTurbine'));
    const supplyIn = (kind: string) => {
      sim.weather = { kind: kind as typeof sim.weather.kind, until: sim.tick + 10 * HOUR };
      updatePower(sim, [at], 1);
      return sim.power.supply;
    };
    const storm = supplyIn('storm');
    const rain = supplyIn('rain');
    const clear = supplyIn('clear');
    const fog = supplyIn('fog');
    expect(storm).toBeGreaterThan(rain);
    expect(rain).toBeGreaterThan(clear);
    expect(clear).toBeGreaterThan(fog);
    expect(fog).toBeGreaterThan(0);
    expect(storm).toBeLessThanOrEqual(featureDef(featureId('windTurbine')).power!.output);
    // Under a roof, nothing.
    w.roof[at] = featureId('roof');
    expect(supplyIn('storm')).toBe(0);
  });

  it('gives less over a clear day than a solar panel in summer, but some of it at night', () => {
    const { sim } = colony();
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    const turbine = featureDef(featureId('windTurbine')).power!.output;
    const panel = featureDef(featureId('solarPanel')).power!.output;
    let wind = 0;
    let sun = 0;
    let windAtNight = 0;
    const start = sim.tick;
    for (let h = 0; h < 24 * 10; h++) {
      sim.tick = start + h * HOUR;
      const strength = windStrength(sim);
      wind += turbine * strength;
      sun += panel * daylight(h % 24);
      if (daylight(h % 24) === 0) {
        windAtNight += turbine * strength;
      }
    }
    // (Watts on average over the ten days.)
    const hours = 24 * 10;
    expect(wind / hours).toBeGreaterThan(0.5 * (sun / hours));
    expect(wind / hours).toBeLessThan(sun / hours);
    expect(windAtNight).toBeGreaterThan(0);
  });

  it('needs Electricity, like the other powered buildings', () => {
    expect(featureDef(featureId('windTurbine')).research).toBe('electricity');
    expect(researchDef('electricity')).toBeDefined();
  });
});

describe('bookshelf', () => {
  // One colonist studying at a bench, with or without a bookshelf beside it.
  function studied(withBooks: boolean): number {
    const { sim, w, x, y } = colony(11);
    const bench = w.idx(x + 2, y);
    w.setFeature(bench, featureId('researchBench'));
    if (withBooks) {
      w.setFeature(w.idx(x + 2, y - 2), featureId('bookshelf'));
    }
    for (const c of sim.colonists) {
      for (const work of WORK_TYPES) {
        c.priorities[work] = work === 'research' ? 1 : 0;
      }
    }
    const project = 'electricity';
    sim.apply({ type: 'research', project });
    // (Four hours: a project of 2,000 points, not yet finished either way.)
    for (let h = 0; h < 4; h++) {
      for (const c of sim.colonists) {
        c.needs.food = c.needs.rest = c.needs.joy = 1;
      }
      run(sim, HOUR);
      if (sim.isResearched(project)) {
        break;
      }
    }
    return sim.research.progress[project] ?? (sim.isResearched(project) ? Infinity : 0);
  }

  it('speeds research at a bench beside it by about its bonus', () => {
    const without = studied(false);
    const withBooks = studied(true);
    expect(without).toBeGreaterThan(0);
    expect(Number.isFinite(withBooks)).toBe(true);
    const ratio = withBooks / without;
    expect(ratio).toBeGreaterThan(1 + BOOKS_BONUS * 0.6);
    expect(ratio).toBeLessThan(1 + BOOKS_BONUS * 1.4);
  });

  it('reaches two tiles, and two shelves are worth no more than one', () => {
    const { sim, w, x, y } = colony();
    const bench = w.idx(x, y);
    w.setFeature(bench, featureId('researchBench'));
    expect(sim.booksBeside(bench)).toBe(false);
    w.setFeature(w.idx(x + 3, y), featureId('bookshelf'));
    expect(sim.booksBeside(bench)).toBe(false);
    w.setFeature(w.idx(x + 2, y + 2), featureId('bookshelf'));
    expect(sim.booksBeside(bench)).toBe(true);
  });
});

describe('park bench', () => {
  it('is a cheap place to rest, no quicker than a walk, and colonists use it', () => {
    const bench = featureDef(featureId('parkBench'));
    const armchair = featureDef(featureId('armchair'));
    expect(bench.joy!.kind).toBe('relaxing');
    // As slow as a walk (4 hours to full), slower than an armchair, and wood only.
    expect(bench.joy!.hoursToFull).toBe(4);
    expect(bench.joy!.hoursToFull).toBeGreaterThan(armchair.joy!.hoursToFull);
    expect(bench.build!.cost.map((c) => c.item)).toEqual([itemId('wood')]);
    const { sim, w, x, y } = colony(5);
    for (let k = 0; k < 3; k++) {
      w.setFeature(w.idx(x + 2 + k * 2, y + 2), featureId('parkBench'));
    }
    for (let h = 0; h < 36; h++) {
      for (const c of sim.colonists) {
        c.needs.food = c.needs.rest = 1;
        c.needs.joy = Math.min(c.needs.joy, 0.3);
      }
      run(sim, HOUR);
    }
    expect(sim.colonists.some((c) => (c.recentJoy.relaxing ?? 0) > 0)).toBe(true);
  });
});

describe('barricade and fountain', () => {
  it('a barricade is cover before sandbags: worse, but wood and no research', () => {
    const barricade = featureDef(featureId('barricade'));
    const sandbags = featureDef(featureId('sandbags'));
    expect(barricade.cover).toBeLessThan(1);
    expect(barricade.cover).toBeGreaterThan(sandbags.cover);
    expect(barricade.research).toBeUndefined();
    expect(sandbags.research).toBe('fortifications');
    expect(barricade.passable).toBe(true);
  });

  it('a fountain is fixed beauty short of a large sculpture, for fewer blocks and no artist', () => {
    const fountain = featureDef(featureId('fountain'));
    const large = featureDef(featureId('sculptureLarge'));
    const pot = featureDef(featureId('flowerPot'));
    expect(fountain.beauty).toBeGreaterThan(pot.beauty);
    expect(fountain.beauty).toBeLessThan(large.beauty);
    const blocks = (f: typeof fountain) => f.build!.cost.find((c) => c.item === large.build!.cost[0].item)!.count;
    expect(blocks(fountain)).toBeLessThan(blocks(large));
    expect(fountain.art).toBeFalsy();
  });
});

describe('the build bar', () => {
  it('every new building has a tool, and no tab holds more than fits a row', () => {
    for (const key of ['windTurbine', 'parkBench', 'bookshelf', 'barricade', 'fountain']) {
      expect(TOOLS.some((t) => t.tool.kind === 'build' && t.tool.feature === featureId(key))).toBe(true);
    }
    for (const g of TOOL_GROUPS) {
      const count = TOOLS.filter((t) => t.group === g.key).length;
      expect(count, g.key).toBeGreaterThan(0);
      expect(count, g.key).toBeLessThanOrEqual(11);
    }
    expect(featureId('windTurbine')).not.toBe(NONE);
  });
});
