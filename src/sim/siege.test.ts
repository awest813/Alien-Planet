import { describe, expect, it } from 'vitest';
import { besieging } from './combat';
import { damage } from './health';
import { FACTIONS, featureId, itemId } from './defs';
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

  it('reach their camp and dig in, whichever way they come', () => {
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const { sim, keepWell } = colony(seed);
      triggerEvent(sim, 'siege');
      const siege = besieging(sim)!;
      for (let t = 0; t < 8 * TICKS_PER_HOUR && besieging(sim); t++) {
        keepWell();
        sim.step();
      }
      expect(siege.dugIn).toBe(true);
      for (const e of sim.enemies.filter((r) => r.hp > 0 && !r.fleeing)) {
        expect(
          Math.max(
            Math.abs(sim.world.xOf(e.tile) - sim.world.xOf(siege.camp)),
            Math.abs(sim.world.yOf(e.tile) - sim.world.yOf(siege.camp)),
          ),
        ).toBeLessThanOrEqual(2);
      }
    }
  });

  it("leave nothing behind that counts as the colony's", () => {
    const { sim, keepWell } = colony(14);
    triggerEvent(sim, 'siege');
    const siege = besieging(sim)!;
    for (let t = 0; t < 8 * TICKS_PER_HOUR && !siege.dugIn; t++) {
      keepWell();
      sim.step();
    }
    expect(siege.built!.length).toBeGreaterThan(0);
    // Not even the sandbag goal.
    expect(sim.objectivesDone.sandbags ?? false).toBe(false);
    for (const e of sim.enemies) {
      e.fleeing = true;
      e.hp = 0;
    }
    sim.step();
    expect(sim.raid).toBeNull();
    expect(siege.built!.every((i) => sim.world.feature[i] === 0)).toBe(true);
  });

  it('bring allies for the attack, not to storm the camp', () => {
    const { sim } = colony(15);
    sim.diplomacy.fightersUntil = sim.tick + 1000 * TICKS_PER_HOUR;
    triggerEvent(sim, 'siege');
    const siege = besieging(sim)!;
    expect(sim.raid!.alliesAt).toBeGreaterThan(siege.attackAt);
  });

  it('let colonists bring in and tend the hurt near the camp', () => {
    const { sim, keepWell } = colony(16);
    triggerEvent(sim, 'siege');
    const siege = besieging(sim)!;
    const w = sim.world;
    const hurt = sim.colonists[1];
    hurt.tile = sim.nearest(siege.camp, (i) => w.isPassable(i) && w.distance(i, siege.camp) >= 10, 1)[0];
    hurt.path = [];
    hurt.job = null;
    damage(sim, hurt, 0.9, 'cut');
    expect(hurt.health.downed).toBe(true);
    // The others start well clear of the camp, so whoever helps has to walk into its reach.
    const clear = sim.nearest(siege.camp, (i) => w.isPassable(i) && w.distance(i, siege.camp) >= 18, 1)[0];
    for (const c of sim.colonists) {
      if (c !== hurt) {
        c.tile = clear;
        c.path = [];
        c.job = null;
      }
    }
    // Fed where they lie, so they don't crawl off for food and stay within reach of the camp.
    hurt.needs.food = 1;
    const tended = () => hurt.health.injuries.every((x) => x.tended > 0);
    for (let t = 0; t < 8 * TICKS_PER_HOUR && !tended(); t++) {
      keepWell();
      sim.step();
    }
    expect(tended()).toBe(true);
  });
});

describe('hiring in the thick of it', () => {
  it('brings the fighters to the raid already on', () => {
    const { sim } = colony(17);
    triggerEvent(sim, 'raid');
    expect(sim.raid!.allies).toBeUndefined();
    const kin = FACTIONS.findIndex((f) => !f.hostile);
    sim.goodwill[kin] = 80;
    sim.world.dropItemNear(sim.colonists[0].tile, itemId('silver'), 2000);
    sim.apply({ type: 'zone', rect: { x0: 0, y0: 0, x1: sim.world.width - 1, y1: sim.world.height - 1 }, zone: 1 });
    sim.apply({ type: 'hireFighters', faction: kin });
    expect(sim.raid!.allies).toBeGreaterThanOrEqual(3);
  });
});
