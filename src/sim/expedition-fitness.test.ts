import { describe, expect, it } from 'vitest';
import { cannotGo } from './expeditions';
import { bleedingOf, damage, needsBedRest, tend } from './health';
import { Simulation } from './simulation';
import { clearAround } from './test-helpers';

// Who is well enough to go on an expedition (found by the sixth audit).

describe('who can go on an expedition', () => {
  it('a tended scratch that no longer bleeds does not keep someone home', () => {
    const sim = Simulation.newColony(1);
    clearAround(sim, 8);
    const [doctor, c] = sim.colonists;
    damage(sim, c, 0.05, 'cut');
    tend(sim, doctor, c, true);
    // Tended: not bleeding, not downed, no bed rest needed.
    expect(bleedingOf(c)).toBe(0);
    expect(c.health.downed).toBe(false);
    expect(needsBedRest(c)).toBe(false);
    // ...yet the expedition screen says they're "not well enough" until the scratch has fully healed.
    expect(cannotGo(sim, c)).toBeNull();
  });
});
