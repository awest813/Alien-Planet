import { describe, expect, it } from 'vitest';
import { lineOfSight } from './combat';
import { TRAITS, featureId, itemId, terrainId } from './defs';
import { bleedingOf, damage, infect } from './health';
import { deserialize, serialize } from './serialize';
import { MAP_SIZES, Simulation } from './simulation';
import { compatibility, mutualOpinion, updateSocial } from './social';
import { triggerEvent } from './storyteller';
import { HOUR, run } from './test-helpers';
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
    for (let k = 0; k < 4; k++) {
      damage(untreated, victim, 0.35, 'cut');
    }
    expect(bleedingOf(victim)).toBeGreaterThan(0);
    run(untreated, HOUR * 12);
    expect(victim.health.dead).toBe(true);

    const treated = Simulation.newColony(31);
    for (let k = 0; k < 4; k++) {
      damage(treated, treated.colonists[0], 0.35, 'cut');
    }
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
  it('forms friendships within a week, driven by chemistry', () => {
    let friendships = 0;
    let goodChemistry = 0;
    let badChemistry = 0;
    for (const seed of [1, 2, 3]) {
      // A week of conversations between colonists who spend their days together.
      const sim = Simulation.newColony(seed);
      for (let update = 0; update < 7 * 16 * 10; update++) {
        updateSocial(sim);
      }
      const living = sim.living();
      for (const a of living) {
        for (const b of living.filter((o) => o.id > a.id)) {
          const opinion = mutualOpinion(a, b);
          friendships += opinion >= 30 ? 1 : 0;
          const chemistry = compatibility(sim, a, b);
          goodChemistry += chemistry > 0.4 ? opinion : 0;
          badChemistry += chemistry < -0.4 ? opinion : 0;
        }
      }
    }
    expect(friendships).toBeGreaterThan(0);
    expect(goodChemistry).toBeGreaterThan(badChemistry);
  });

  it('lets a wanderer join the colony', () => {
    const sim = Simulation.newColony(4);
    const landed = sim.colonists.length;
    expect(triggerEvent(sim, 'wanderer')).toBe(true);
    expect(sim.colonists).toHaveLength(landed + 1);
    const newcomer = sim.colonists[landed];
    expect(newcomer.id).toBe(landed);
    expect(Object.keys(newcomer.opinions)).toHaveLength(landed);
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

describe('audit regressions', () => {
  it('lets a light, untended wound stop bleeding so blood recovers', () => {
    const sim = Simulation.newColony(41);
    for (const c of sim.colonists) {
      c.priorities.doctor = 0;
    }
    const c = sim.colonists[0];
    damage(sim, c, 0.15, 'cut');
    run(sim, HOUR * 30);
    expect(bleedingOf(c)).toBe(0);
    expect(c.health.bloodLoss).toBeLessThan(0.05);
  });

  it('uses medicine even when the doctor was carrying something', () => {
    const sim = Simulation.newColony(42);
    const [patient, doctor] = sim.colonists;
    for (const c of sim.colonists) {
      c.priorities.doctor = c === doctor ? 1 : 0;
    }
    sim.world.dropItemNear(doctor.tile, itemId('herbalMedicine'), 3);
    doctor.carrying = { item: itemId('wood'), count: 5 };
    damage(sim, patient, 0.3, 'cut');
    const logs: string[] = [];
    const addLog = sim.addLog.bind(sim);
    sim.addLog = (text, tone, story) => {
      logs.push(text);
      addLog(text, tone, story);
    };
    run(sim, HOUR * 3);
    expect(logs.some((l) => l.includes(`${doctor.name} tended`) && l.includes('herbal medicine'))).toBe(true);
  });

  it('does not count a raid that downs everyone as repelled', () => {
    const sim = Simulation.newColony(43);
    run(sim, HOUR);
    triggerEvent(sim, 'raid');
    for (const c of sim.colonists) {
      // Enough to down even a tough colonist, not enough to kill anyone.
      for (let k = 0; k < 3; k++) {
        damage(sim, c, 0.5, 'bruise');
      }
      expect(c.health.downed).toBe(true);
    }
    for (let i = 0; i < 48 && sim.raid; i++) {
      run(sim, HOUR);
    }
    expect(sim.raid).toBeNull();
    expect(sim.stats.raidsRepelled).toBe(0);
  });

  it('never has a kind colonist insult anyone', () => {
    const sim = Simulation.newColony(44);
    const kind = sim.colonists[0];
    kind.traits = ['kind', 'optimist'];
    const logs: string[] = [];
    const addLog = sim.addLog.bind(sim);
    sim.addLog = (text, tone, story) => {
      logs.push(text);
      addLog(text, tone, story);
    };
    for (let i = 0; i < 3000; i++) {
      updateSocial(sim);
    }
    expect(logs.filter((l) => l.startsWith(`${kind.name} insulted`))).toHaveLength(0);
  });

  it('stops newcomers joining once the colony fills its map', () => {
    for (const size of MAP_SIZES) {
      const sim = Simulation.newColony(5, 'standard', size.size);
      expect(sim.colonists).toHaveLength(size.colonists);
      for (let n = 0; n < 20; n++) {
        triggerEvent(sim, 'wanderer');
      }
      expect(sim.living()).toHaveLength(size.maxColonists);
    }
  });

  it('sizes raids to the colony: fewer raiders for a small one', () => {
    const raiders = (colonists: number) => {
      const sim = Simulation.newColony(6, 'standard', 128);
      // Everyone past the first few is away (dead, for the count).
      sim.colonists.slice(colonists).forEach((c) => (c.health.dead = true));
      sim.tick = HOUR * 24 * 16;
      triggerEvent(sim, 'raid');
      return sim.enemies.length;
    };
    expect(raiders(3)).toBeLessThan(raiders(5));
    expect(raiders(2)).toBeGreaterThanOrEqual(2);
  });

  it('sends no raids on peaceful difficulty', () => {
    const sim = Simulation.newColony(45, 'peaceful');
    run(sim, HOUR * 24 * 12);
    expect(sim.storyLog.some((s) => s.text.startsWith('Raid!'))).toBe(false);
  });
});
