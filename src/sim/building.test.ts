import { describe, expect, it } from 'vitest';
import { NONE, featureId, itemId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { GROW_ZONE } from './world';
import { isWet } from './weather';

const forever = Number.MAX_SAFE_INTEGER;

// A cleared patch with plenty of building materials lying about.
function site(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.weather = { kind: 'clear', until: forever };
  w.dropItemNear(w.idx(x - 6, y - 6), itemId('wood'), 300);
  w.dropItemNear(w.idx(x - 6, y - 6), itemId('stone'), 100);
  w.dropItemNear(w.idx(x - 6, y - 6), itemId('cloth'), 50);
  return { sim, w, x, y };
}

describe('floors', () => {
  it('are laid under existing furniture, quicken walking and brighten the room', () => {
    const { sim, w, x, y } = site(1);
    const hut = { x0: x + 2, y0: y + 2, x1: x + 7, y1: y + 6 };
    sim.apply({ type: 'build', feature: featureId('woodWall'), tiles: outline(w, hut.x0, hut.y0, hut.x1, hut.y1) });
    sim.apply({ type: 'build', feature: featureId('door'), tiles: [w.idx(hut.x0, hut.y0 + 2)] });
    const bed = w.idx(hut.x0 + 2, hut.y0 + 2);
    sim.apply({ type: 'build', feature: featureId('bed'), tiles: [bed] });
    run(sim, HOUR * 16);
    expect(w.feature[bed]).toBe(featureId('bed'));
    const before = sim.roomAt(bed)!.impressiveness;
    const inside: number[] = [];
    for (let ty = hut.y0 + 1; ty < hut.y1; ty++) {
      for (let tx = hut.x0 + 1; tx < hut.x1; tx++) {
        inside.push(w.idx(tx, ty));
      }
    }
    sim.apply({ type: 'build', feature: featureId('woodFloor'), tiles: inside });
    run(sim, HOUR * 16);
    expect(inside.every((i) => w.floor[i] === featureId('woodFloor'))).toBe(true);
    // The bed is still there, on top of the floor.
    expect(w.feature[bed]).toBe(featureId('bed'));
    expect(w.moveCost(inside[0])).toBeLessThan(1);
    expect(sim.roomAt(bed)!.impressiveness).toBeGreaterThan(before);
  });

  it('are not sown with crops', () => {
    const { sim, w, x, y } = site(2);
    const tile = w.idx(x + 3, y + 3);
    w.setLayer('floor', tile, featureId('woodFloor'));
    sim.apply({
      type: 'zone',
      rect: { x0: x + 3, y0: y + 3, x1: x + 3, y1: y + 3 },
      zone: GROW_ZONE + featureId('potatoPlant'),
    });
    run(sim, HOUR * 4);
    expect(w.feature[tile]).toBe(NONE);
  });

  it('come up again when deconstructed, giving back most of their materials', () => {
    const { sim, w, x, y } = site(3);
    const tile = w.idx(x + 3, y + 3);
    w.setLayer('floor', tile, featureId('stoneTiles'));
    sim.apply({ type: 'designate', kind: 'deconstruct', rect: { x0: x + 3, y0: y + 3, x1: x + 3, y1: y + 3 } });
    const blocks = sim.stockOf(itemId('stoneBlocks'));
    run(sim, HOUR * 3);
    expect(w.floor[tile]).toBe(NONE);
    expect(sim.stockOf(itemId('stoneBlocks'))).toBeGreaterThan(blocks);
  });

  it("give back the wood still in a generator's hopper", () => {
    const { sim, w, x, y } = site(3);
    const tile = w.idx(x + 3, y + 3);
    sim.research.done.push('electricity');
    w.setFeature(tile, featureId('woodGenerator'));
    w.fuel[tile] = 60;
    const wood = sim.stockOf(itemId('wood'));
    sim.apply({ type: 'designate', kind: 'deconstruct', rect: { x0: x + 3, y0: y + 3, x1: x + 3, y1: y + 3 } });
    run(sim, HOUR * 3);
    expect(w.feature[tile]).toBe(NONE);
    // The refund (three-quarters of its 30 wood) and the 60 in the hopper (less any burned meanwhile).
    expect(sim.stockOf(itemId('wood')) - wood).toBeGreaterThan(22 + 50);
  });
});

describe('roofs', () => {
  it('keep the rain off an open shelter', () => {
    const { sim, w, x, y } = site(4);
    const tiles = [w.idx(x + 3, y + 3), w.idx(x + 4, y + 3)];
    sim.apply({ type: 'build', feature: featureId('roof'), tiles });
    run(sim, HOUR * 4);
    expect(tiles.every((i) => w.roof[i] === featureId('roof'))).toBe(true);
    sim.weather = { kind: 'rain', until: forever };
    expect(isWet(sim, tiles[0])).toBe(false);
    expect(isWet(sim, w.idx(x + 6, y + 6))).toBe(true);
    // It's still outdoors: no walls, no room.
    expect(sim.isIndoors(tiles[0])).toBe(false);
  });

  it('survive a save along with floors', () => {
    const { sim, w, x, y } = site(5);
    const tile = w.idx(x + 3, y + 3);
    w.setLayer('roof', tile, featureId('roof'));
    w.setLayer('floor', tile, featureId('carpet'));
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.world.roof[tile]).toBe(featureId('roof'));
    expect(copy.world.floor[tile]).toBe(featureId('carpet'));
  });
});

describe('floor and roof plans', () => {
  it('leave a stockpile usable while waiting to be built', () => {
    const { sim, w, x, y } = site(11);
    const tile = w.idx(x + 3, y + 3);
    sim.apply({ type: 'build', feature: featureId('roof'), tiles: [tile] });
    expect(w.blueprint[tile]).toBe(featureId('roof'));
    expect(w.canHoldItem(tile, itemId('wood'))).toBe(true);
  });

  it("don't wipe out each other's plans", () => {
    const { sim, w, x, y } = site(12);
    const tile = w.idx(x + 3, y + 3);
    sim.apply({ type: 'build', feature: featureId('woodFloor'), tiles: [tile] });
    sim.apply({ type: 'build', feature: featureId('roof'), tiles: [tile] });
    expect(w.blueprint[tile]).toBe(featureId('woodFloor'));
    // A different floor replaces the planned one.
    sim.apply({ type: 'build', feature: featureId('stoneTiles'), tiles: [tile] });
    expect(w.blueprint[tile]).toBe(featureId('stoneTiles'));
  });

  it('never put a floor under a growing crop, or a roof over one', () => {
    const { sim, w, x, y } = site(13);
    const tile = w.idx(x + 3, y + 3);
    w.setFeature(tile, featureId('potatoPlant'));
    expect(sim.canPlaceBlueprint(tile, featureId('woodFloor'))).toBe(false);
    expect(sim.canPlaceBlueprint(tile, featureId('roof'))).toBe(false);
  });

  it('keep roofs and growing zones apart, so crops get the sun', () => {
    const { sim, w, x, y } = site(15);
    const potatoes = GROW_ZONE + featureId('potatoPlant');
    // No roof over a growing zone, even a bare one.
    const field = w.idx(x + 3, y + 3);
    sim.apply({ type: 'zone', rect: { x0: x + 3, y0: y + 3, x1: x + 3, y1: y + 3 }, zone: potatoes });
    expect(w.zone[field]).toBe(potatoes);
    sim.apply({ type: 'build', feature: featureId('roof'), tiles: [field] });
    expect(w.blueprint[field]).toBe(NONE);
    // No growing zone under a roof; zoning over a planned roof drops the plan.
    const roofed = w.idx(x + 5, y + 3);
    w.setLayer('roof', roofed, featureId('roof'));
    const planned = w.idx(x + 6, y + 3);
    sim.apply({ type: 'build', feature: featureId('roof'), tiles: [planned] });
    expect(w.blueprint[planned]).toBe(featureId('roof'));
    sim.apply({ type: 'zone', rect: { x0: x + 5, y0: y + 3, x1: x + 6, y1: y + 3 }, zone: potatoes });
    expect(w.zone[roofed]).not.toBe(potatoes);
    expect(w.zone[planned]).toBe(potatoes);
    expect(w.blueprint[planned]).toBe(NONE);
  });

  it('leave a crop under a roof (from an older colony) in the dark without a sun lamp', () => {
    const { sim, w, x, y } = site(16);
    const open = w.idx(x + 3, y + 3);
    const covered = w.idx(x + 5, y + 3);
    w.setFeature(open, featureId('potatoPlant'));
    w.setFeature(covered, featureId('potatoPlant'));
    w.setLayer('roof', covered, featureId('roof'));
    run(sim, HOUR * 12);
    expect(w.growth[open]).toBeGreaterThan(0);
    expect(w.growth[covered]).toBe(0);
  });

  it('give back most of an old floor when a new one is laid over it', () => {
    const { sim, w, x, y } = site(14);
    const tile = w.idx(x + 3, y + 3);
    w.setLayer('floor', tile, featureId('stoneTiles'));
    const blocks = sim.stockOf(itemId('stoneBlocks'));
    sim.apply({ type: 'build', feature: featureId('woodFloor'), tiles: [tile] });
    run(sim, HOUR * 4);
    expect(w.floor[tile]).toBe(featureId('woodFloor'));
    expect(sim.stockOf(itemId('stoneBlocks'))).toBe(blocks + 1);
  });

  it('are left alone by a deconstruct drag that covers buildings', () => {
    const { sim, w, x, y } = site(15);
    const bed = w.idx(x + 3, y + 3);
    const floor = w.idx(x + 4, y + 3);
    w.setFeature(bed, featureId('bed'));
    w.setLayer('floor', bed, featureId('woodFloor'));
    w.setLayer('floor', floor, featureId('woodFloor'));
    sim.apply({ type: 'designate', kind: 'deconstruct', rect: { x0: x + 3, y0: y + 3, x1: x + 4, y1: y + 3 } });
    expect(w.designation[bed]).not.toBe(0);
    expect(w.designation[floor]).toBe(0);
  });
});

describe('tool kits', () => {
  it('are made at a crafting bench, picked up, speed up work and wear out', () => {
    const { sim, w, x, y } = site(6);
    sim.apply({ type: 'build', feature: featureId('craftingBench'), tiles: [w.idx(x + 3, y + 3)] });
    run(sim, HOUR * 9);
    const equipped = sim.colonists.filter((c) => c.tool);
    expect(equipped.length).toBeGreaterThan(0);
    // Kits speed up the work they're for.
    const [c] = equipped;
    const speed = (sim as unknown as { workSpeed: (c: unknown, type: string) => number }).workSpeed.bind(sim);
    const withKit = speed(c, 'chop');
    const kit = c.tool;
    c.tool = null;
    expect(speed(c, 'chop')).toBeLessThan(withKit);
    c.tool = kit;
    // Nearly worn through, every kit falls apart with a little more use.
    for (const e of equipped) {
      e.tool!.wear = 0.0001;
    }
    for (let k = 0; k < 6; k++) {
      w.setFeature(w.idx(x + 9, y - 9 + k), featureId('tree'));
    }
    sim.apply({ type: 'designate', kind: 'chop', rect: { x0: x + 9, y0: y - 9, x1: x + 9, y1: y - 4 } });
    run(sim, HOUR * 3);
    expect(sim.log.some((l) => l.text.includes('tool kit has worn out'))).toBe(true);
  });

  it('are not made from materials a blueprint is waiting for', () => {
    const sim = Simulation.newColony(8);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    w.dropItemNear(w.idx(x - 6, y - 6), itemId('wood'), 100);
    w.dropItemNear(w.idx(x + 6, y - 6), itemId('stone'), 20);
    w.setFeature(w.idx(x + 3, y + 3), featureId('craftingBench'));
    // Nobody builds, so the stove's blueprint keeps waiting for its 20 stone.
    for (const c of sim.colonists) {
      c.priorities.construction = 0;
      c.priorities.hauling = 0;
      c.priorities.crafting = 1;
    }
    sim.apply({ type: 'build', feature: featureId('stove'), tiles: [w.idx(x - 3, y + 3)] });
    run(sim, HOUR * 4);
    expect(sim.stockOf(itemId('toolKit'))).toBe(0);
    expect(sim.stockOf(itemId('stone'))).toBe(20);
  });

  it('keep their wear when set down and picked up again', () => {
    const sim = Simulation.newColony(9);
    const w = sim.world;
    const tile = sim.colonists[0].tile;
    w.dropItemNear(tile, itemId('toolKit'), 1, 0.2, 12);
    const at = [...w.tilesWith('items')].find((i) => w.itemType[i] === itemId('toolKit'))!;
    expect(w.pickUp(at, 1).fresh).toBeCloseTo(0.2);
  });

  it('survive a save in hand', () => {
    const sim = Simulation.newColony(7);
    sim.colonists[0].tool = { quality: 12, wear: 0.5 };
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.colonists[0].tool).toEqual({ quality: 12, wear: 0.5 });
  });
});

describe('a door into a finished wall', () => {
  it('takes the wall down and puts the door up, so nobody stays shut in', () => {
    const { sim, w, x, y } = site(5);
    for (const i of outline(w, x + 2, y - 2, x + 6, y + 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    const inside = sim.colonists[0];
    inside.tile = w.idx(x + 4, y);
    const wall = w.idx(x + 2, y);
    expect(sim.canPlaceBlueprint(wall, featureId('door'))).toBe(true);
    sim.apply({ type: 'build', tiles: [wall], feature: featureId('door') });
    run(sim, HOUR * 6);
    expect(w.feature[wall]).toBe(featureId('door'));
    expect(sim.regionOf(inside.tile)).toBe(sim.regionOf(w.idx(x - 2, y)));
  });
});
