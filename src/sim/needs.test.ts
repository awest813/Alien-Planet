import { describe, expect, it } from 'vitest';
import { comfortRange } from './apparel';
import { featureId, itemId } from './defs';
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
