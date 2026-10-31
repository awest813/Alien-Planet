import { describe, expect, it } from 'vitest';
import { lineOfSight } from './combat';
import { TRAITS, featureId, itemId, terrainId } from './defs';
import { bleedingOf, damage, infect } from './health';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { mutualOpinion } from './social';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround, run } from './test-helpers';
import { World } from './world';

describe('traits', () => {
  it('gives every colonist two compatible traits', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const c of Simulation.newColony(seed).colonists) {
        expect(c.traits).toHaveLength(2);
        const [a, b] = c.traits;
        expect(a).not.toBe(b);
        expect(TRAITS[a].excludes).not.toBe(b);
        expect(TRAITS[b].excludes).not.toBe(a);
      }
    }
  });
});

describe('combat', () => {
  it('blocks line of sight with walls but not with open ground', () => {
    const w = new World(10, 10);
    w.terrain.fill(terrainId('grass'));
    expect(lineOfSight(w, w.idx(0, 5), w.idx(9, 5))).toBe(true);
    w.feature[w.idx(5, 5)] = featureId('stoneWall');
    expect(lineOfSight(w, w.idx(0, 5), w.idx(9, 5))).toBe(false);
  });

  it('lets drafted colonists drive off a raid', () => {
    const sim = Simulation.newColony(77);
    run(sim, HOUR * 10);
    expect(triggerEvent(sim, 'raid')).toBe(true);
    expect(sim.enemies.length).toBeGreaterThan(0);
    for (const c of sim.colonists) {
      sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    }
    for (let i = 0; i < 24 && sim.raid; i++) {
      for (const c of sim.living()) {
        if (c.drafted && sim.enemies[0]) {
          sim.apply({ type: 'move', colonist: c.id, tile: sim.enemies[0].tile });
        }
      }
      run(sim, HOUR / 2);
    }
    expect(sim.raid).toBeNull();
    expect(sim.stats.raidsRepelled).toBe(1);
    expect(sim.living().length).toBe(sim.colonists.length);
    // Everyone stands down when it's over.
    expect(sim.colonists.every((c) => !c.drafted)).toBe(true);
  });

  it('saves and restores a raid in progress', () => {
    const sim = Simulation.newColony(5);
    run(sim, HOUR * 3);
    triggerEvent(sim, 'raid');
    run(sim, HOUR / 2);
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.enemies).toEqual(sim.enemies);
    expect(copy.raid).toEqual(sim.raid);
    run(copy, HOUR);
  });
});

describe('health', () => {
  it('bleeds out without a doctor, but tending stops the bleeding', () => {
    const untreated = Simulation.newColony(31);
    const victim = untreated.colonists[0];
    for (const c of untreated.colonists) {
      c.priorities.doctor = 0;
    }
    damage(untreated, victim, 0.5, 'cut');
    expect(bleedingOf(victim)).toBeGreaterThan(0);
    run(untreated, HOUR * 12);
    expect(victim.health.dead).toBe(true);

    const treated = Simulation.newColony(31);
    damage(treated, treated.colonists[0], 0.5, 'cut');
    run(treated, HOUR * 3);
    expect(treated.stats.tended).toBeGreaterThan(0);
    expect(bleedingOf(treated.colonists[0])).toBe(0);
    run(treated, HOUR * 12);
    expect(treated.colonists[0].health.dead).toBe(false);
  });

  it('gets a doctor out of bed for a colonist who collapses at night', () => {
    const sim = Simulation.newColony(7);
    run(sim, HOUR * 16); // 23:00, everyone asleep
    expect(sim.colonists.every((c) => c.sleeping)).toBe(true);
    const patient = sim.colonists[0];
    damage(sim, patient, 0.45, 'cut');
    damage(sim, patient, 0.45, 'cut');
    expect(patient.health.downed).toBe(true);
    run(sim, HOUR * 2);
    expect(patient.health.injuries.every((i) => i.tended > 0)).toBe(true);
  });

  it('lets a tended, resting colonist beat marsh fever', () => {
    const sim = Simulation.newColony(12);
    sim.world.dropItemNear(sim.colonists[0].tile, itemId('herbalMedicine'), 10);
    const c = sim.colonists[0];
    infect(sim, c, 'marshFever');
    run(sim, HOUR * 40);
    expect(c.health.dead).toBe(false);
    expect(c.health.disease).toBeNull();
  });
});

describe('relationships and events', () => {
  it('warms colonists to each other, forming friendships within a week', () => {
    const pairs = (sim: Simulation) =>
      sim.living().flatMap((a) =>
        sim
          .living()
          .filter((b) => b.id > a.id)
          .map((b) => mutualOpinion(a, b)),
      );
    const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
    let friendships = 0;
    for (const seed of [1, 2, 3]) {
      const sim = Simulation.newColony(seed);
      clearAround(sim, 6);
      const before = average(pairs(sim));
      run(sim, HOUR * 24 * 6);
      expect(average(pairs(sim))).toBeGreaterThan(before);
      friendships += pairs(sim).filter((opinion) => opinion >= 30).length;
    }
    expect(friendships).toBeGreaterThan(0);
  });

  it('lets a wanderer join the colony', () => {
    const sim = Simulation.newColony(4);
    expect(triggerEvent(sim, 'wanderer')).toBe(true);
    expect(sim.colonists).toHaveLength(6);
    const newcomer = sim.colonists[5];
    expect(newcomer.id).toBe(5);
    expect(Object.keys(newcomer.opinions)).toHaveLength(5);
    run(sim, HOUR * 4);
    expect(newcomer.health.dead).toBe(false);
  });

  it('records major events in the story log', () => {
    const sim = Simulation.newColony(9);
    triggerEvent(sim, 'coldSnap');
    expect(sim.outdoorTemperature()).toBeLessThan(Simulation.newColony(9).outdoorTemperature());
    expect(sim.storyLog.some((s) => s.text.includes('cold snap'))).toBe(true);
  });
});
