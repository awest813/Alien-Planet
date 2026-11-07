import { describe, expect, it } from 'vitest';
import { itemId } from './defs';
import { Simulation } from './simulation';
import { HOUR, clearAround } from './test-helpers';
import { WORK_TYPES } from './types';

describe('nobody is left to starve', () => {
  it('a colonist laid low by blood loss and starving is fed, by anyone when no doctor is on their feet', () => {
    const sim = Simulation.newColony(21);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    const [patient, ...rest] = sim.colonists;
    // Food, but out of the patient's reach (the landing rations moved off too).
    for (const i of [...w.tilesWith('items')]) {
      if (w.distance(i, patient.tile) < 4) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    let food = w.idx(x - 6, y + 6);
    while (!w.isPassable(food) || w.distance(food, patient.tile) < 4) {
      food--;
    }
    w.addItem(food, itemId('meal'), 10);
    // The only doctor is the one lying down.
    for (const c of sim.colonists) {
      for (const work of WORK_TYPES) {
        c.priorities[work] = 0;
      }
      c.needs.joy = 0.1;
      c.schedule.fill('J');
    }
    patient.priorities.doctor = 1;
    // Wounds tended long since, but still too weak from blood loss to get up.
    patient.health.bloodLoss = 0.7;
    patient.health.downed = true;
    patient.needs.food = 0.05;
    // Someone drops their game to fetch food, and the patient eats within the half hour.
    let fed = false;
    let fetched = false;
    for (let t = 0; t < HOUR / 2 + 20 && !fed; t++) {
      sim.step();
      fed = patient.needs.food > 0.2;
      fetched ||= rest.some((c) => c.job?.type === 'feed');
    }
    expect(fetched).toBe(true);
    expect(fed).toBe(true);
    expect(rest.length).toBeGreaterThan(0);
  });
});
