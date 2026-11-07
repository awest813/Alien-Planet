import { describe, expect, it } from 'vitest';
import { featureId, itemId, terrainId } from './defs';
import { damage } from './health';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { WORK_TYPES } from './types';
import { Designation, Filth } from './world';

// A cleared patch with a closed 5×5 hut, no weather or events, and nobody working yet.
function hut(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
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
  for (const i of outline(w, x + 2, y - 3, x + 8, y + 3)) {
    w.setFeature(i, featureId('woodWall'));
  }
  w.setFeature(w.idx(x + 2, y), featureId('door'));
  const inside = (dx: number, dy: number) => w.idx(x + 5 + dx, y + dy);
  return { sim, w, x, y, inside };
}

describe('mess', () => {
  it('piles up to three levels, never in water or under a wall, and a heavy mess keeps its kind', () => {
    const { w, x, y } = hut(1);
    const tile = w.idx(x, y + 5);
    w.addFilth(tile, Filth.DIRT);
    w.addFilth(tile, Filth.DIRT, 5);
    expect([w.filthKind(tile), w.filthAmount(tile)]).toEqual([Filth.DIRT, 3]);
    w.addFilth(tile, Filth.BLOOD);
    expect(w.filthKind(tile)).toBe(Filth.DIRT);
    w.cleanFilth(tile, true);
    w.addFilth(tile, Filth.DIRT);
    w.addFilth(tile, Filth.BLOOD);
    expect([w.filthKind(tile), w.filthAmount(tile)]).toEqual([Filth.BLOOD, 2]);
    expect([...w.tilesWith('filth')]).toContain(tile);
    // A wall built over it buries it.
    w.setFeature(tile, featureId('woodWall'));
    expect(w.filth[tile]).toBe(0);
    const pond = w.idx(x - 3, y + 5);
    w.setTerrain(pond, terrainId('shallowWater'));
    w.addFilth(pond, Filth.BLOOD);
    expect(w.filth[pond]).toBe(0);
  });

  it('comes from wounds, mining and demolition', () => {
    const { sim, w, x, y } = hut(2);
    const c = sim.colonists[0];
    damage(sim, c, 0.2, 'cut');
    expect(w.filthKind(c.tile)).toBe(Filth.BLOOD);
    const rock = w.idx(x - 4, y - 4);
    w.setFeature(rock, featureId('rock'));
    w.designation[rock] = Designation.MINE;
    c.priorities.mining = 1;
    c.health.injuries = [];
    run(sim, HOUR * 6);
    expect(w.feature[rock]).toBe(0);
    expect(w.filthKind(rock)).toBe(Filth.RUBBLE);
  });

  it('is tracked in onto floors from bare ground', () => {
    const { sim, w, inside } = hut(3);
    const floor = inside(0, 0);
    w.setLayer('floor', floor, featureId('woodFloor'));
    const outside = w.idx(w.xOf(floor), w.yOf(floor) + 6);
    // Step in and out many times.
    for (let k = 0; k < 200 && w.filth[floor] === 0; k++) {
      sim.tick++;
      (sim as unknown as { trackDirt(a: number, b: number): void }).trackDirt(outside, floor);
    }
    expect(w.filthKind(floor)).toBe(Filth.DIRT);
    // Floor to floor carries nothing.
    w.cleanFilth(floor, true);
    w.setLayer('floor', outside, featureId('woodFloor'));
    for (let k = 0; k < 200; k++) {
      sim.tick++;
      (sim as unknown as { trackDirt(a: number, b: number): void }).trackDirt(outside, floor);
    }
    expect(w.filth[floor]).toBe(0);
  });

  it('spoils a room’s beauty until someone cleans it', () => {
    const { sim, w, inside } = hut(4);
    const before = sim.roomAt(inside(0, 0))!.impressiveness;
    for (let dx = -2; dx <= 2; dx++) {
      w.addFilth(inside(dx, 1), Filth.BLOOD, 3);
    }
    run(sim, HOUR);
    const messy = sim.roomAt(inside(0, 0))!.impressiveness;
    expect(messy).toBeLessThan(before);
    expect(sim.beautyAround(inside(0, 1))).toBeLessThan(0);
    const cleaner = sim.colonists[0];
    cleaner.priorities.cleaning = 1;
    run(sim, HOUR * 5);
    expect([...w.tilesWith('filth')].filter((i) => sim.roomAt(i)?.enclosed)).toEqual([]);
    run(sim, HOUR);
    expect(sim.roomAt(inside(0, 0))!.impressiveness).toBe(before);
  });

  it('doesn’t send anyone off to clean far from the colony, and wears away outdoors', () => {
    const { sim, w, x, y } = hut(5);
    sim.colonists[0].priorities.cleaning = 1;
    const far = w.idx(x - 11, y - 11);
    w.addFilth(far, Filth.RUBBLE, 3);
    run(sim, HOUR);
    expect(sim.colonists[0].job?.type).not.toBe('clean');
    sim.weather = { kind: 'rain', until: Number.MAX_SAFE_INTEGER };
    run(sim, HOUR * 24);
    expect(w.filth[far]).toBe(0);
  });

  it('is saved with the colony', () => {
    const { sim, w, inside } = hut(6);
    w.addFilth(inside(1, 1), Filth.RUBBLE, 2);
    w.dropItemNear(inside(-1, -1), itemId('wood'), 1);
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.world.filthKind(inside(1, 1))).toBe(Filth.RUBBLE);
    expect(copy.world.filthAmount(inside(1, 1))).toBe(2);
    expect([...copy.world.tilesWith('filth')]).toEqual([inside(1, 1)]);
  });

  it('gives colonists from an older save normal priority for cleaning', () => {
    const { sim } = hut(7);
    const data = structuredClone(serialize(sim));
    for (const c of data.colonists) {
      delete (c.priorities as Partial<typeof c.priorities>).cleaning;
    }
    const copy = deserialize(data);
    expect(copy.colonists.every((c) => c.priorities.cleaning === 3)).toBe(true);
    copy.apply({ type: 'priority', colonist: 0, work: 'cleaning', value: NaN });
    expect(copy.colonists[0].priorities.cleaning).toBe(3);
  });

  it('counts against a room the same before and after a save and load', () => {
    const { sim, w, inside } = hut(8);
    run(sim, HOUR * 2 + 40);
    sim.roomAt(inside(0, 0));
    w.addFilth(inside(1, 1), Filth.BLOOD, 3);
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(sim.roomAt(inside(0, 0))!.impressiveness).toBe(copy.roomAt(inside(0, 0))!.impressiveness);
  });

  it('washes away when the ice it lies on thaws', () => {
    const { w, x, y } = hut(9);
    const tile = w.idx(x - 3, y + 6);
    w.setTerrain(tile, terrainId('ice'));
    w.addFilth(tile, Filth.BLOOD);
    expect(w.filth[tile]).not.toBe(0);
    w.setTerrain(tile, terrainId('shallowWater'));
    expect(w.filth[tile]).toBe(0);
  });
});
