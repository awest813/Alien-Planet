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

describe('the crafting bench', () => {
  it('makes what is furthest short of its target first, not whatever comes first in the list', () => {
    // (Cloth, first in the list and always wanted, came first every time: tool kits were short nine-tenths of it.)
    const { sim, w, x, y } = workshop(12);
    w.setFeature(w.idx(x + 3, y), featureId('craftingBench'));
    w.addItem(w.idx(x - 2, y + 3), itemId('cotton'), 30);
    w.addItem(w.idx(x - 1, y + 3), itemId('wood'), 40);
    w.addItem(w.idx(x, y + 3), itemId('stone'), 20);
    w.addItem(w.idx(x + 1, y + 3), itemId('cloth'), 15);
    for (const i of [...w.tilesWith('items')]) {
      if (w.itemType[i] === itemId('toolKit')) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    const crafter = sim.colonists[0];
    crafter.priorities.crafting = 1;
    let line: string | undefined;
    for (let t = 0; t < HOUR && !line; t++) {
      sim.step();
      line = crafter.job?.type === 'craft' ? RECIPES[crafter.job.line].key : undefined;
    }
    expect(line).toBe('makeTools');
  });
});

describe('work left on a bench', () => {
  it('a craft cut short keeps its work on the bench, and the next to make it there carries on', () => {
    // (Each interruption threw the work away: half the parkas begun were never finished.)
    const { sim, w, x, y } = workshop(13);
    const bench = w.idx(x + 3, y);
    w.setFeature(bench, featureId('craftingBench'));
    sim.research.done.push('tailoring');
    w.addItem(w.idx(x - 2, y + 3), itemId('leather'), 40);
    for (const b of sim.bills) {
      b.target = RECIPES[b.recipe].key === 'tailorParka' ? 2 : 0;
    }
    const tailor = sim.colonists[0];
    tailor.priorities.crafting = 1;
    let job = tailor.job;
    for (let t = 0; t < HOUR * 3 && !(job?.type === 'craft' && job.progress > 100); t++) {
      tailor.needs.food = 1;
      tailor.needs.rest = 1;
      sim.step();
      job = tailor.job;
    }
    const done = job!.progress;
    expect(done).toBeGreaterThan(100);
    // Called away (drafted, say): the work stays on the bench.
    sim.endJob(tailor);
    expect(sim.benchWork.get(bench)).toEqual({ recipe: recipe('tailorParka'), progress: done });
    // Back to it: it carries on from there.
    let resumed: number | undefined;
    for (let t = 0; t < HOUR * 2 && resumed === undefined; t++) {
      tailor.needs.food = 1;
      tailor.needs.rest = 1;
      sim.step();
      resumed = tailor.job?.type === 'craft' ? tailor.job.progress : undefined;
    }
    expect(resumed).toBeGreaterThanOrEqual(done);
    expect(sim.benchWork.has(bench)).toBe(false);
  });
});

describe('work left on a bench, saved', () => {
  it('is kept in a save, and the bench says so', async () => {
    const { serialize, deserialize } = await import('./serialize');
    const { controller } = await import('../game/controller');
    controller.newColony('bench-work');
    const sim = controller.sim;
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    const bench = w.idx(x + 3, y);
    w.setFeature(bench, featureId('craftingBench'));
    sim.benchWork.set(bench, { recipe: recipe('tailorParka'), progress: 240 });
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(sim))));
    expect(loaded.benchWork.get(bench)).toEqual({ recipe: recipe('tailorParka'), progress: 240 });
    controller.selectTile(bench);
    controller.publish();
    expect(controller.getState().selectedTile!.details.join(' | ')).toMatch(/Tailor parka begun: 40% done/);
  });
});

describe('tool kits', () => {
  it('a kit its holder has not used in three days is put down for someone who will', () => {
    const { sim, w, x, y } = workshop(14);
    const c = sim.colonists[0];
    c.tile = w.idx(x, y);
    c.tool = { quality: 8, wear: 0.7 };
    const at = (sim as unknown as { toolWorkAt: Map<number, number> }).toolWorkAt;
    at.set(c.id, sim.tick - HOUR * 24 * 4);
    (sim as unknown as { tryTakeTool(c: unknown): boolean }).tryTakeTool(c);
    expect(c.tool).toBeNull();
    expect(sim.stockOf(itemId('toolKit'))).toBeGreaterThanOrEqual(1);
    // Used yesterday: kept.
    c.tool = { quality: 8, wear: 0.7 };
    at.set(c.id, sim.tick - HOUR * 20);
    (sim as unknown as { tryTakeTool(c: unknown): boolean }).tryTakeTool(c);
    expect(c.tool).not.toBeNull();
  });
});
