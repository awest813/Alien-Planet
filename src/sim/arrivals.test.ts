import { describe, expect, it } from 'vitest';
import { manhuntersArrive } from './animals';
import { MIN_WARNING, inAbout } from './arrivals';
import { spawnRaid } from './combat';
import { FACTIONS } from './defs';
import { Simulation } from './simulation';
import { HOUR, run } from './test-helpers';
import { caravanArrives } from './trade';

const RAIDERS = FACTIONS.findIndex((f) => f.hostile);
const quiet = (size: number, seed = 5) => {
  const sim = Simulation.newColony(seed, 'standard', size);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  return sim;
};
// Ticks from now until the raid first comes within reach of the colony.
const untilContact = (sim: Simulation): number => {
  const t0 = sim.tick;
  while (sim.raid && sim.raid.arrivedTick === undefined && sim.tick - t0 < HOUR * 12) {
    sim.step();
  }
  return (sim.raid?.arrivedTick ?? sim.tick) - t0;
};

describe('arrivals from the edge', () => {
  it('give a small map as much warning as a big one: raiders gather at the edge first', () => {
    const tiny = quiet(64);
    expect(spawnRaid(tiny, RAIDERS, 3)).toBe(true);
    expect(tiny.raid!.musterUntil).toBeGreaterThan(tiny.tick);
    expect(untilContact(tiny)).toBeGreaterThanOrEqual(MIN_WARNING * 0.8);
    // On a big map the walk alone is long enough: no waiting.
    const large = quiet(192);
    expect(spawnRaid(large, RAIDERS, 3)).toBe(true);
    expect(large.raid!.musterUntil).toBeUndefined();
  });

  it('say when the raiders will get there', () => {
    const sim = quiet(64);
    spawnRaid(sim, RAIDERS, 3);
    expect(sim.log.at(-1)!.text).toMatch(/will reach the colony (within the hour|in about (an hour|\d+ hours))/);
    expect(inAbout(HOUR * 0.4)).toBe('within the hour');
    expect(inAbout(HOUR)).toBe('in about an hour');
    expect(inAbout(HOUR * 3.2)).toBe('in about 3 hours');
  });

  it('come on at once if a colonist goes out to meet them', () => {
    const sim = quiet(64);
    spawnRaid(sim, RAIDERS, 3);
    const raider = sim.enemies[0];
    const c = sim.colonists[0];
    c.tile = sim.world.neighbors(raider.tile).find((i) => sim.world.isPassable(i))!;
    c.path = [];
    sim.step();
    expect(sim.raid!.musterUntil).toBeUndefined();
  });

  it('hold a maddened pack at the edge of a small map too', () => {
    const sim = quiet(64);
    sim.animals = [];
    expect(manhuntersArrive(sim, 'wolf', 2)).toBe(2);
    const pack = sim.animals.filter((a) => a.manhunter);
    expect(pack.every((a) => a.musterUntil !== undefined)).toBe(true);
    const where = pack.map((a) => a.tile);
    run(sim, pack[0].musterUntil! - sim.tick - 1);
    expect(pack.map((a) => a.tile)).toEqual(where);
    run(sim, HOUR / 2);
    expect(pack.map((a) => a.tile)).not.toEqual(where);
  });

  it('let traders stay their full time once they reach the colony', () => {
    const sim = quiet(192);
    expect(caravanArrives(sim)).toBe(true);
    const caravan = sim.caravan!;
    while (caravan.arrivedTick === undefined && sim.tick < HOUR * 12) {
      sim.step();
    }
    expect(caravan.arrivedTick).toBeDefined();
    expect(caravan.leaveAt).toBe(caravan.arrivedTick! + 30 * HOUR);
  });
});
