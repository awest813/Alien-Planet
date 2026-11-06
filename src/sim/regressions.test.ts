import { describe, expect, it } from 'vitest';
import { ANIMALS, featureId, itemId } from './defs';
import { damage } from './health';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround, run } from './test-helpers';
import { applyTrade, colonyStock, tradeOpen } from './trade';
import { Animal } from './types';
import { ignite, updateFires } from './weather';

// Bugs found in an audit, each pinned down so it stays fixed.
describe('regressions', () => {
  it('a doctor carrying a stack of medicine uses one dose per tend', () => {
    const sim = Simulation.newColony(42);
    const [patient, doctor] = sim.colonists;
    for (const c of sim.colonists) {
      c.priorities.doctor = c === doctor ? 1 : 0;
    }
    const medicine = itemId('herbalMedicine');
    doctor.carrying = { item: medicine, count: 5 };
    // Busy with something else (on the way to store it, say) when the patient gets hurt.
    const internals = sim as unknown as {
      assign(c: unknown, job: unknown, path: number[]): void;
      makeJob(type: string, target: number, extra: object): unknown;
    };
    internals.assign(doctor, internals.makeJob('wander', doctor.tile, { wait: 9999 }), []);
    damage(sim, patient, 0.3, 'cut');
    const tended = sim.stats.tended;
    for (let t = 0; t < HOUR * 3 && sim.stats.tended === tended; t++) {
      sim.step();
    }
    expect(sim.stats.tended).toBeGreaterThan(tended);
    expect(sim.stockOf(medicine)).toBe(4);
  });

  it('sleepers woken by a fire keep fighting it instead of going back to bed', () => {
    const sim = Simulation.newColony(7);
    run(sim, HOUR * 16);
    const w = sim.world;
    const c0 = sim.colonists[0];
    let target = -1;
    for (let d = 3; d < 8 && target < 0; d++) {
      const t = c0.tile + d;
      if (w.isPassable(t) && w.feature[t] === 0) {
        target = t;
      }
    }
    expect(target).toBeGreaterThanOrEqual(0);
    sim.weather = { ...sim.weather, kind: 'clear', until: 1e9 };
    w.setFeature(target, featureId('tree'));
    expect(ignite(sim, target)).toBe(true);
    let firefighting = 0;
    for (let t = 0; t < HOUR && sim.burning.size > 0; t++) {
      sim.step();
      firefighting = Math.max(firefighting, sim.colonists.filter((c) => c.job?.type === 'extinguish').length);
    }
    expect(firefighting).toBeGreaterThan(0);
    expect(sim.burning.size).toBe(0);
  });

  it('spreads a fire the same way after a save and load', () => {
    const sim = Simulation.newColony(5);
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    sim.weather = { ...sim.weather, kind: 'clear', until: 1e9 };
    for (let dy = 6; dy <= 12; dy++) {
      for (let dx = 6; dx <= 12; dx++) {
        w.setFeature(w.idx(x + dx, y + dy), featureId('tree'));
      }
    }
    // Lit out of tile order, so the set's insertion order differs from a rebuilt one.
    for (const [dx, dy] of [
      [12, 12],
      [6, 6],
      [12, 6],
      [6, 12],
    ]) {
      ignite(sim, w.idx(x + dx, y + dy));
    }
    const copy = deserialize(serialize(sim));
    for (let k = 0; k < 30; k++) {
      updateFires(sim, 0.1);
      updateFires(copy, 0.1);
    }
    expect([...copy.burning].sort((a, b) => a - b)).toEqual([...sim.burning].sort((a, b) => a - b));
  });

  it('a predator gives up on prey that has been tamed', () => {
    const sim = Simulation.newColony(13);
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    sim.animals = [];
    const animal = (kind: string, tile: number, extra: Partial<Animal> = {}): Animal => {
      const a: Animal = {
        id: sim.nextAnimalId++,
        kind,
        tile,
        path: [],
        moveProgress: 0,
        hp: ANIMALS[kind].hp,
        hunted: false,
        taming: false,
        tame: false,
        revengeOn: -1,
        cooldown: 0,
        restUntil: 0,
        revengeUntil: 0,
        ...extra,
      };
      sim.animals.push(a);
      return a;
    };
    const deer = animal('deer', w.idx(x + 6, y), { tame: true });
    const wolf = animal('wolf', w.idx(x + 2, y), { chasing: deer.id });
    run(sim, 600);
    expect(deer.hp).toBeGreaterThan(0);
    expect(wolf.chasing).toBeUndefined();
  });

  it('counts the same item listed twice in a deal against the stock only once', () => {
    const sim = Simulation.newColony(2);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y + 4, x1: x + 4, y1: y + 7 }, zone: 1 });
    const silver = itemId('silver');
    const cloth = itemId('cloth');
    w.addItem(w.idx(x - 4, y + 4), silver, 300);
    w.addItem(w.idx(x - 3, y + 4), cloth, 12);
    expect(triggerEvent(sim, 'caravan')).toBe(true);
    for (let t = 0; t < HOUR * 6 && !tradeOpen(sim); t++) {
      sim.step();
    }
    const silverBefore = colonyStock(sim, silver);
    expect(
      applyTrade(
        sim,
        [],
        [
          [cloth, 12],
          [cloth, 12],
        ],
      ),
    ).not.toBeNull();
    expect(colonyStock(sim, cloth)).toBe(12);
    expect(colonyStock(sim, silver)).toBe(silverBefore);
  });
});
