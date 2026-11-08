import { describe, expect, it } from 'vitest';
import { featureId, itemId } from './defs';
import { spreadWildPlants } from './plants';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { WORK_TYPES } from './types';
import { GROW_ZONE } from './world';

// A cleared patch, everyone fed and rested, nobody working, no events.
function camp(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 14);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  for (const c of sim.colonists) {
    c.schedule.fill('W');
    for (const work of WORK_TYPES) {
      c.priorities[work] = 0;
    }
  }
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

const trees = (sim: Simulation) => sim.countFeature((f) => f === featureId('tree'));

describe('wood that lasts', () => {
  it('poplars grow in a zone, shrug off frost, and are cut for wood', () => {
    const { sim, w, x, y, keepFed } = camp(1);
    sim.colonists[0].priorities.growing = 1;
    sim.apply({
      type: 'zone',
      rect: { x0: x + 3, y0: y + 3, x1: x + 5, y1: y + 4 },
      zone: GROW_ZONE + featureId('poplarPlant'),
    });
    keepFed(24 * 8);
    expect(sim.stats.produced.wood ?? 0).toBeGreaterThan(0);
    // A hard frost kills potatoes, not poplars.
    sim.apply({ type: 'zone', rect: { x0: x + 3, y0: y + 3, x1: x + 5, y1: y + 4 }, zone: 0 });
    const poplars = [w.idx(x - 4, y - 4), w.idx(x - 3, y - 4), w.idx(x - 2, y - 4)];
    const potatoes = [w.idx(x - 4, y - 6), w.idx(x - 3, y - 6), w.idx(x - 2, y - 6)];
    poplars.forEach((i) => w.setFeature(i, featureId('poplarPlant')));
    potatoes.forEach((i) => w.setFeature(i, featureId('potatoPlant')));
    sim.colonists[0].priorities.growing = 0;
    sim.temperatureAt = () => -20;
    keepFed(24 * 3);
    expect(potatoes.some((i) => w.feature[i] !== featureId('potatoPlant'))).toBe(true);
    expect(poplars.every((i) => w.feature[i] === featureId('poplarPlant'))).toBe(true);
  });

  it('a valley cut bare greens again, from seed blown in', () => {
    const { sim, w } = camp(2);
    const tree = featureId('tree');
    for (const i of [...w.tilesWith('features')]) {
      if (w.feature[i] === tree || w.feature[i] === featureId('berryBush')) {
        w.setFeature(i, 0);
      }
    }
    expect(trees(sim)).toBe(0);
    for (let d = 0; d < 10; d++) {
      spreadWildPlants(sim);
    }
    expect(trees(sim)).toBeGreaterThan(0);
  });

  it('in the cold, short of wood, the fires are fed before the generators', () => {
    const { sim, w, x, y, keepFed } = camp(3);
    for (const i of [...w.tilesWith('items')]) {
      if (w.itemType[i] === itemId('wood')) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    const fire = w.idx(x + 3, y);
    const generator = w.idx(x - 3, y);
    w.setFeature(fire, featureId('campfire'));
    w.setFeature(generator, featureId('woodGenerator'));
    w.fuel[fire] = 0;
    w.fuel[generator] = 0;
    w.addItem(w.idx(x, y + 3), itemId('wood'), 12);
    sim.outdoorTemperature = () => -10;
    expect(sim.woodForFiresOnly()).toBe(true);
    for (const c of sim.colonists) {
      c.priorities.hauling = 1;
    }
    keepFed(4);
    expect(w.fuel[fire]).toBeGreaterThan(0);
    expect(w.fuel[generator]).toBe(0);
    // With wood to spare (or in the warm), the generator gets its share too.
    w.addItem(w.idx(x, y + 4), itemId('wood'), 25);
    w.addItem(w.idx(x, y + 5), itemId('wood'), 25);
    expect(sim.woodForFiresOnly()).toBe(false);
    keepFed(4);
    expect(w.fuel[generator]).toBeGreaterThan(0);
  });
});

describe('a fire in the open', () => {
  it('warms the ground right around it while it burns', () => {
    const { sim, w, x, y } = camp(21);
    const fire = w.idx(x + 4, y + 4);
    w.setFeature(fire, featureId('campfire'));
    w.fuel[fire] = 10;
    const out = sim.outdoorTemperature();
    expect(sim.temperatureAt(w.idx(x + 5, y + 4))).toBeCloseTo(out + 12);
    expect(sim.temperatureAt(w.idx(x + 6, y + 4))).toBeCloseTo(out + 6);
    expect(sim.temperatureAt(w.idx(x + 7, y + 4))).toBeCloseTo(out);
    // Gone out: no warmth.
    w.fuel[fire] = 0;
    sim.fuelVersion++;
    expect(sim.temperatureAt(w.idx(x + 5, y + 4))).toBeCloseTo(out);
  });
});

describe('a fire indoors', () => {
  it('warms the room, and the tiles right beside it more', () => {
    const { sim, w, x, y } = camp(22);
    // A closed 5×5 room with a campfire in the middle.
    const walls: number[] = [];
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        if (dx === 0 || dy === 0 || dx === 6 || dy === 6) {
          walls.push(w.idx(x + 3 + dx, y + 3 + dy));
        }
      }
    }
    for (const i of walls) {
      w.setFeature(i, featureId('woodWall'));
    }
    const fire = w.idx(x + 6, y + 6);
    w.setFeature(fire, featureId('campfire'));
    w.fuel[fire] = 20;
    const beside = sim.temperatureAt(w.idx(x + 7, y + 6));
    const corner = sim.temperatureAt(w.idx(x + 4, y + 4));
    expect(beside).toBeCloseTo(corner + 6);
    // Not through the wall.
    expect(sim.temperatureAt(w.idx(x + 10, y + 6))).toBeCloseTo(sim.outdoorTemperature());
  });
});
