import { describe, expect, it } from 'vitest';
import { hurtAnimal } from './animals';
import { beastWeight, updateGreatBeast } from './beast';
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

  it("can't be tamed, and once its fury is spent it goes (saying so once) and can come back", () => {
    const sim = Simulation.newColony(5);
    later(sim, 37);
    triggerEvent(sim, 'greatBeast');
    const beast = sim.animals.find((a) => a.kind === 'greatBeast')!;
    const x = sim.world.xOf(beast.tile);
    const y = sim.world.yOf(beast.tile);
    sim.apply({ type: 'tame', add: true, rect: { x0: x, y0: y, x1: x, y1: y } });
    expect(beast.taming).toBeFalsy();
    // Calm, hemmed in and marked for hunting: it still goes once its fury is spent.
    beast.manhunter = false;
    beast.revengeOn = -1;
    beast.hunted = true;
    updateGreatBeast(sim);
    expect(beast.hp).toBeGreaterThan(0);
    sim.tick = beast.revengeUntil + 1;
    updateGreatBeast(sim);
    updateGreatBeast(sim);
    expect(beast.hp).toBe(0);
    expect(sim.storyLog.filter((e) => e.text.includes('gone back into the hills'))).toHaveLength(1);
    sim.animals = sim.animals.filter((a) => a.hp > 0);
    later(sim, 55);
    expect(beastWeight(sim)).toBeGreaterThan(0);
  });

  it('never comes on peaceful', () => {
    const sim = Simulation.newColony(3, 'peaceful');
    later(sim, 40);
    expect(beastWeight(sim)).toBe(0);
  });
});

describe('the winter cough', () => {
  it('spreads to whoever is close to the sick in autumn and winter', () => {
    const sim = Simulation.newColony(4);
    later(sim, 18);
    const [sick, near] = sim.colonists;
    near.tile = sick.tile + 1;
    infect(sim, sick, 'winterCough');
    for (let h = 0; h < 200 && !near.health.disease; h++) {
      spreadDisease(sim);
    }
    expect(near.health.disease?.key).toBe('winterCough');
  });

  it("doesn't spread in summer, and the recovered can't catch it again for a while", () => {
    const sim = Simulation.newColony(6);
    later(sim, 6);
    const [sick, near] = sim.colonists;
    near.tile = sick.tile + 1;
    infect(sim, sick, 'winterCough');
    for (let h = 0; h < 200; h++) {
      spreadDisease(sim);
    }
    expect(near.health.disease).toBeNull();
    near.health.recovered = { key: 'winterCough', until: sim.tick + 1000 };
    infect(sim, near, 'winterCough');
    expect(near.health.disease).toBeNull();
    sim.tick += 1001;
    infect(sim, near, 'winterCough');
    expect(near.health.disease?.key).toBe('winterCough');
  });
});
