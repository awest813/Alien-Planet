import { describe, expect, it } from 'vitest';
import { animalsAtDawn } from './animals';
import { itemId } from './defs';
import { OBJECTIVES, Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround, run } from './test-helpers';
import { Animal } from './types';

function withAnimal(seed: number, kind: string, dx = 3): { sim: Simulation; animal: Animal } {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 10);
  // Reuse a wild animal as the test subject, moved next to the colony.
  const animal = sim.animals[0];
  animal.kind = kind;
  animal.tile = w.idx(x + dx, y);
  animal.path = [];
  return { sim, animal };
}

describe('taming', () => {
  it('lets a skilled handler tame a marked animal', () => {
    const { sim, animal } = withAnimal(1, 'deer');
    for (const c of sim.colonists) {
      c.skills.animals = 15;
      c.priorities.handling = 1;
      c.needs.food = 1;
    }
    const w = sim.world;
    sim.apply({
      type: 'tame',
      rect: { x0: w.xOf(animal.tile), y0: w.yOf(animal.tile), x1: w.xOf(animal.tile), y1: w.yOf(animal.tile) },
      add: true,
    });
    expect(animal.taming).toBe(true);
    for (let hour = 0; hour < 8 && !animal.tame; hour++) {
      run(sim, HOUR);
    }
    expect(animal.tame).toBe(true);
    expect(sim.stats.tamed).toBe(1);
  });

  it('keeps tame animals near the colony instead of fleeing', () => {
    const { sim, animal } = withAnimal(2, 'deer', 2);
    animal.tame = true;
    run(sim, HOUR * 6);
    expect(sim.world.distance(animal.tile, sim.colonists[0].tile)).toBeLessThan(20);
  });
});

describe('herds', () => {
  it('breed in pairs and give milk', () => {
    const { sim, animal } = withAnimal(3, 'deer');
    const mate = sim.animals[1];
    mate.kind = 'deer';
    mate.tile = animal.tile;
    animal.tame = mate.tame = true;
    const before = sim.animals.filter((a) => a.tame).length;
    for (let day = 0; day < 12; day++) {
      animalsAtDawn(sim);
    }
    expect(sim.animals.filter((a) => a.tame).length).toBeGreaterThan(before);
    expect(sim.stockOf(itemId('milk'))).toBeGreaterThan(0);
  });

  it('includes tame boars that bite raiders who come close', () => {
    const { sim, animal } = withAnimal(4, 'boar');
    animal.tame = true;
    expect(triggerEvent(sim, 'raid')).toBe(true);
    const raider = sim.enemies[0];
    const before = raider.hp;
    raider.tile = sim.world.neighbors(animal.tile).find((n) => sim.world.isPassable(n))!;
    raider.path = [];
    run(sim, 120);
    expect(raider.hp).toBeLessThan(before);
  });
});

describe('marks on an animal', () => {
  it('are one or the other: a hunt mark comes off when taming is ordered, and once tamed', () => {
    const sim = Simulation.newColony(3);
    const w = sim.world;
    const a = sim.animals.find((o) => !o.tame && !o.quarry && o.kind !== 'greatBeast')!;
    const rect = { x0: w.xOf(a.tile), y0: w.yOf(a.tile), x1: w.xOf(a.tile), y1: w.yOf(a.tile) };
    sim.apply({ type: 'hunt', rect, add: true });
    expect(a.hunted).toBe(true);
    sim.apply({ type: 'tame', rect, add: true });
    expect(a.taming).toBe(true);
    expect(a.hunted).toBe(false);
    sim.apply({ type: 'hunt', rect, add: true });
    expect(a.hunted).toBe(true);
    expect(a.taming).toBe(false);
  });
});

describe('the Prosperity goals on Peaceful', () => {
  it("don't ask for a raider prisoner, since no raiders come", () => {
    const peaceful = Simulation.newColony(3, 'peaceful');
    const standard = Simulation.newColony(3);
    const recruit = OBJECTIVES.find((o) => o.id === 'recruit')!;
    expect(recruit.hidden?.(peaceful)).toBe(true);
    expect(recruit.hidden?.(standard) ?? false).toBe(false);
  });
});
