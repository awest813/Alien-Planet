import { describe, expect, it } from 'vitest';
import { NONE, featureId, itemDef, itemId, terrainId } from './defs';
import { Simulation, START_HOUR } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';

const SHALLOW = terrainId('shallowWater');
const DEEP = terrainId('deepWater');
const ICE = terrainId('ice');

function waterColony(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  w.dropItemNear(w.idx(x, y + 4), itemId('wood'), 200);
  return { sim, w, x, y };
}

// The first hour, starting from `from`, whose outdoor temperature passes `test`.
function findHour(sim: Simulation, test: (t: number) => boolean, from = 0): number {
  for (let h = from; h < from + 24 * 24; h++) {
    sim.tick = (h - START_HOUR) * HOUR;
    if (test(sim.outdoorTemperature())) {
      return h;
    }
  }
  throw new Error('No such hour');
}

describe('bridges', () => {
  it('are built over deep water and make it walkable', () => {
    const { sim, w, x, y } = waterColony(1);
    const tile = w.idx(x + 3, y);
    w.setTerrain(tile, DEEP);
    expect(w.isPassable(tile)).toBe(false);
    expect(sim.canPlaceBlueprint(w.idx(x + 4, y), featureId('bridge'))).toBe(false);
    sim.apply({ type: 'build', feature: featureId('bridge'), tiles: [tile] });
    run(sim, HOUR * 6);
    expect(w.feature[tile]).toBe(featureId('bridge'));
    expect(w.isPassable(tile)).toBe(true);
    expect(w.moveCost(tile)).toBe(1);
  });

  it('moves anyone standing on a dismantled bridge back to dry land', () => {
    const { sim, w, x, y } = waterColony(2);
    const tile = w.idx(x + 3, y);
    w.setTerrain(tile, DEEP);
    w.setFeature(tile, featureId('bridge'));
    const c = sim.colonists[1];
    c.tile = tile;
    sim.apply({ type: 'designate', rect: { x0: x + 3, y0: y, x1: x + 3, y1: y }, kind: 'deconstruct' });
    run(sim, HOUR * 4);
    expect(w.feature[tile]).toBe(NONE);
    expect(w.isPassable(c.tile)).toBe(true);
  });
});

describe('fishing', () => {
  it('catches fish when food is short', () => {
    const { sim, w, x, y } = waterColony(3);
    // Take away all the food so the colony wants to fish.
    for (let i = 0; i < w.size; i++) {
      if (w.itemType[i] !== NONE && itemDef(w.itemType[i]).nutrition > 0) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    for (let k = -2; k <= 2; k++) {
      w.setTerrain(w.idx(x + 4, y + k), SHALLOW);
    }
    const spot = w.idx(x + 3, y);
    expect(sim.canPlaceBlueprint(spot, featureId('fishingSpot'))).toBe(true);
    expect(sim.canPlaceBlueprint(w.idx(x - 3, y), featureId('fishingSpot'))).toBe(false);
    w.setFeature(spot, featureId('fishingSpot'));
    for (let hour = 0; hour < 8; hour++) {
      for (const c of sim.colonists) {
        c.needs.food = 1;
        c.priorities.hunting = 1;
      }
      run(sim, HOUR);
    }
    expect(sim.stockOf(itemId('rawFish'))).toBeGreaterThan(0);
  });
});

describe('ice', () => {
  it('freezes the shallows in hard frost and thaws them in the warm', () => {
    const { sim, w, x, y } = waterColony(4);
    const pond: number[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = 3; dx <= 7; dx++) {
        const i = w.idx(x + dx, y + dy);
        w.setTerrain(i, SHALLOW);
        pond.push(i);
      }
    }
    const cold = findHour(sim, (t) => t < -6);
    sim.tick = (cold - START_HOUR) * HOUR - 1;
    run(sim, HOUR * 4);
    const frozen = pond.filter((i) => w.terrain[i] === ICE).length;
    expect(frozen).toBeGreaterThan(0);
    expect(w.isPassable(pond[0])).toBe(true);

    const warm = findHour(sim, (t) => t > 12, cold);
    sim.tick = (warm - START_HOUR) * HOUR - 1;
    run(sim, HOUR * 24);
    expect(pond.filter((i) => w.terrain[i] === ICE).length).toBe(0);
  });
});

describe('wading', () => {
  it('soaks colonists who walk through shallow water', () => {
    const { sim, w } = waterColony(5);
    const c = sim.colonists[0];
    const next = w.neighbors(c.tile)[0];
    w.setTerrain(next, SHALLOW);
    c.job = null;
    c.path = [next];
    run(sim, 40);
    expect(c.thoughts.some((t) => t.key === 'soaked')).toBe(true);
  });
});

describe('batteries', () => {
  it('charge from what is generated even while the grid is overloaded', () => {
    const { sim, w, x, y } = waterColony(6);
    sim.research.done.push('electricity', 'solarPower', 'refrigeration');
    w.setFeature(w.idx(x + 6, y), featureId('solarPanel'));
    w.setFeature(w.idx(x + 6, y + 2), featureId('battery'));
    for (let k = 0; k < 6; k++) {
      w.setFeature(w.idx(x - 6, y - 4 + k), featureId('freezer'));
    }
    const noon = findHour(sim, () => true, 9 * 24 + 12);
    sim.tick = (noon - START_HOUR) * HOUR;
    run(sim, 20);
    expect(sim.power.powered).toBe(false);
    expect(sim.power.stored).toBeGreaterThan(0);
    // Once they hold a quarter of an hour of the shortfall, the grid comes back on.
    run(sim, HOUR);
    expect(sim.power.stored).toBeGreaterThan(0);
  });
});
