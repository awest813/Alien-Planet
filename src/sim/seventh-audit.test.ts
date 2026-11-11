import { describe, expect, it } from 'vitest';
import { updateBeacon } from './beacon';
import { featureId, itemId } from './defs';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround } from './test-helpers';
import { applyTrade, tradeOpen } from './trade';

// Found by the seventh audit (suspicions earlier audits left unconfirmed), each first seen failing.

describe('the seventh audit', () => {
  it('a trade of NaN or a fraction of something is refused', () => {
    const sim = Simulation.newColony(2);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y + 4, x1: x + 4, y1: y + 7 }, zone: 1 });
    w.addItem(w.idx(x - 3, y + 4), itemId('cloth'), 40);
    expect(triggerEvent(sim, 'caravan')).toBe(true);
    for (let t = 0; t < HOUR * 6 && !tradeOpen(sim); t++) {
      sim.step();
    }
    const theirs = sim.caravan!.stock[0];
    expect(applyTrade(sim, [[theirs.item, NaN]], [])).not.toBeNull();
    expect(applyTrade(sim, [], [[itemId('cloth'), 1.5]])).not.toBeNull();
    expect(applyTrade(sim, [], [[itemId('cloth'), 2]])).toBeNull();
  });

  it('a ship with nobody home to meet it says so, not that it found no beacon', () => {
    const sim = Simulation.newColony(3);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    w.setFeature(w.idx(x + 3, y + 3), featureId('signalBeacon'));
    sim.beacon.answeredAt = sim.tick - 1;
    sim.beacon.landsAt = sim.tick;
    for (const c of sim.colonists) {
      c.away = 'gone';
    }
    expect(sim.living()).toHaveLength(0);
    updateBeacon(sim);
    const said = sim.log.map((e) => e.text).find((t) => t.startsWith('The ship'));
    expect(said).toBe('The ship found nobody at the beacon to meet it and turned back.');
  });

  it('a generator smashed in a rage spills its fuel (taken down, it gives it back)', () => {
    const sim = Simulation.newColony(4);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    const at = w.idx(x + 3, y + 3);
    w.setFeature(at, featureId('woodGenerator'));
    w.fuel[at] = 40;
    const wood = () => sim.resourceTotals().find((r) => r.item === itemId('wood'))?.total ?? 0;
    const before = wood();
    (sim as unknown as { smash(c: unknown, i: number): void }).smash(sim.colonists[0], at);
    expect(w.feature[at]).not.toBe(featureId('woodGenerator'));
    expect(wood()).toBe(before + 40);
  });

  it('traders whose time ran out as they came in are not announced as arrived', () => {
    const sim = Simulation.newColony(5);
    clearAround(sim, 12);
    expect(triggerEvent(sim, 'caravan')).toBe(true);
    const caravan = sim.caravan!;
    caravan.leaveAt = sim.tick;
    for (const v of caravan.visitors) {
      v.tile = sim.homeTile()!;
    }
    sim.step();
    expect(caravan.leaving).toBe(true);
    expect(sim.log.some((e) => e.text.includes('have arrived'))).toBe(false);
  });
});
