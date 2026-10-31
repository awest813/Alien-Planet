import { describe, expect, it } from 'vitest';
import { comfortRange } from './apparel';
import { featureId, itemDef, itemId } from './defs';
import { damage, healthFactor, updateExposure } from './health';
import { deserialize, serialize } from './serialize';
import { Simulation, START_HOUR } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';

const PARKA = itemId('parka');

// The first hour of the year whose outdoor temperature passes `test`.
function setHour(sim: Simulation, test: (t: number) => boolean): void {
  for (let h = 0; h < 24 * 24; h++) {
    sim.tick = (h - START_HOUR) * HOUR;
    if (test(sim.outdoorTemperature())) {
      return;
    }
  }
  throw new Error('No such hour');
}

describe('clothing and exposure', () => {
  it('lets the cold build into hypothermia, less so in a parka', () => {
    const sim = Simulation.newColony(1);
    clearAround(sim, 4);
    setHour(sim, (t) => t < -5);
    const [bare, wrapped] = sim.colonists;
    bare.apparel = null;
    wrapped.apparel = { item: PARKA, quality: 6, wear: 1 };
    expect(comfortRange(wrapped).min).toBeLessThan(comfortRange(bare).min - 10);
    updateExposure(sim, bare, 2);
    updateExposure(sim, wrapped, 2);
    expect(bare.health.hypothermia).toBeGreaterThan(0.12);
    expect(wrapped.health.hypothermia).toBeLessThan(bare.health.hypothermia / 2);
  });

  it('has colonists change into a parka from storage when it turns cold', () => {
    const sim = Simulation.newColony(2);
    const w = sim.world;
    const { x, y } = clearAround(sim, 8);
    w.addItem(w.idx(x + 2, y), PARKA, 1, 1, 10);
    // A cold morning, when colonists are up and about.
    setHour(sim, (t) => t < 3 && sim.hour >= 8 && sim.hour < 12);
    sim.syncClock();
    run(sim, HOUR * 2);
    const wearer = sim.colonists.find((c) => c.apparel?.item === PARKA);
    expect(wearer).toBeDefined();
    expect(wearer!.apparel!.quality).toBe(10);
    // The tunic they took off is left behind, not destroyed.
    expect(sim.stockOf(itemId('tunic'))).toBe(1);
  });

  it('wears clothes out over time', () => {
    const sim = Simulation.newColony(3);
    const c = sim.colonists[0];
    run(sim, HOUR * 24);
    expect(c.apparel!.wear).toBeLessThan(1);
    expect(c.apparel!.wear).toBeGreaterThan(0.9);
  });
});

describe('rescue', () => {
  it('has a doctor carry a collapsed colonist from outdoors to a bed', () => {
    const sim = Simulation.newColony(7);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    // A small heated bedroom east of the colonists, with a door.
    for (const t of outline(w, x + 4, y - 2, x + 8, y + 2)) {
      w.setFeature(t, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 4, y), featureId('door'));
    w.setFeature(w.idx(x + 7, y - 1), featureId('campfire'));
    const bed = w.idx(x + 6, y + 1);
    w.setFeature(bed, featureId('bed'));
    run(sim, HOUR * 3);
    const patient = sim.colonists[0];
    patient.tile = w.idx(x - 4, y);
    damage(sim, patient, 0.45, 'cut');
    damage(sim, patient, 0.45, 'cut');
    expect(patient.health.downed).toBe(true);
    run(sim, HOUR * 4);
    expect(sim.isIndoors(patient.tile)).toBe(true);
  });
});

describe('cooking', () => {
  function kitchen(cookSkill: number) {
    const sim = Simulation.newColony(4);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    w.setFeature(w.idx(x + 3, y), featureId('stove'));
    w.dropItemNear(w.idx(x, y + 3), itemId('potatoes'), 120);
    // Fine meals need meat or fish as well as vegetables.
    w.dropItemNear(w.idx(x - 3, y + 3), itemId('rawMeat'), 40);
    const fine = sim.bills.findIndex((b) => b.recipe === 1);
    sim.bills[0].target = 0;
    sim.bills[fine].target = 5;
    for (const c of sim.colonists) {
      c.skills.cooking = cookSkill;
      c.priorities.cooking = 1;
      c.needs.food = 1;
    }
    run(sim, HOUR * 6);
    return sim;
  }

  it('needs a skilled cook for fine meals', () => {
    expect(kitchen(3).stockOf(itemId('fineMeal'))).toBe(0);
    expect(kitchen(10).stockOf(itemId('fineMeal'))).toBeGreaterThan(0);
  });

  // A stove with no food about but what the test lays out, and a hungry-for-work cook.
  function bareKitchen(seed: number) {
    const sim = Simulation.newColony(seed);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    for (const i of [...w.tilesWith('items')]) {
      if (itemDef(w.itemType[i]).nutrition > 0) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    w.setFeature(w.idx(x + 3, y), featureId('stove'));
    sim.bills[0].target = 30;
    for (const c of sim.colonists) {
      c.priorities.cooking = 1;
    }
    const fed = (hours: number) => {
      for (let h = 0; h < hours; h++) {
        for (const c of sim.colonists) {
          c.needs.food = 1;
        }
        run(sim, HOUR);
      }
    };
    return { sim, w, x, y, fed };
  }

  it('makes a meal from a mix of small stacks of different raw food', () => {
    const { sim, w, x, y, fed } = bareKitchen(31);
    w.addItem(w.idx(x - 3, y + 3), itemId('berries'), 3);
    w.addItem(w.idx(x - 1, y + 3), itemId('potatoes'), 2);
    w.addItem(w.idx(x + 1, y + 3), itemId('rawMeat'), 1);
    fed(4);
    expect(sim.stockOf(itemId('meal'))).toBe(1);
    expect(sim.stockOf(itemId('berries')) + sim.stockOf(itemId('potatoes')) + sim.stockOf(itemId('rawMeat'))).toBe(0);
  });

  it('gives back exactly the food it gathered when a meal is abandoned', () => {
    const { sim, w, x, y, fed } = bareKitchen(33);
    w.addItem(w.idx(x - 3, y + 3), itemId('berries'), 3);
    w.addItem(w.idx(x - 1, y + 3), itemId('potatoes'), 3);
    // Wait for a cook to have both kinds in hand, then pull them off the job.
    let cook;
    for (let t = 0; t < HOUR * 3 && !cook; t++) {
      sim.step();
      cook = sim.colonists.find((c) => c.carrying?.mix?.length);
    }
    expect(cook).toBeDefined();
    sim.endJob(cook!);
    sim.dropCarried(cook!);
    expect(sim.stockOf(itemId('berries'))).toBe(3);
    expect(sim.stockOf(itemId('potatoes'))).toBe(3);
    void fed;
  });

  it('cannot turn food on the turn into fresh meals', () => {
    const { w, x, y, fed } = bareKitchen(32);
    w.dropItemNear(w.idx(x - 3, y + 3), itemId('rawMeat'), 6, 0.3);
    fed(4);
    const meals = [...w.tilesWith('items')].filter((i) => w.itemType[i] === itemId('meal'));
    expect(meals.length).toBeGreaterThan(0);
    expect(meals.every((i) => w.fresh[i] <= 1)).toBe(true);
  });
});

describe('tailoring', () => {
  it('gathers leather from several small stacks to make a parka', () => {
    const sim = Simulation.newColony(8);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    sim.research.done.push('tailoring');
    w.setFeature(w.idx(x + 3, y), featureId('craftingBench'));
    for (let k = 0; k < 6; k++) {
      w.addItem(w.idx(x - 4 + k, y + 4), itemId('leather'), 4);
    }
    for (const c of sim.colonists) {
      c.priorities.crafting = 1;
      c.needs.food = 1;
    }
    run(sim, HOUR * 8);
    expect(sim.stockOf(PARKA) + sim.colonists.filter((c) => c.apparel?.item === PARKA).length).toBeGreaterThan(0);
  });
});

describe('food poisoning', () => {
  it('slows work while it lasts', () => {
    const sim = Simulation.newColony(5);
    const c = sim.colonists[0];
    const before = healthFactor(c);
    c.health.poisoned = 5;
    expect(healthFactor(c)).toBeLessThan(before);
    run(sim, HOUR * 6);
    expect(c.health.poisoned).toBe(0);
  });
});

describe('saving', () => {
  it('keeps clothing, exposure and item quality', () => {
    const sim = Simulation.newColony(6);
    const w = sim.world;
    const tile = w.idx(w.xOf(sim.colonists[0].tile) + 2, w.yOf(sim.colonists[0].tile));
    w.addItem(tile, itemId('meal'), 3, undefined, 12);
    sim.colonists[0].health.hypothermia = 0.3;
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.colonists[0].apparel).toEqual(sim.colonists[0].apparel);
    expect(copy.colonists[0].health.hypothermia).toBeCloseTo(0.3);
    expect(copy.world.quality[tile]).toBeCloseTo(w.quality[tile]);
  });
});

describe('richer production', () => {
  function workshop(seed: number) {
    const sim = Simulation.newColony(seed);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    for (const c of sim.colonists) {
      c.needs.food = 1;
      c.priorities.crafting = 1;
      c.priorities.cooking = 1;
      c.skills.cooking = 10;
      c.skills.crafting = 10;
    }
    return { sim, w, x, y };
  }

  it('cooks fine meals only with both meat and vegetables', () => {
    const { sim, w, x, y } = workshop(21);
    w.setFeature(w.idx(x + 3, y), featureId('stove'));
    w.dropItemNear(w.idx(x, y + 3), itemId('potatoes'), 60);
    sim.bills[0].target = 0;
    run(sim, HOUR * 4);
    expect(sim.stockOf(itemId('fineMeal'))).toBe(0);
    w.dropItemNear(w.idx(x - 3, y + 3), itemId('rawFish'), 30);
    run(sim, HOUR * 6);
    expect(sim.stockOf(itemId('fineMeal'))).toBeGreaterThan(0);
  });

  it('cuts granite into blocks at a stonecutter', () => {
    const { sim, w, x, y } = workshop(22);
    w.setFeature(w.idx(x + 3, y), featureId('stonecutterTable'));
    w.dropItemNear(w.idx(x, y + 3), itemId('stone'), 20);
    run(sim, HOUR * 4);
    expect(sim.stockOf(itemId('stoneBlocks'))).toBeGreaterThan(0);
  });

  it('mends worn clothing, keeping its quality', () => {
    const { sim, w, x, y } = workshop(23);
    sim.research.done.push('tailoring');
    w.setFeature(w.idx(x + 3, y), featureId('craftingBench'));
    const tile = w.idx(x - 2, y + 3);
    w.addItem(tile, PARKA, 1, 0.3, 15);
    // A warm summer day, so nobody wants to wear the parka instead of mending it.
    setHour(sim, (t) => t > 22 && sim.hour >= 9 && sim.hour < 12);
    sim.syncClock();
    w.dropItemNear(w.idx(x + 1, y + 4), itemId('cloth'), 10);
    run(sim, HOUR * 6);
    const parka = [...w.tilesWith('items')].find((i) => w.itemType[i] === PARKA);
    const worn = sim.colonists.find((c) => c.apparel?.item === PARKA)?.apparel;
    const wear = parka !== undefined ? w.fresh[parka] : worn?.wear;
    const quality = parka !== undefined ? w.quality[parka] : worn?.quality;
    expect(wear).toBeGreaterThan(0.9);
    expect(quality).toBeCloseTo(15);
  });

  it('drops half-gathered ingredients instead of losing them', () => {
    const { sim, w, x, y } = workshop(24);
    w.setFeature(w.idx(x + 3, y), featureId('stove'));
    w.dropItemNear(w.idx(x, y + 3), itemId('potatoes'), 30);
    w.dropItemNear(w.idx(x - 3, y + 3), itemId('rawMeat'), 30);
    const food = () => sim.stockOf(itemId('potatoes')) + sim.stockOf(itemId('rawMeat'));
    const before = food();
    sim.bills[0].target = 0;
    run(sim, 60);
    for (const c of sim.colonists) {
      sim.dropCarried(c);
      sim.endJob(c);
    }
    // Whatever was gathered is back on the ground (nothing was cooked in that time).
    expect(food()).toBe(before);
  });
});
