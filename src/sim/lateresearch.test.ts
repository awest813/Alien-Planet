import { describe, expect, it } from 'vitest';
import { scarAim, scarWork } from './body';
import { featureId, itemId, researchDef } from './defs';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { WORK_TYPES } from './types';
import { STOCKPILE_ZONE } from './world';

// A colony set to study one late project, with everything before it already known and one colonist at
// the research bench.
function study(key: string) {
  const sim = Simulation.newColony(3);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  const known = new Set<string>();
  const learn = (k: string) => {
    for (const r of researchDef(k)!.requires) {
      learn(r);
    }
    known.add(k);
  };
  for (const r of researchDef(key)!.requires) {
    learn(r);
  }
  sim.research.done.push(...known);
  w.setFeature(w.idx(x + 2, y), featureId('researchBench'));
  sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y + 3, x1: x - 2, y1: y + 5 }, zone: STOCKPILE_ZONE });
  for (const c of sim.colonists) {
    for (const work of WORK_TYPES) {
      c.priorities[work] = work === 'research' ? 1 : 0;
    }
  }
  sim.apply({ type: 'research', project: key });
  expect(sim.research.current).toBe(key);
  const hours = (n: number) => {
    for (let k = 0; k < n; k++) {
      for (const c of sim.colonists) {
        c.needs.food = c.needs.rest = c.needs.joy = 1;
      }
      run(sim, HOUR);
    }
  };
  return { sim, w, x, y, hours, progress: () => sim.research.progress[key] ?? 0 };
}

describe('late research', () => {
  it('waits for its building, and holds just short of the end until the materials are in storage', () => {
    const { sim, w, x, y, hours, progress } = study('steelmaking');
    const cost = researchDef('steelmaking')!.cost;
    hours(4);
    expect(progress()).toBe(0);
    expect(sim.researchHold('steelmaking').building).toBe('smelter');
    w.setFeature(w.idx(x + 6, y + 6), featureId('smelter'));
    hours(4);
    expect(progress()).toBeGreaterThan(0);
    // Nearly there, with no iron: it stops one point short and nobody sits at the bench.
    sim.research.progress.steelmaking = cost - 50;
    hours(4);
    expect(progress()).toBe(cost - 1);
    expect(sim.isResearched('steelmaking')).toBe(false);
    expect(sim.researchHold('steelmaking').short).toEqual([{ item: itemId('iron'), count: 40 }]);
    // Iron in the stockpile: it finishes and uses it up.
    w.dropItemNear(w.idx(x - 3, y + 4), itemId('iron'), 50);
    hours(4);
    expect(sim.isResearched('steelmaking')).toBe(true);
    let iron = 0;
    for (const i of w.tilesWith('items')) {
      if (w.itemType[i] === itemId('iron')) {
        iron += w.itemCount[i];
      }
    }
    expect(iron).toBe(10);
  });

  it('pays off: steel tools, fitted injuries, bigger harvests', () => {
    const sim = Simulation.newColony(4);
    const c = sim.colonists[0];
    const speed = (type: string) => (sim as unknown as { workSpeed(c: unknown, t: string): number }).workSpeed(c, type);
    const mine = speed('mine');
    const build = speed('construct');
    sim.research.done.push('steelmaking');
    expect(speed('mine')).toBeCloseTo(mine * 1.25);
    expect(speed('construct')).toBeCloseTo(build);
    c.health.scars = [
      { kind: 'stiffHand', part: 'arm' },
      { kind: 'lostEye', part: 'head' },
    ] as typeof c.health.scars;
    expect(scarWork(c, true)).toBeGreaterThan(scarWork(c));
    expect(scarAim(c, true)).toBeCloseTo(scarAim(c) / 2);
  });

  it('glass lets a warm greenhouse, a field walled in as a room, grow through winter', () => {
    const grown = (glass: boolean) => {
      const sim = Simulation.newColony(5);
      const w = sim.world;
      const { x, y } = clearAround(sim, 10);
      if (glass) {
        sim.research.done.push('glassmaking');
      }
      const tile = w.idx(x + 3, y + 3);
      w.setFeature(tile, featureId('potatoPlant'));
      // Walled in as a room (crops can't go under a roof).
      for (const i of outline(w, x + 1, y + 1, x + 5, y + 5)) {
        w.setFeature(i, featureId('woodWall'));
      }
      expect(sim.isIndoors(tile)).toBe(true);
      // Midwinter day, and warm where the crop stands.
      sim.tick = (18 * 24 + 12) * HOUR;
      sim.syncClock();
      (sim as unknown as { temperatureAt(i: number): number }).temperatureAt = () => 18;
      for (let k = 0; k < 40; k++) {
        (sim as unknown as { growCrops(): void }).growCrops();
      }
      return w.growth[tile];
    };
    expect(grown(false)).toBe(0);
    expect(grown(true)).toBeGreaterThan(0);
  });
});
