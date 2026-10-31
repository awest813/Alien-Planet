import { describe, expect, it } from 'vitest';
import { hurtAnimal } from './animals';
import { coverFactor } from './combat';
import { featureId, itemId, terrainId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { learn, rustSkills, xpToNext } from './skills';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { World } from './world';

describe('skills', () => {
  it('levels up with practice, faster with a passion', () => {
    const sim = Simulation.newColony(1);
    const [plain, keen] = sim.colonists;
    plain.skills.mining = 3;
    keen.skills.mining = 3;
    plain.passions.mining = 0;
    keen.passions.mining = 2;
    for (let i = 0; i < 2000; i++) {
      learn(sim, plain, 'mining');
      learn(sim, keen, 'mining');
    }
    expect(plain.skills.mining).toBeGreaterThan(3);
    expect(keen.skills.mining).toBeGreaterThan(plain.skills.mining);
  });

  it('rusts only unpractised expert skills, never losing a level', () => {
    const sim = Simulation.newColony(2);
    const c = sim.colonists[0];
    c.skills.crafting = 12;
    c.skills.mining = 12;
    c.skillXp.crafting = xpToNext(12) * 0.05;
    c.skillXp.mining = xpToNext(12) * 0.05;
    sim.tick = HOUR * 48;
    learn(sim, c, 'mining', 0);
    rustSkills(c, sim.tick);
    expect(c.skills.crafting).toBe(12);
    expect(c.skillXp.crafting).toBe(0);
    expect(c.skillXp.mining).toBeCloseTo(xpToNext(12) * 0.05);
  });
});

describe('defences', () => {
  it('gives cover only from the side the sandbags face', () => {
    const w = new World(10, 10);
    w.terrain.fill(terrainId('grass'));
    w.feature[w.idx(5, 4)] = featureId('sandbags');
    const target = w.idx(5, 5);
    expect(coverFactor(w, w.idx(5, 0), target)).toBeLessThan(1);
    expect(coverFactor(w, w.idx(8, 1), target)).toBeLessThan(1);
    expect(coverFactor(w, w.idx(5, 9), target)).toBe(1);
    // A shot from almost due east passes the east side, not the sandbags to the north.
    expect(coverFactor(w, w.idx(9, 4), target)).toBe(1);
  });

  it('trains the Animals skill like any other', () => {
    const sim = Simulation.newColony(13);
    const c = sim.colonists[0];
    const before = c.skills.animals;
    learn(sim, c, 'animals', 1e5);
    expect(Number.isFinite(c.skillXp.animals)).toBe(true);
    expect(c.skills.animals).toBeGreaterThan(before);
  });

  it('has a colonist trade up to a clearly better-made bow', () => {
    const sim = Simulation.newColony(12);
    for (const c of sim.colonists) {
      c.weapon = 'recurveBow';
      c.weaponQuality = 5;
    }
    sim.world.dropItemNear(sim.colonists[0].tile, itemId('recurveBow'), 1, undefined, 15);
    run(sim, 400);
    expect(sim.colonists.filter((c) => c.weaponQuality === 15)).toHaveLength(1);
    // The old bow is left for someone else, and nobody swaps for one no better than their own.
    expect(sim.stockOf(itemId('recurveBow'))).toBe(1);
    expect(sim.colonists.filter((c) => c.weaponQuality === 5)).toHaveLength(sim.colonists.length - 1);
  });

  it('has colonists pick up a recurve bow from storage', () => {
    const sim = Simulation.newColony(3);
    sim.world.dropItemNear(sim.colonists[0].tile, itemId('recurveBow'), 2);
    run(sim, HOUR * 2);
    expect(sim.colonists.filter((c) => c.weapon === 'recurveBow')).toHaveLength(2);
    expect(sim.stockOf(itemId('recurveBow'))).toBe(0);
  });
});

describe('animals and hunting', () => {
  it('starts with wildlife and hunts marked animals for meat and leather', () => {
    const sim = Simulation.newColony(4);
    expect(sim.animals.length).toBeGreaterThan(5);
    sim.apply({ type: 'hunt', rect: { x0: 0, y0: 0, x1: 63, y1: 63 }, add: true });
    run(sim, HOUR * 12);
    expect(sim.stats.hunted).toBeGreaterThan(0);
    expect(sim.stockOf(itemId('leather'))).toBeGreaterThan(0);
  });

  it('can have a hurt boar turn on its attacker, who fights back', () => {
    let turned = false;
    for (let seed = 1; seed <= 10 && !turned; seed++) {
      const sim = Simulation.newColony(seed);
      const hunter = sim.colonists[0];
      const boar = sim.animals.find((a) => a.kind === 'boar');
      if (!boar) {
        continue;
      }
      hurtAnimal(sim, boar, 0.1, hunter);
      if (boar.revengeOn === hunter.id) {
        turned = true;
        run(sim, HOUR * 6);
        // The fight resolves: the boar dies, or it stops once its target is down.
        expect(!sim.animals.includes(boar) || boar.revengeOn === -1 || hunter.health.downed).toBe(true);
      }
    }
    expect(turned).toBe(true);
  });

  it('saves and restores animals, skills and weapons', () => {
    const sim = Simulation.newColony(6);
    sim.colonists[0].weapon = 'recurveBow';
    sim.colonists[1].skillXp.plants = 123;
    sim.animals[0].hunted = true;
    run(sim, HOUR);
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.animals).toEqual(sim.animals);
    expect(copy.colonists[0].weapon).toBe('recurveBow');
    expect(copy.colonists[1].skillXp).toEqual(sim.colonists[1].skillXp);
    expect(copy.colonists[1].passions).toEqual(sim.colonists[1].passions);
  });
});

describe('review regressions', () => {
  it('pushes an animal aside when a wall is finished on its tile', () => {
    const sim = Simulation.newColony(7);
    // Boars don't run from people, so it stays put while the wall goes up around it.
    const a = sim.animals.find((x) => x.kind === 'boar') ?? sim.animals[0];
    const w = sim.world;
    // Put it on plain ground near the colony, where a wall can go.
    const { x, y } = clearAround(sim, 6);
    a.kind = 'boar';
    a.tile = w.idx(x + 3, y);
    a.restUntil = Number.MAX_SAFE_INTEGER;
    a.path = [];
    const tile = a.tile;
    w.dropItemNear(sim.colonists[0].tile, itemId('wood'), 50);
    sim.apply({ type: 'build', feature: featureId('woodWall'), tiles: [tile] });
    for (let i = 0; i < HOUR * 8 && w.feature[tile] !== featureId('woodWall'); i++) {
      a.restUntil = Number.MAX_SAFE_INTEGER;
      sim.step();
    }
    expect(w.feature[tile]).toBe(featureId('woodWall'));
    expect(w.isPassable(a.tile)).toBe(true);
  });

  it('calms an enraged animal that cannot reach its target', () => {
    const sim = Simulation.newColony(8);
    const boar = sim.animals.find((x) => x.kind === 'boar') ?? sim.animals[0];
    const target = sim.colonists[0];
    // Wall the target in so the boar can't get at them.
    const w = sim.world;
    const { x, y } = clearAround(sim, 6);
    target.tile = w.idx(x, y);
    for (const t of outline(w, x - 1, y - 1, x + 1, y + 1)) {
      w.setFeature(t, featureId('stoneWall'));
    }
    boar.tile = w.idx(x + 5, y);
    boar.path = [];
    boar.revengeOn = target.id;
    boar.revengeUntil = sim.tick + HOUR * 2;
    run(sim, HOUR * 3);
    expect(boar.revengeOn).toBe(-1);
  });
});
