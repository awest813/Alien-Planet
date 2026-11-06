import { describe, expect, it } from 'vitest';
import { LANDING_TICKS, TRANSMIT_HOURS, WAIT_TICKS, transmitting, updateBeacon } from './beacon';
import { featureId, itemId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';

// A colony with a beacon standing. `power` sets the grid on or off for the hourly updates below.
function signal(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.research.done.push('electricity', 'signalBeacon');
  const beacon = w.idx(x + 4, y);
  w.setFeature(beacon, featureId('signalBeacon'));
  const hours = (n: number, powered = true) => {
    for (let k = 0; k < n; k++) {
      sim.power.powered = powered;
      sim.tick += HOUR;
      updateBeacon(sim);
    }
  };
  return { sim, w, x, y, beacon, hours };
}

describe('the signal beacon', () => {
  it('transmits only while powered, and a ship answers after five days', () => {
    const { sim, hours } = signal(1);
    hours(10, false);
    expect(sim.beacon.hours).toBe(0);
    hours(TRANSMIT_HOURS - 1);
    expect(sim.beacon.answeredAt).toBeUndefined();
    sim.power.powered = true;
    expect(transmitting(sim)).toBe(true);
    hours(1);
    expect(sim.beacon.answeredAt).toBeDefined();
    expect(sim.events).toContain('shipAnswered');
    expect(transmitting(sim)).toBe(false);
  });

  it('lands the ship two days later, and lets the colony board it', () => {
    const { sim, hours } = signal(2);
    hours(TRANSMIT_HOURS);
    hours(LANDING_TICKS / HOUR);
    expect(sim.beacon.landed).toBe(true);
    expect(sim.events).toContain('shipLanded');
    const aboard = sim.living().length;
    sim.apply({ type: 'shipChoice', board: true });
    expect(sim.departed).toBe(true);
    expect(sim.beacon.choice).toBe('depart');
    expect(sim.storyLog.at(-1)!.text).toContain('boarded the ship');
    expect(sim.living().length).toBe(aboard);
    // Saved with the colony.
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.departed).toBe(true);
  });

  it('can be refused: the colony stays, and the beacon can call again', () => {
    const { sim, hours } = signal(3);
    hours(TRANSMIT_HOURS + LANDING_TICKS / HOUR);
    sim.apply({ type: 'shipChoice', board: false });
    expect(sim.departed).toBe(false);
    expect(sim.beacon.choice).toBe('stay');
    expect(sim.beacon.hours).toBe(0);
    hours(5);
    expect(sim.beacon.hours).toBe(5);
  });

  it('leaves without anyone if the colony never answers', () => {
    const { sim, hours } = signal(4);
    hours(TRANSMIT_HOURS + LANDING_TICKS / HOUR + WAIT_TICKS / HOUR + 1);
    expect(sim.beacon.landed ?? false).toBe(false);
    expect(sim.beacon.choice).toBe('stay');
    expect(sim.departed).toBe(false);
  });

  it("can't be boarded before the ship lands", () => {
    const { sim, hours } = signal(5);
    hours(TRANSMIT_HOURS);
    sim.apply({ type: 'shipChoice', board: true });
    expect(sim.departed).toBe(false);
  });

  it('runs on a real power grid in play', () => {
    const { sim, w, x, y } = signal(6);
    const generator = w.idx(x + 6, y);
    w.setFeature(generator, featureId('woodGenerator'));
    w.dropItemNear(w.idx(x, y + 4), itemId('wood'), 300);
    run(sim, HOUR * 6);
    expect(sim.power.powered).toBe(true);
    expect(sim.beacon.hours).toBeGreaterThan(2);
    expect(sim.objectivesDone.beaconBuilt).toBe(true);
  });
});

describe('the signal beacon: edge cases', () => {
  it('turns the ship back if the beacon is gone when it arrives, and ignores a departed colony', () => {
    const { sim, w, beacon, hours } = signal(7);
    hours(TRANSMIT_HOURS);
    w.setFeature(beacon, 0);
    hours(LANDING_TICKS / HOUR + 1);
    expect(sim.beacon.landed ?? false).toBe(false);
    expect(sim.beacon.hours).toBe(0);
    expect(sim.beacon.choice).toBeUndefined();
    // After boarding, nothing more happens.
    const other = signal(8);
    other.hours(TRANSMIT_HOURS + LANDING_TICKS / HOUR);
    other.sim.apply({ type: 'shipChoice', board: true });
    other.hours(WAIT_TICKS / HOUR + 2);
    expect(other.sim.beacon.choice).toBe('depart');
  });
});
