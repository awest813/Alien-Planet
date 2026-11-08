import { describe, expect, it } from 'vitest';
import { hurtAnimal } from './animals';
import { beastWeight } from './beast';
import { infect, spreadDisease } from './health';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';

const later = (sim: Simulation, day: number) => {
  sim.tick = (day - 1) * 24 * 200;
  sim.syncClock();
};

describe('the great beast', () => {
  it('sleeps through the first year, then wakes once a year, named and bigger each time', () => {
    const sim = Simulation.newColony(1);
    expect(beastWeight(sim)).toBe(0);
    later(sim, 37);
    expect(beastWeight(sim)).toBeGreaterThan(0);
    expect(triggerEvent(sim, 'greatBeast')).toBe(true);
    const beast = sim.animals.find((a) => a.kind === 'greatBeast')!;
    expect(beast.name).toBeTruthy();
    expect(beast.manhunter).toBe(true);
    // Not again this year.
    sim.animals = sim.animals.filter((a) => a !== beast);
    expect(beastWeight(sim)).toBe(0);
    // Next year it's back, tougher.
    later(sim, 55);
    expect(triggerEvent(sim, 'greatBeast')).toBe(true);
    const again = sim.animals.find((a) => a.kind === 'greatBeast')!;
    expect(again.name).toBe(beast.name);
    expect(again.hp).toBeGreaterThan(beast.hp);
    expect(sim.chronicle.some((e) => e.kind === 'threat')).toBe(true);
    // Saved with the colony.
    const loaded = deserialize(structuredClone(serialize(sim)));
    expect(loaded.story.beast).toEqual(sim.story.beast);
  });

  it('brought down, is gone for good, and the colony takes heart', () => {
    const sim = Simulation.newColony(2);
    later(sim, 37);
    triggerEvent(sim, 'greatBeast');
    const beast = sim.animals.find((a) => a.kind === 'greatBeast')!;
    hurtAnimal(sim, beast, 1000, sim.colonists[0]);
    expect(sim.story.beast!.slain).toBe(true);
    expect(sim.thoughtsOf(sim.colonists[1]).map((t) => t.label)).toContain('We slew the great beast');
    later(sim, 80);
    expect(beastWeight(sim)).toBe(0);
  });

  it('never comes on peaceful', () => {
    const sim = Simulation.newColony(3, 'peaceful');
    later(sim, 40);
    expect(beastWeight(sim)).toBe(0);
  });
});

describe('the winter cough', () => {
  it('spreads to whoever is close to the sick', () => {
    const sim = Simulation.newColony(4);
    const [sick, near] = sim.colonists;
    near.tile = sick.tile + 1;
    infect(sim, sick, 'winterCough');
    for (let h = 0; h < 200 && !near.health.disease; h++) {
      spreadDisease(sim);
    }
    expect(near.health.disease?.key).toBe('winterCough');
  });
});
