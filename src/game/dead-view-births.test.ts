import { describe, expect, it } from 'vitest';
import { die } from '../sim/health';
import { updateLifespans } from '../sim/lifespans';
import { controller } from './controller';

// The dead colonist's entry is cached until the colony's makeup changes (simVersion, colonists.length, headcount).
// A baby is an infant, not a colonist: a birth changes neither count.
describe('a dead colonist whose child is born after their death', () => {
  it("names the baby among the dead parent's children", () => {
    controller.newColony('dead-view-births');
    const sim = controller.sim;
    const [a, b] = sim.colonists;
    a.age = 26;
    b.age = 28;
    a.spouse = b.id;
    b.spouse = a.id;
    a.expectingUntil = sim.tick + 10;
    a.expectingWith = b.id;
    die(sim, b, 'a test');
    controller.publish();
    const before = controller.getState().colonists.find((c) => c.id === b.id)!;
    expect(before.dead).toBe(true);
    expect(before.family.join('; ')).not.toMatch(/Parent of/);
    // The baby is born (to a and the late b).
    sim.tick = a.expectingUntil;
    updateLifespans(sim);
    expect(sim.infants).toHaveLength(1);
    expect(sim.infants[0].parents).toContain(b.id);
    controller.publish();
    const mother = controller.getState().colonists.find((c) => c.id === a.id)!;
    expect(mother.family.join('; ')).toMatch(/Parent of baby/);
    const father = controller.getState().colonists.find((c) => c.id === b.id)!;
    expect(father.family.join('; ')).toMatch(/Parent of baby/);
  });
});
