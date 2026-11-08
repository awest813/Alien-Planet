import { describe, expect, it } from 'vitest';
import { RESEARCH } from './defs';
import { healed } from './body';
import { Simulation } from './simulation';
import { Injury } from './types';

// The later research: each project does something, and the tree holds together.
describe('later research', () => {
  it('every project requires only projects that exist, and none requires itself', () => {
    const keys = new Set(RESEARCH.map((r) => r.key));
    for (const r of RESEARCH) {
      for (const need of r.requires ?? []) {
        expect(keys.has(need)).toBe(true);
        expect(need).not.toBe(r.key);
      }
    }
    expect(RESEARCH.length).toBeGreaterThanOrEqual(35);
  });

  it('surgery halves the lasting marks bad wounds leave', () => {
    const marks = (surgery: boolean) => {
      const sim = Simulation.newColony(1);
      if (surgery) {
        sim.research.done.push('surgery');
      }
      const c = sim.colonists[0];
      for (let k = 0; k < 600; k++) {
        healed(sim, c, { label: 'Cut', severity: 0.6, bleeding: 0, tended: 0, part: 'leg', peak: 0.6 } as Injury);
      }
      return c.health.scars?.length ?? 0;
    };
    expect(marks(true)).toBeLessThan(marks(false) * 0.7);
  });
});
