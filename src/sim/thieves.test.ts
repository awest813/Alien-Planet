import { describe, expect, it } from 'vitest';
import { spawnRaid, woundEnemy } from './combat';
import { itemId } from './defs';
import { Simulation, TICKS_PER_HOUR } from './simulation';
import { clearAround } from './test-helpers';
import { STOCKPILE_ZONE } from './world';

// A colony with silver in a stockpile, and nobody drafted to stop anyone.
function colony(seed: number) {
  const sim = Simulation.newColony(seed);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  const w = sim.world;
  const { x, y } = clearAround(sim, 10);
  sim.apply({ type: 'zone', rect: { x0: x + 3, y0: y + 3, x1: x + 5, y1: y + 5 }, zone: STOCKPILE_ZONE });
  const silver = itemId('silver');
  w.dropItemNear(w.idx(x + 4, y + 4), silver, 400);
  const total = () => {
    let n = 0;
    for (const i of w.tilesWith('items')) {
      if (w.itemType[i] === silver) {
        n += w.itemCount[i];
      }
    }
    return n;
  };
  return { sim, total };
}

describe('thieves', () => {
  it('make for the stores, grab what they can carry and run', () => {
    const { sim, total } = colony(5);
    const before = total();
    expect(spawnRaid(sim, 0, 2, false, true)).toBe(true);
    expect(sim.raid?.thieves).toBe(true);
    expect(sim.log.at(-1)!.text).toMatch(/^Thieves! 2 from /);
    for (let t = 0; t < 24 * TICKS_PER_HOUR && sim.raid; t++) {
      for (const c of sim.colonists) {
        c.needs.food = c.needs.rest = c.needs.joy = 1;
      }
      sim.step();
    }
    expect(sim.raid).toBeNull();
    expect(total()).toBeLessThan(before);
    expect(sim.stats.stolen).toBeGreaterThan(0);
    expect(sim.log.some((l) => /got away with \d+ silver/.test(l.text))).toBe(true);
    expect(sim.log.some((l) => /^The thieves have gone, with about \d+ silver's worth/.test(l.text))).toBe(true);
  });

  it('drop what they took when brought down', () => {
    const { sim, total } = colony(6);
    spawnRaid(sim, 0, 1, false, true);
    const thief = sim.enemies[0];
    const before = total();
    thief.loot = { item: itemId('silver'), count: 100 };
    woundEnemy(sim, thief, 2, 'Juno');
    expect(thief.loot).toBeUndefined();
    expect(sim.stats.thievesCaught).toBe(1);
    expect(total()).toBe(before + 100);
  });
});
