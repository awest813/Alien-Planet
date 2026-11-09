import { describe, expect, it } from 'vitest';
import { spawnRaid } from './combat';
import { featureId } from './defs';
import { Simulation, TICKS_PER_HOUR } from './simulation';
import { clearAround, outline } from './test-helpers';

// A colony past its first year, behind walls of `wall`.
function walled(seed: number, wall: string) {
  const sim = Simulation.newColony(seed);
  // (Summer of the third year: dry.)
  sim.tick = 53 * 24 * TICKS_PER_HOUR;
  sim.syncClock();
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  const w = sim.world;
  const { x, y } = clearAround(sim, 14);
  for (const i of outline(w, x - 4, y - 4, x + 4, y + 4)) {
    w.setFeature(i, featureId(wall));
  }
  return { sim, w, x, y };
}

describe('firebrands', () => {
  it('come against wooden walls, and set them alight', () => {
    const { sim, w, x, y } = walled(3, 'woodWall');
    expect(spawnRaid(sim, 0, 8)).toBe(true);
    const brands = sim.enemies.filter((e) => e.firebrand);
    expect(brands).toHaveLength(2);
    expect(sim.log.at(-1)!.text).toMatch(/Two carry fire for the wooden walls/);
    sim.enemies = [brands[0]];
    sim.raid!.initial = 1;
    brands[0].tile = w.idx(x + 6, y);
    for (let t = 0; t < TICKS_PER_HOUR && sim.burning.size === 0; t++) {
      brands[0].hp = 1;
      sim.step();
    }
    expect([...sim.burning].some((i) => w.feature[i] === featureId('woodWall'))).toBe(true);
    expect(sim.log.some((l) => /set the wood wall alight/i.test(l.text))).toBe(true);
  });

  it("don't come against stone", () => {
    const { sim } = walled(4, 'stoneWall');
    spawnRaid(sim, 0, 8);
    expect(sim.enemies.some((e) => e.firebrand)).toBe(false);
  });

  it("can't throw through a wall at what's inside", () => {
    const { sim, w, x, y } = walled(5, 'stoneWall');
    // A wooden door makes them bring fire, and a bed stands just inside the east wall.
    w.setFeature(w.idx(x, y + 4), featureId('door'));
    const bed = w.idx(x + 3, y);
    w.setFeature(bed, featureId('bed'));
    spawnRaid(sim, 0, 8);
    const brand = sim.enemies.find((e) => e.firebrand)!;
    sim.enemies = [brand];
    sim.raid!.initial = 1;
    brand.tile = w.idx(x + 6, y);
    brand.speed = 0;
    for (let t = 0; t < 30; t++) {
      brand.hp = 1;
      sim.step();
    }
    expect(sim.burning.has(bed)).toBe(false);
  });

  it("don't come in winter, when the timber's frozen", () => {
    const { sim } = walled(6, 'woodWall');
    sim.tick = 42 * 24 * TICKS_PER_HOUR;
    sim.syncClock();
    expect(sim.season).toBe('Winter');
    spawnRaid(sim, 0, 8);
    expect(sim.enemies.some((e) => e.firebrand)).toBe(false);
  });
});
