import { describe, expect, it } from 'vitest';
import { besieging } from './combat';
import { featureId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation, TICKS_PER_HOUR } from './simulation';
import { triggerEvent } from './storyteller';

// A colony on day 41, quiet but for what the test brings.
function colony(seed: number) {
  const sim = Simulation.newColony(seed);
  sim.tick = 40 * 24 * TICKS_PER_HOUR;
  sim.syncClock();
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  const keepWell = () => {
    for (const c of sim.colonists) {
      c.needs.food = 1;
      c.needs.rest = 1;
      c.needs.joy = 1;
    }
  };
  return { sim, keepWell };
}

describe('sieges', () => {
  it('camp out of reach, dig in, and attack once they are ready', () => {
    const { sim, keepWell } = colony(11);
    expect(triggerEvent(sim, 'siege')).toBe(true);
    const siege = besieging(sim)!;
    expect(siege).toBeDefined();
    expect(sim.storyLog.at(-1)!.text).toMatch(/^Siege!/);
    const home = sim.homeTile()!;
    const w = sim.world;
    // Waiting: they gather at the camp and don't come closer, and the raid hasn't "arrived".
    for (let t = 0; t < 6 * TICKS_PER_HOUR && !siege.dugIn; t++) {
      keepWell();
      sim.step();
    }
    expect(siege.dugIn).toBe(true);
    expect([...w.tilesWith('features')].filter((i) => w.feature[i] === featureId('sandbags')).length).toBeGreaterThan(
      0,
    );
    const fighting = sim.enemies.filter((e) => e.hp > 0 && !e.fleeing);
    expect(fighting.length).toBeGreaterThan(0);
    for (const e of fighting) {
      expect(w.distance(e.tile, home)).toBeGreaterThan(10);
    }
    expect(sim.raid!.arrivedTick).toBeUndefined();
    // Saved mid-siege, it's still a siege.
    const loaded = deserialize(structuredClone(serialize(sim)));
    expect(besieging(loaded)).toEqual(siege);
    // Then they attack.
    sim.tick = siege.attackAt;
    sim.step();
    expect(besieging(sim)).toBeUndefined();
    expect(sim.raid!.arrivedTick).toBeDefined();
    expect(sim.storyLog.some((s) => s.text.includes('breaking camp and attacking'))).toBe(true);
  });

  it('shoot at a colonist who comes within reach of the camp', () => {
    const { sim, keepWell } = colony(12);
    triggerEvent(sim, 'siege');
    const siege = besieging(sim)!;
    for (let t = 0; t < 6 * TICKS_PER_HOUR && !siege.dugIn; t++) {
      keepWell();
      sim.step();
    }
    const scout = sim.colonists[0];
    const w = sim.world;
    // Stand someone a few tiles from the camp, in the open.
    scout.tile = sim.nearest(siege.camp, (i) => w.isPassable(i) && w.distance(i, siege.camp) >= 5, 1)[0];
    scout.path = [];
    const shots = () => sim.shots.filter((s) => s.to === scout.tile).length;
    let fired = 0;
    for (let t = 0; t < 120 && fired === 0; t++) {
      keepWell();
      sim.step();
      fired += shots();
    }
    expect(fired).toBeGreaterThan(0);
  });

  it('keep undrafted colonists from working within reach of the camp', () => {
    const { sim, keepWell } = colony(13);
    triggerEvent(sim, 'siege');
    const siege = besieging(sim)!;
    const w = sim.world;
    // The only work there is: trees right by the camp, marked for chopping.
    const trees = sim.nearest(
      siege.camp,
      (i) => w.isPassable(i) && w.feature[i] === 0 && w.distance(i, siege.camp) >= 4 && w.distance(i, siege.camp) <= 8,
      4,
    );
    for (const i of trees) {
      w.setFeature(i, featureId('tree'));
    }
    expect(trees.length).toBeGreaterThan(0);
    const x = trees.map((i) => w.xOf(i));
    const y = trees.map((i) => w.yOf(i));
    sim.apply({
      type: 'designate',
      kind: 'chop',
      rect: { x0: Math.min(...x), y0: Math.min(...y), x1: Math.max(...x), y1: Math.max(...y) },
    });
    expect(sim.nearSiegeCamp(trees[0])).toBe(true);
    for (let t = 0; t < 4 * TICKS_PER_HOUR; t++) {
      keepWell();
      sim.step();
    }
    expect(trees.every((i) => w.feature[i] === featureId('tree') && w.progress[i] === 0)).toBe(true);
  });
});
