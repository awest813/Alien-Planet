import { describe, expect, it } from 'vitest';
import { FACTIONS, itemId } from './defs';
import {
  HOSTILE_DEALINGS,
  TRUCE_DAYS,
  TRUCE_GOODWILL,
  atPeace,
  pickRaider,
  proposeTruce,
  raidPressure,
  truceDays,
  updateDiplomacy,
} from './diplomacy';
import {
  DOWNED_TICKS,
  PRISONER_BED,
  STARVE_HOURS,
  ransom,
  ransomPrice,
  release,
  talk,
  updateCaptives,
} from './prisoners';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { eventWeight, triggerEvent } from './storyteller';
import { HOUR, clearAround, run } from './test-helpers';
import { HOSTILE_GOODWILL, colonyStock, goodwillOf } from './trade';
import { Captive } from './types';

const RAIDERS = FACTIONS.filter((f) => f.hostile).map((f) => f.id);
const SILVER = itemId('silver');

// A colony with a stockpile, no events, and a captive of the first raider faction.
function colony(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y + 4, x1: x + 4, y1: y + 7 }, zone: 1 });
  return { sim, w, x, y };
}

function captive(sim: Simulation, extra: Partial<Captive> = {}): Captive {
  const p: Captive = {
    id: 700 + sim.captives.length,
    name: `Captive ${sim.captives.length}`,
    faction: RAIDERS[0],
    tile: sim.colonists[0].tile,
    state: 'downed',
    capture: false,
    since: sim.tick,
    food: 0.6,
    resistance: 2,
    skill: 5,
    lastVisit: 0,
    hungryHours: 0,
    ...extra,
  };
  sim.captives.push(p);
  return p;
}

describe("raiders' goodwill", () => {
  it('starts hostile, and old saves without it load the same', () => {
    const { sim } = colony(1);
    for (const f of RAIDERS) {
      expect(goodwillOf(sim, f)).toBe(HOSTILE_GOODWILL);
    }
    const data = serialize(sim);
    data.goodwill = {};
    expect(goodwillOf(deserialize(data), RAIDERS[1])).toBe(HOSTILE_GOODWILL);
  });

  it('softens when their people are let go, and hardens when they are starved or turned', () => {
    const { sim } = colony(2);
    const a = captive(sim);
    release(sim, a.id);
    expect(goodwillOf(sim, RAIDERS[0])).toBe(HOSTILE_GOODWILL + HOSTILE_DEALINGS.releasedWounded);
    // The other raiders don't care.
    expect(goodwillOf(sim, RAIDERS[1])).toBe(HOSTILE_GOODWILL);
    const b = captive(sim, { state: 'prisoner' });
    release(sim, b.id);
    expect(goodwillOf(sim, RAIDERS[0])).toBe(
      HOSTILE_GOODWILL + HOSTILE_DEALINGS.releasedWounded + HOSTILE_DEALINGS.released,
    );
    // A prisoner left to starve in a cell.
    const bed = sim.colonists[1].tile;
    sim.world.setFeature(bed, PRISONER_BED);
    captive(sim, { faction: RAIDERS[1], state: 'prisoner', tile: bed, food: 0, hungryHours: STARVE_HOURS - 1 });
    updateCaptives(sim);
    expect(sim.captives).toHaveLength(0);
    expect(goodwillOf(sim, RAIDERS[1])).toBe(HOSTILE_GOODWILL + HOSTILE_DEALINGS.starved);
    // One left lying to die of their wounds counts a little.
    captive(sim, { faction: RAIDERS[1], since: sim.tick - DOWNED_TICKS });
    updateCaptives(sim);
    expect(goodwillOf(sim, RAIDERS[1])).toBe(HOSTILE_GOODWILL + HOSTILE_DEALINGS.starved + HOSTILE_DEALINGS.leftToDie);
  });

  it('resent one of theirs being won over', () => {
    const { sim } = colony(8);
    const p = captive(sim, { state: 'prisoner', resistance: 0 });
    const warden = sim.colonists[0];
    warden.mood = 100;
    for (let k = 0; k < 40 && sim.captives.length > 0; k++) {
      talk(sim, warden, p);
    }
    expect(sim.captives).toHaveLength(0);
    expect(goodwillOf(sim, RAIDERS[0])).toBe(HOSTILE_GOODWILL + HOSTILE_DEALINGS.recruited);
  });

  it('sell a captive back: silver for the colony, and a little less bad blood', () => {
    const { sim } = colony(3);
    const p = captive(sim, { skill: 6 });
    const price = ransomPrice(p);
    expect(price).toBeGreaterThan(50);
    expect(ransom(sim, p.id)).toBeNull();
    expect(sim.captives).toHaveLength(0);
    expect(goodwillOf(sim, RAIDERS[0])).toBe(HOSTILE_GOODWILL + HOSTILE_DEALINGS.ransomed);
    // Less than letting them go for nothing.
    expect(HOSTILE_DEALINGS.ransomed).toBeLessThan(HOSTILE_DEALINGS.released);
    run(sim, HOUR * 6);
    expect(colonyStock(sim, SILVER)).toBe(100 + price);
    expect(sim.stats.ransomed).toBe(1);
    expect(ransom(sim, p.id)).not.toBeNull();
  });

  it('an execution hardens their people for good, and weighs on everyone', () => {
    const { sim } = colony(4);
    const downed = captive(sim);
    // Only a prisoner in a cell, not someone lying wounded.
    sim.apply({ type: 'execute', captive: downed.id });
    expect(sim.captives).toHaveLength(1);
    const p = captive(sim, { state: 'prisoner' });
    sim.apply({ type: 'execute', captive: p.id });
    expect(sim.captives.map((q) => q.id)).not.toContain(p.id);
    expect(goodwillOf(sim, RAIDERS[0])).toBe(HOSTILE_GOODWILL + HOSTILE_DEALINGS.executed);
    expect(HOSTILE_DEALINGS.executed).toBeLessThan(HOSTILE_DEALINGS.starved);
    expect(sim.living().every((c) => c.thoughts.some((t) => t.key === 'execution'))).toBe(true);
    expect(sim.stats.executions).toBe(1);
  });

  it('drifts back to where it started', () => {
    const { sim } = colony(4);
    sim.goodwill[RAIDERS[0]] = -20;
    sim.goodwill[RAIDERS[1]] = -80;
    for (let h = 0; h < 24 * 12; h++) {
      sim.tick += HOUR;
      updateDiplomacy(sim);
    }
    expect(goodwillOf(sim, RAIDERS[0])).toBeLessThan(-20);
    expect(goodwillOf(sim, RAIDERS[0])).toBeGreaterThan(HOSTILE_GOODWILL);
    expect(goodwillOf(sim, RAIDERS[1])).toBeGreaterThan(-80);
  });
});

describe('raids answer to how wary the raiders are', () => {
  it('the warier faction raids more often, with a few more raiders', () => {
    const { sim } = colony(5);
    sim.tick = HOUR * 24 * 20;
    const even = eventWeight(sim, 'raid');
    expect(raidPressure(sim, RAIDERS[0])).toBe(1);
    sim.goodwill[RAIDERS[0]] = -100;
    sim.goodwill[RAIDERS[1]] = 0;
    expect(raidPressure(sim, RAIDERS[0])).toBeCloseTo(1.2);
    expect(raidPressure(sim, RAIDERS[1])).toBeCloseTo(0.8);
    // About the same in all, but most of it from the warier one.
    expect(eventWeight(sim, 'raid')).toBeCloseTo(even);
    let wary = 0;
    for (let k = 0; k < 400; k++) {
      wary +=
        pickRaider(
          sim,
          RAIDERS.map((id) => ({ id })),
        ) === RAIDERS[0]
          ? 1
          : 0;
    }
    expect(wary).toBeGreaterThan(220);
    expect(wary).toBeLessThan(290);
    // Softened all round: fewer raids.
    sim.goodwill[RAIDERS[0]] = 0;
    expect(eventWeight(sim, 'raid')).toBeLessThan(even * 0.85);
  });

  it('a truce: only once they have softened; no raids from them while it holds; it spends their goodwill', () => {
    const { sim } = colony(6);
    sim.tick = HOUR * 24 * 20;
    expect(proposeTruce(sim, RAIDERS[0])).toMatch(/won't hear/);
    sim.goodwill[RAIDERS[0]] = TRUCE_GOODWILL;
    expect(proposeTruce(sim, RAIDERS[0])).toBeNull();
    expect(truceDays(sim, RAIDERS[0])).toBe(TRUCE_DAYS);
    expect(atPeace(sim, RAIDERS[0])).toBe(true);
    expect(goodwillOf(sim, RAIDERS[0])).toBeLessThan(TRUCE_GOODWILL);
    expect(proposeTruce(sim, RAIDERS[0])).toMatch(/already/);
    for (let k = 0; k < 5; k++) {
      sim.enemies = [];
      expect(triggerEvent(sim, 'raid')).toBe(true);
      expect(sim.enemies.every((e) => e.faction !== RAIDERS[0])).toBe(true);
    }
    // It ends, and the colony hears of it; it survives a save on the way.
    const loaded = deserialize(structuredClone(serialize(sim)));
    expect(truceDays(loaded, RAIDERS[0])).toBe(TRUCE_DAYS);
    loaded.enemies = [];
    loaded.raid = null;
    loaded.tick += HOUR * 24 * TRUCE_DAYS;
    for (let h = 0; h < 25; h++) {
      loaded.tick += HOUR;
      updateDiplomacy(loaded);
    }
    expect(atPeace(loaded, RAIDERS[0])).toBe(false);
    expect(loaded.log.some((l) => l.text.includes('truce with') && l.text.includes('ended'))).toBe(true);
  });

  it('a truce sends their raiders home', () => {
    const { sim } = colony(7);
    sim.tick = HOUR * 24 * 20;
    sim.goodwill[RAIDERS[1]] = 0;
    sim.goodwill[RAIDERS[0]] = 0;
    sim.diplomacy.peaceUntil[RAIDERS[0]] = sim.tick + HOUR * 24;
    expect(triggerEvent(sim, 'raid')).toBe(true);
    expect(sim.enemies.length).toBeGreaterThan(0);
    expect(proposeTruce(sim, RAIDERS[1])).toBeNull();
    expect(sim.enemies.every((e) => e.fleeing)).toBe(true);
  });
});
