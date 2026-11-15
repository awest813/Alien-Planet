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

describe('after an audit of health', () => {
  it('each illness got over keeps its own immunity: a second does not wipe the first', () => {
    const sim = Simulation.newColony(31);
    const c = sim.colonists[0];
    const getOver = (key: string) => {
      infect(sim, c, key);
      c.health.disease!.immunity = 1;
      updateHealth(sim, c, 0.01);
      expect(c.health.disease).toBeNull();
    };
    getOver('winterCough');
    sim.tick += 24 * 200;
    getOver('marshFever');
    sim.tick += 24 * 200;
    // (Caught again the next day, though the cough's twelve days had most of them left.)
    infect(sim, c, 'winterCough');
    expect(c.health.disease).toBeNull();
  });

  it('medicine goes on wounds it helps: not a bruise, nor an illness; the alert asks only for those', async () => {
    const { worthMedicine } = await import('./body');
    const wound = (label: string, severity: number, tended = 0) =>
      ({ label, severity, tended, bleeding: 0, infection: 0 }) as Parameters<typeof worthMedicine>[0];
    expect(worthMedicine(wound('Bruise', 0.03))).toBe(false);
    expect(worthMedicine(wound('Burn', 0.4))).toBe(false);
    expect(worthMedicine(wound('Cut', 0.05))).toBe(false);
    expect(worthMedicine(wound('Cut', 0.3))).toBe(true);
    expect(worthMedicine(wound('Arrow wound', 0.3, 0.6))).toBe(false);
    expect(worthMedicine({ ...wound('Cut', 0.3, 0.6), infection: 0.2 })).toBe(true);
    // The alert: a fever alone, or a bruise, doesn't ask for medicine.
    const { controller } = await import('../game/controller');
    controller.newColony('no-medicine');
    const s = controller.sim;
    // (Whatever medicine the landing brought, gone.)
    const { itemId } = await import('./defs');
    for (const i of [...s.world.tilesWith('items')]) {
      if (s.world.itemType[i] === itemId('herbalMedicine')) {
        s.world.takeItem(i, s.world.itemCount[i]);
      }
    }
    const medicineAlert = () =>
      (controller as unknown as { buildAlerts(t: unknown): { text: string }[] })
        .buildAlerts(s.resourceTotals())
        .some((a) => a.text.startsWith('No medicine'));
    const [a] = s.colonists;
    infect(s, a, 'marshFever');
    a.health.injuries.push(wound('Bruise', 0.03));
    expect(medicineAlert()).toBe(false);
    // A fresh deep cut: then it asks.
    a.health.injuries.push(wound('Cut', 0.3));
    expect(medicineAlert()).toBe(true);
  });

  it('a doctor who is bleeding sees to that before a patient who is only ill', () => {
    // (One with a deep cut walked eight tiles to a fever first.)
    const sim = Simulation.newColony(33);
    const [doctor, patient] = sim.colonists;
    doctor.health.injuries.push({ label: 'Cut', severity: 0.45, tended: 0, bleeding: 0.2, infection: 0 } as never);
    infect(sim, patient, 'marshFever');
    (sim as unknown as { tryTend(c: unknown): boolean }).tryTend(doctor);
    expect(doctor.job?.patient).toBe(doctor.id);
  });
});

describe('a wound healing', () => {
  it('says how long: sooner tended, and lying down; never, festering', async () => {
    const { healHours } = await import('./health');
    const sim = Simulation.newColony(34);
    const c = sim.colonists[0];
    const cut = { label: 'Cut', severity: 0.3, tended: 0, bleeding: 0, infection: 0 } as never as Parameters<
      typeof healHours
    >[2];
    const untended = healHours(sim, c, cut)!;
    const tended = healHours(sim, c, { ...cut, tended: 0.6 })!;
    expect(tended).toBeLessThan(untended);
    c.sleeping = true;
    expect(healHours(sim, c, { ...cut, tended: 0.6 })!).toBeLessThan(tended);
    expect(healHours(sim, c, { ...cut, infection: 0.2 })).toBeNull();
  });
});
