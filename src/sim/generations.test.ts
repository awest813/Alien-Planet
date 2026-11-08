import { describe, expect, it } from 'vitest';
import { OBJECTIVES, PHASE_NAMES, Simulation } from './simulation';

const goal = (id: string) => OBJECTIVES.find((o) => o.id === id)!;

describe('the Generations goals', () => {
  it('come last, from the colony’s own story', () => {
    expect(PHASE_NAMES.at(-1)).toBe('Generations');
    const ids = OBJECTIVES.filter((o) => o.phase === 7).map((o) => o.id);
    expect(ids).toEqual([
      'grownUp',
      'thirdGeneration',
      'elder',
      'siegeSeenOff',
      'beastSlain',
      'allies',
      'cavern',
      'decade',
    ]);
  });

  it('see children grow up, and their children born', () => {
    const sim = Simulation.newColony(5);
    const [a, b, c] = sim.colonists;
    expect(goal('grownUp').check(sim)).toBe(false);
    b.parents = [a.id];
    b.age = 17;
    expect(goal('grownUp').check(sim)).toBe(false);
    b.age = 18;
    expect(goal('grownUp').check(sim)).toBe(true);
    expect(goal('thirdGeneration').check(sim)).toBe(false);
    c.parents = [b.id];
    expect(goal('thirdGeneration').check(sim)).toBe(true);
  });

  it('count a grandchild from birth, while still a baby', () => {
    const sim = Simulation.newColony(8);
    const [a, b] = sim.colonists;
    b.parents = [a.id];
    expect(goal('thirdGeneration').check(sim)).toBe(false);
    sim.infants.push({ id: 99, name: 'Wren', age: 0, parents: [b.id], carer: b.id });
    expect(goal('thirdGeneration').check(sim)).toBe(true);
  });

  it('count a decade, and leave the fighting goals out on peaceful', () => {
    const sim = Simulation.newColony(6, 'peaceful');
    expect(goal('decade').check(sim)).toBe(false);
    // Not a day short of it.
    sim.tick = (24 * 10 - 1) * 24 * 200;
    sim.syncClock();
    expect(goal('decade').check(sim)).toBe(false);
    expect(goal('decade').progress!(sim)).toBe('9/10 years');
    sim.tick = 24 * 10 * 24 * 200;
    sim.syncClock();
    expect(goal('decade').check(sim)).toBe(true);
    for (const id of ['siegeSeenOff', 'beastSlain', 'allies', 'cavern']) {
      expect(goal(id).hidden!(sim)).toBe(true);
    }
  });
});
