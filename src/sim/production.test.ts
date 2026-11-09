import { describe, expect, it } from 'vitest';
import { RECIPES, featureId, itemId } from './defs';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { WORK_TYPES } from './types';
import { GROW_ZONE, STOCKPILE_ZONE } from './world';

const recipe = (key: string) => RECIPES.find((r) => r.key === key)!.id;

// A cleared patch with a stockpile, everyone fed and rested, nobody working, no events.
function workshop(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 14);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  for (const c of sim.colonists) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 1;
    c.schedule.fill('W');
    for (const work of WORK_TYPES) {
      c.priorities[work] = 0;
    }
  }
  sim.apply({ type: 'zone', rect: { x0: x - 8, y0: y - 8, x1: x - 4, y1: y - 5 }, zone: STOCKPILE_ZONE });
  const keepFed = (hours: number) => {
    for (let h = 0; h < hours; h++) {
      for (const c of sim.colonists) {
        c.needs.food = 1;
        c.needs.rest = 1;
        c.needs.joy = 1;
      }
      run(sim, HOUR);
    }
  };
  return { sim, w, x, y, keepFed };
}

const count = (sim: Simulation, key: string) => sim.stockOf(itemId(key));

describe('the land', () => {
  it('has clay along the water and iron in the rock, with some iron within reach of the landing', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = Simulation.newColony(seed, 'standard', 96);
      const w = sim.world;
      const tiles = [...w.tilesWith('features')];
      const iron = tiles.filter((i) => w.feature[i] === featureId('ironVein'));
      const clay = tiles.filter((i) => w.feature[i] === featureId('clayBank'));
      expect(iron.length).toBeGreaterThan(0);
      const start = sim.colonists[0].tile;
      expect(iron.some((i) => w.distance(i, start) <= 32)).toBe(true);
      // Clay only on the shore.
      for (const i of clay) {
        expect(w.neighbors(i).some((n) => w.isOpenWater(n) || w.isWading(n))).toBe(true);
      }
    }
  });
});

describe('grain and bread', () => {
  it('grows grain, mills it into flour and bakes bread that keeps', () => {
    const { sim, w, x, y, keepFed } = workshop(10);
    sim.research.done.push('milling');
    const [farmer, cook] = sim.colonists;
    farmer.priorities.growing = 1;
    farmer.priorities.hauling = 2;
    cook.priorities.cooking = 1;
    cook.priorities.hauling = 2;
    cook.skills.cooking = 8;
    sim.apply({
      type: 'zone',
      rect: { x0: x + 3, y0: y + 3, x1: x + 6, y1: y + 5 },
      zone: GROW_ZONE + featureId('grainPlant'),
    });
    w.setFeature(w.idx(x - 2, y + 6), featureId('millstone'));
    w.setFeature(w.idx(x + 2, y - 6), featureId('stove'));
    sim.apply({ type: 'bill', recipe: recipe('millFlour'), target: 20 });
    sim.apply({ type: 'bill', recipe: recipe('bakeBread'), target: 20 });
    sim.apply({ type: 'bill', recipe: recipe('cookMeal'), target: 0 });
    keepFed(24 * 4);
    expect(sim.stats.produced.grain ?? 0).toBeGreaterThan(0);
    expect(sim.stats.produced.flour ?? 0).toBeGreaterThan(0);
    expect(sim.stats.produced.bread ?? 0).toBeGreaterThan(0);
    // The stalks come in as hay for the troughs, two thirds of the grain.
    expect(sim.stats.produced.hay ?? 0).toBe(((sim.stats.produced.grain ?? 0) / 12) * 8);
  });
});

describe('drying racks', () => {
  it('take raw meat from the haulers and dry it into food that keeps, which then goes to storage', () => {
    const { sim, w, x, y, keepFed } = workshop(11);
    const rack = w.idx(x + 2, y + 2);
    w.setFeature(rack, featureId('dryingRack'));
    sim.colonists[0].priorities.hauling = 1;
    w.dropItemNear(w.idx(x - 3, y + 6), itemId('rawMeat'), 20);
    // Stone never goes on a rack.
    w.dropItemNear(w.idx(x - 3, y + 7), itemId('stone'), 5);
    keepFed(2);
    expect(w.itemType[rack]).toBe(itemId('rawMeat'));
    keepFed(14);
    expect(count(sim, 'driedMeat')).toBeGreaterThanOrEqual(20);
    expect(w.itemType[rack] === itemId('driedMeat')).toBe(false);
    expect(w.canHoldItem(rack, itemId('stone'))).toBe(false);
  });
});

describe('kilns and smelters', () => {
  it('fire clay into bricks and smelt ore into iron, burning wood only while worked', () => {
    const { sim, w, x, y, keepFed } = workshop(12);
    sim.research.done.push('pottery', 'smelting');
    const crafter = sim.colonists[0];
    crafter.priorities.crafting = 1;
    crafter.priorities.hauling = 2;
    const kiln = w.idx(x + 2, y + 6);
    const smelter = w.idx(x + 6, y + 6);
    w.setFeature(kiln, featureId('kiln'));
    w.setFeature(smelter, featureId('smelter'));
    const full = w.fuel[kiln];
    // Idle, they keep their wood.
    keepFed(3);
    expect(w.fuel[kiln]).toBe(full);
    w.dropItemNear(w.idx(x - 6, y - 6), itemId('clay'), 20);
    w.dropItemNear(w.idx(x - 5, y - 6), itemId('ironOre'), 12);
    sim.apply({ type: 'bill', recipe: recipe('fireBricks'), target: 12 });
    sim.apply({ type: 'bill', recipe: recipe('smeltIron'), target: 6 });
    keepFed(16);
    expect(count(sim, 'bricks')).toBeGreaterThanOrEqual(12);
    expect(count(sim, 'iron')).toBeGreaterThanOrEqual(4);
    expect(w.fuel[kiln]).toBeLessThan(full);
  });

  it('stand cold without wood, and nobody works them', () => {
    const { sim, w, x, y, keepFed } = workshop(13);
    sim.research.done.push('pottery');
    const crafter = sim.colonists[0];
    crafter.priorities.crafting = 1;
    const kiln = w.idx(x + 2, y + 6);
    w.setFeature(kiln, featureId('kiln'));
    w.fuel[kiln] = 0;
    w.dropItemNear(w.idx(x - 6, y - 6), itemId('clay'), 20);
    sim.apply({ type: 'bill', recipe: recipe('fireBricks'), target: 12 });
    keepFed(6);
    expect(count(sim, 'bricks')).toBe(0);
  });
});
