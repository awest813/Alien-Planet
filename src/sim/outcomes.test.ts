import { describe, expect, it } from 'vitest';
import { manhuntersArrive } from './animals';
import { LANDING_TICKS, TRANSMIT_HOURS, WAIT_TICKS, transmitting, updateBeacon } from './beacon';
import { spawnRaid } from './combat';
import { featureId, itemId } from './defs';
import { payTribute } from './diplomacy';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';

// How raids, packs and the ship's visit are written down once they're over.
describe('how it ended', () => {
  it('a colony wiped out by a raid is not recorded as having repelled it', () => {
    let overrun = 0;
    for (const seed of [10, 11, 12, 13]) {
      const sim = Simulation.newColony(seed);
      sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
      sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
      sim.tick = 30 * 24 * HOUR;
      sim.syncClock();
      clearAround(sim, 8);
      expect(spawnRaid(sim, 0, 8)).toBe(true);
      for (let t = 0; t < HOUR * 72 && sim.raid; t++) {
        sim.step();
      }
      if (sim.living().some((c) => !c.health.downed)) {
        continue;
      }
      overrun++;
      expect(sim.stats.raidsRepelled).toBe(0);
      expect(sim.log.some((l) => l.text === 'The raiders are fleeing!')).toBe(false);
    }
    expect(overrun).toBeGreaterThan(0);
  });

  it('a siege paid to go away is not a siege seen off', () => {
    const sim = Simulation.newColony(3);
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.tick = 45 * 24 * HOUR;
    sim.syncClock();
    const { x, y } = clearAround(sim, 8);
    sim.apply({ type: 'zone', rect: { x0: x - 2, y0: y + 2, x1: x + 2, y1: y + 4 }, zone: 1 });
    sim.world.addItem(sim.world.idx(x, y + 3), itemId('silver'), 600);
    expect(spawnRaid(sim, 0, 6, true)).toBe(true);
    expect(sim.raid!.siege).toBeDefined();
    expect(payTribute(sim, 0)).toBeNull();
    for (let t = 0; t < HOUR * 48 && sim.raid; t++) {
      sim.step();
    }
    expect(sim.raid).toBeNull();
    expect(sim.stats.siegesSeenOff ?? 0).toBe(0);
  });

  it('the beacon stays quiet after a ship nobody answered', () => {
    const sim = Simulation.newColony(1);
    const { x, y } = clearAround(sim, 12);
    sim.world.setFeature(sim.world.idx(x + 4, y), featureId('signalBeacon'));
    const hours = (n: number) => {
      for (let k = 0; k < n; k++) {
        sim.power.powered = true;
        sim.tick += HOUR;
        updateBeacon(sim);
      }
    };
    hours(TRANSMIT_HOURS + LANDING_TICKS / HOUR + WAIT_TICKS / HOUR);
    expect(sim.log.some((l) => l.text.startsWith('The ship has lifted off'))).toBe(true);
    hours(3);
    expect(sim.beacon.hours).toBe(0);
    expect(transmitting(sim)).toBe(false);
    // Signalling again starts it over.
    sim.apply({ type: 'signal' });
    hours(2);
    expect(transmitting(sim)).toBe(true);
  });

  it('a maddened pack goes for someone it can reach when the nearest colonist is in a pen', () => {
    const sim = Simulation.newColony(2);
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === 3) {
          w.setFeature(w.idx(x + dx, y + dy), featureId('fence'));
        }
      }
    }
    w.setFeature(w.idx(x + 3, y), featureId('gate'));
    const [a, b, c] = sim.colonists;
    a.tile = w.idx(x, y);
    b.tile = w.idx(x + 8, y);
    c.tile = w.idx(x + 9, y);
    expect(manhuntersArrive(sim, 'wolf', 3)).toBe(3);
    sim.story.manhuntersActive = true;
    for (const wolf of sim.animals.filter((q) => q.manhunter)) {
      wolf.tile = w.idx(x - 6, y);
      wolf.revengeOn = a.id;
      wolf.musterUntil = undefined;
    }
    run(sim, 5);
    expect(sim.animals.filter((q) => q.manhunter).length).toBe(3);
    expect(sim.story.manhuntersActive).toBe(true);
  });
});
