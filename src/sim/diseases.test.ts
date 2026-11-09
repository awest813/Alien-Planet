import { describe, expect, it } from 'vitest';
import { infect, spreadDisease, tend, updateHealth } from './health';
import { ELDER } from './lifespans';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';

const later = (sim: Simulation, day: number) => {
  sim.tick = (day - 1) * 24 * 200;
  sim.syncClock();
};

describe('more diseases', () => {
  it('the shaking sickness passes by touch, not across a room', () => {
    const sim = Simulation.newColony(4);
    const w = sim.world;
    const [sick, beside, across] = sim.colonists;
    beside.tile = w.idx(w.xOf(sick.tile) + 1, w.yOf(sick.tile) + 1);
    across.tile = w.idx(w.xOf(sick.tile) + 2, w.yOf(sick.tile));
    infect(sim, sick, 'shakingSickness');
    for (let h = 0; h < 200 && !beside.health.disease; h++) {
      spreadDisease(sim);
    }
    expect(beside.health.disease?.key).toBe('shakingSickness');
    expect(across.health.disease).toBeNull();
  });

  it('the grey flu starts with one colonist, with a warning that it can kill', () => {
    const sim = Simulation.newColony(5);
    later(sim, 30);
    expect(triggerEvent(sim, 'greyFlu')).toBe(true);
    expect(sim.living().some((c) => c.health.disease?.key === 'greyFlu')).toBe(true);
    expect(sim.log.at(-1)!.text).toMatch(/has the grey flu\. It's catching and can kill/);
  });

  it('weighs on the old: worse faster, and thrown off more slowly', () => {
    const course = (age: number) => {
      const sim = Simulation.newColony(6);
      const c = sim.colonists[0];
      c.age = age;
      infect(sim, c, 'marshFever');
      updateHealth(sim, c, 10);
      return { severity: c.health.disease!.severity, immunity: c.health.disease!.immunity };
    };
    const young = course(30);
    const old = course(ELDER + 10);
    expect(old.severity).toBeGreaterThan(young.severity * 1.3);
    expect(old.immunity).toBeLessThan(young.immunity);
  });
});

describe('field medicine', () => {
  it('slows a tended illness more, as its description says', () => {
    const severity = (research: boolean) => {
      const sim = Simulation.newColony(12);
      const [doctor, c] = sim.colonists;
      if (research) {
        sim.research.done.push('fieldMedicine');
      }
      c.age = 30;
      infect(sim, c, 'marshFever');
      tend(sim, doctor, c, false);
      updateHealth(sim, c, 6);
      return c.health.disease!.severity;
    };
    expect(severity(true)).toBeLessThan(severity(false));
  });
});
