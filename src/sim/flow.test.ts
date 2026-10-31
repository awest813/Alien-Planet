import { describe, expect, it } from 'vitest';
import { wildCap } from './animals';
import { itemId } from './defs';
import { damage } from './health';
import { deserialize, serialize } from './serialize';
import { OBJECTIVES, Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, run } from './test-helpers';

describe('goals', () => {
  it('leaves the raid goal out of peaceful games', () => {
    const raid = OBJECTIVES.find((o) => o.id === 'raid')!;
    expect(raid.hidden!(Simulation.newColony(1, 'peaceful'))).toBe(true);
    expect(raid.hidden!(Simulation.newColony(1, 'standard'))).toBe(false);
  });

  it('closes a phase whose only open goal has failed, with a notification', () => {
    const sim = Simulation.newColony(2);
    for (const o of OBJECTIVES.filter((o) => o.phase === 1 && o.id !== 'night')) {
      sim.objectivesDone[o.id] = true;
    }
    sim.firstNight = 'failed';
    run(sim, HOUR);
    expect(sim.objectivesDone['phase:1']).toBe(true);
    expect(sim.storyLog.some((s) => s.text.startsWith('Shelter goals complete'))).toBe(true);
  });

  it('announces completed goals as notifications', () => {
    const sim = Simulation.newColony(3);
    sim.apply({ type: 'zone', rect: { x0: 0, y0: 0, x1: 1, y1: 1 }, zone: 1 });
    run(sim, HOUR);
    expect(sim.storyLog.some((s) => s.text.startsWith('Goal complete'))).toBe(true);
  });
});

describe('interruptions', () => {
  it('flags a collapse outside a raid so the game can pause', () => {
    const sim = Simulation.newColony(4);
    sim.events.splice(0);
    const c = sim.colonists[0];
    while (!c.health.downed) {
      damage(sim, c, 0.3, 'bruise');
    }
    expect(sim.events).toContain('collapse');
  });
});

describe('map sizes', () => {
  it('founds colonies on bigger maps with wildlife to match', () => {
    const small = Simulation.newColony(5);
    const large = Simulation.newColony(5, 'standard', 128);
    expect(large.world.width).toBe(128);
    expect(large.world.height).toBe(128);
    expect(wildCap(large)).toBe(wildCap(small) * 4);
    expect(large.animals.length).toBeGreaterThan(small.animals.length * 2);
    // Survives a save round-trip at its own size.
    expect(deserialize(structuredClone(serialize(large))).world.width).toBe(128);
  });
});

describe('raids on big maps', () => {
  it('time a raid from when it reaches the colony, not from the far map edge', () => {
    const sim = Simulation.newColony(6, 'standard', 128);
    expect(triggerEvent(sim, 'raid')).toBe(true);
    const raid = sim.raid!;
    // Pretend the raiders have been walking for 40 hours without getting close.
    for (const e of sim.enemies) {
      e.tile = sim.world.idx(0, 0);
      e.path = [];
    }
    sim.colonists.forEach((c) => (c.tile = sim.world.idx(120, 120)));
    raid.startedTick = sim.tick - HOUR * 40;
    run(sim, 2);
    expect(sim.enemies.every((e) => !e.fleeing)).toBe(true);
    expect(raid.arrivedTick).toBeUndefined();
    // Once they've been at the colony past the time limit, they give up.
    raid.arrivedTick = sim.tick - HOUR * 37;
    run(sim, 2);
    expect(sim.enemies.every((e) => e.fleeing)).toBe(true);
  });
});

describe('full audit fixes', () => {
  it("doesn't let a dead colony survive winter or finish goals", () => {
    const sim = Simulation.newColony(7);
    for (const c of sim.colonists) {
      c.health.dead = true;
    }
    run(sim, HOUR * 24 * 26);
    expect(sim.stats.wintersSurvived).toBe(0);
    expect(sim.objectivesDone['winter']).toBeFalsy();
  });

  it('counts only harvested medicine, not gifts, towards the medicine goal', () => {
    const sim = Simulation.newColony(8);
    sim.world.dropItemNear(sim.colonists[0].tile, itemId('herbalMedicine'), 10);
    run(sim, HOUR);
    expect(sim.objectivesDone['medicine']).toBeFalsy();
  });

  it('spares tame animals in a hunt dragged over a mixed herd', () => {
    const sim = Simulation.newColony(9);
    const [tame, wild] = sim.animals;
    tame.tame = true;
    wild.tile = tame.tile;
    const w = sim.world;
    const r = { x0: w.xOf(tame.tile), y0: w.yOf(tame.tile), x1: w.xOf(tame.tile), y1: w.yOf(tame.tile) };
    sim.apply({ type: 'hunt', rect: r, add: true });
    expect(wild.hunted).toBe(true);
    expect(tame.hunted).toBe(false);
    // Marking only the tame one is a deliberate order.
    wild.tile = w.idx(0, 0);
    sim.apply({ type: 'hunt', rect: r, add: true });
    expect(tame.hunted).toBe(true);
  });

  it('keeps sleepers asleep and timers running across a save', () => {
    const sim = Simulation.newColony(10);
    run(sim, HOUR * 17); // midnight
    const sleeper = sim.colonists.find((c) => c.sleeping)!;
    const copy = deserialize(structuredClone(serialize(sim)));
    const loaded = copy.colonists[sleeper.id];
    expect(loaded.sleeping).toBe(true);
    expect(loaded.job?.type).toBe('sleep');
    expect(loaded.restTicks).toBe(sleeper.restTicks);
  });

  it("doesn't keep interrupting doctors for a rescue with nowhere to go", () => {
    const sim = Simulation.newColony(11);
    const w = sim.world;
    sim.apply({ type: 'designate', rect: { x0: 0, y0: 0, x1: w.width - 1, y1: w.height - 1 }, kind: 'chop' });
    const patient = sim.colonists[0];
    while (!patient.health.downed) {
      damage(sim, patient, 0.3, 'bruise');
    }
    run(sim, HOUR * 2);
    // Tended and lying outdoors, with no shelter anywhere: others get on with their lives.
    const busy = sim.colonists.filter((c) => c !== patient && c.job && c.job.type !== 'wander');
    expect(busy.length).toBeGreaterThan(0);
  });
});

describe('raid outcomes', () => {
  it("doesn't count a raid that never reached the colony as repelled", () => {
    const sim = Simulation.newColony(12, 'standard', 128);
    expect(triggerEvent(sim, 'raid')).toBe(true);
    // They have been out there for three days without getting close.
    sim.raid!.startedTick = sim.tick - HOUR * 73;
    for (let t = 0; t < HOUR * 6 && sim.raid; t++) {
      sim.step();
    }
    expect(sim.raid).toBeNull();
    expect(sim.stats.raidsRepelled).toBe(0);
  });

  it('keeps an overrun an overrun even if someone gets up before the raiders leave', () => {
    const sim = Simulation.newColony(13);
    expect(triggerEvent(sim, 'raid')).toBe(true);
    sim.raid!.outcome = 'overrun';
    for (const e of sim.enemies) {
      e.fleeing = true;
    }
    for (let t = 0; t < HOUR * 6 && sim.raid; t++) {
      sim.step();
    }
    expect(sim.stats.raidsRepelled).toBe(0);
    expect(sim.storyLog.some((s) => s.text.startsWith('The raiders left the colony for dead'))).toBe(true);
  });
});
