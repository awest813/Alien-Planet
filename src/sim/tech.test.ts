import { describe, expect, it } from 'vitest';
import { featureId, itemId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation, START_HOUR } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';

// A colony with everything researched, a stockpile, and plenty of materials.
function techColony(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.research.done.push('electricity', 'refrigeration', 'sunLamps', 'solarPower', 'hearths');
  w.dropItemNear(w.idx(x, y + 4), itemId('wood'), 400);
  w.dropItemNear(w.idx(x, y + 4), itemId('stone'), 200);
  w.dropItemNear(w.idx(x, y + 4), itemId('cloth'), 40);
  sim.apply({ type: 'zone', rect: { x0: x - 2, y0: y + 6, x1: x + 2, y1: y + 8 }, zone: 1 });
  return { sim, w, x, y };
}

const place = (sim: Simulation, key: string, tile: number) => {
  sim.world.setFeature(tile, featureId(key));
};

describe('power', () => {
  it('runs on a fuelled generator that haulers keep topped up', () => {
    const { sim, w, x, y } = techColony(1);
    const generator = w.idx(x + 6, y);
    place(sim, 'woodGenerator', generator);
    place(sim, 'electricHeater', w.idx(x + 6, y + 2));
    run(sim, HOUR * 2);
    expect(w.fuel[generator]).toBeGreaterThan(30);
    expect(sim.power.powered).toBe(true);
    expect(sim.power.supply).toBe(1000);
  });

  it('switches everything off when demand outstrips supply, and batteries bridge the gap', () => {
    const { sim, w, x, y } = techColony(2);
    for (let k = 0; k < 4; k++) {
      place(sim, 'freezer', w.idx(x + 6 + k, y));
    }
    run(sim, 30);
    expect(sim.power.powered).toBe(false);
    place(sim, 'battery', w.idx(x + 6, y + 2));
    sim.power.stored = 8000;
    run(sim, 30);
    expect(sim.power.powered).toBe(true);
    expect(sim.power.stored).toBeLessThan(8000);
  });

  it('gives solar power only by day', () => {
    const { sim, w, x, y } = techColony(3);
    place(sim, 'solarPanel', w.idx(x + 6, y));
    sim.tick = (13 - START_HOUR) * HOUR;
    run(sim, 20);
    const noon = sim.power.supply;
    sim.tick = (24 + 2 - START_HOUR) * HOUR;
    run(sim, 20);
    expect(noon).toBeGreaterThan(1000);
    expect(sim.power.supply).toBe(0);
  });
});

describe('cold storage and spoilage', () => {
  it('rots food left out in the warm, but not in a running icebox', () => {
    const { sim, w, x, y } = techColony(4);
    // Keep colonists from eating or moving the test food.
    for (const c of sim.colonists) {
      c.priorities.hauling = 0;
    }
    place(sim, 'woodGenerator', w.idx(x + 6, y));
    w.fuel[w.idx(x + 6, y)] = 75;
    const icebox = w.idx(x - 6, y - 6);
    place(sim, 'icebox', icebox);
    w.addItem(icebox, itemId('rawMeat'), 10);
    const warm = w.idx(x - 6, y - 8);
    w.addItem(warm, itemId('rawMeat'), 10);
    // Mid-summer, so it's warm outdoors.
    sim.tick = (9 * 24 + 12 - START_HOUR) * HOUR;
    sim.syncClock();
    for (let hour = 0; hour < 24 * 5; hour++) {
      // Newcomers who wander in would otherwise start hauling.
      for (const c of sim.colonists) {
        c.needs.food = 1;
        c.priorities.hauling = 0;
      }
      // Hauling (and so refuelling) is off, so keep the generator fed by hand.
      w.fuel[w.idx(x + 6, y)] = 75;
      run(sim, HOUR);
    }
    expect(w.itemType[warm]).not.toBe(itemId('rawMeat'));
    expect(w.itemType[icebox]).toBe(itemId('rawMeat'));
    expect(w.fresh[icebox]).toBeCloseTo(4);
  });

  it('chills a sealed room with a freezer unit', () => {
    const { sim, w, x, y } = techColony(5);
    place(sim, 'battery', w.idx(x + 8, y + 8));
    sim.power.stored = 8000;
    for (const t of outline(w, x - 8, y - 8, x - 4, y - 4)) {
      place(sim, 'woodWall', t);
    }
    place(sim, 'freezer', w.idx(x - 6, y - 6));
    run(sim, HOUR * 6);
    expect(sim.temperatureAt(w.idx(x - 5, y - 5))).toBeLessThan(0);
  });
});

describe('sun lamps', () => {
  it('let crops grow at night', () => {
    const { sim, w, x, y } = techColony(6);
    place(sim, 'battery', w.idx(x + 8, y + 8));
    sim.power.stored = 8000;
    place(sim, 'sunLamp', w.idx(x - 6, y - 6));
    const crop = w.idx(x - 6, y - 4);
    w.setFeature(crop, featureId('potatoPlant'));
    sim.tick = (24 + 1 - START_HOUR) * HOUR;
    sim.syncClock();
    run(sim, HOUR * 2);
    expect(sim.isNight()).toBe(true);
    expect(w.growth[crop]).toBeGreaterThan(0);
  });
});

describe('saving', () => {
  it('keeps freshness, fuel and the power grid', () => {
    const { sim, w, x, y } = techColony(7);
    place(sim, 'woodGenerator', w.idx(x + 6, y));
    run(sim, HOUR * 3);
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.world.fuel).toEqual(w.fuel);
    expect(copy.world.fresh).toEqual(w.fresh);
    expect(copy.power).toEqual(sim.power);
  });
});
