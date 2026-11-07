import { describe, expect, it } from 'vitest';
import { featureId } from '../sim/defs';
import { DAYS_PER_SEASON } from '../sim/seasons';
import { HOUR, clearAround, outline } from '../sim/test-helpers';
import { TICKS_PER_HOUR } from '../sim/simulation';
import { Alert, controller } from './controller';

// The alerts the side panel would show right now.
const alerts = (): Alert[] =>
  (controller as unknown as { buildAlerts(t: unknown): Alert[] }).buildAlerts(controller.sim.resourceTotals());
const texts = () => alerts().map((a) => a.text);

// A fresh colony with a cleared patch around the first colonist.
function colony(seed: string) {
  controller.newColony(seed);
  const sim = controller.sim;
  const { x, y } = clearAround(sim, 12);
  return { sim, w: sim.world, x, y };
}

describe('alerts', () => {
  it('say when nobody can get to the beds', () => {
    const { sim, w, x, y } = colony('1');
    sim.tick = HOUR * 30;
    // A walled hut with a bed and a door that opens onto rock.
    for (const i of outline(w, x + 2, y - 3, x + 6, y + 1)) {
      w.setFeature(i, featureId('woodWall'));
    }
    const door = w.idx(x + 4, y + 1);
    w.setFeature(door, featureId('door'));
    w.setFeature(w.idx(x + 4, y - 1), featureId('bed'));
    expect(texts().some((t) => t.startsWith('Nobody can get to the beds'))).toBe(false);
    w.setFeature(w.idx(x + 4, y + 2), featureId('rock'));
    expect(texts().some((t) => t.startsWith('Nobody can get to the beds'))).toBe(true);
  });

  it('warn plainly when winter is coming and there is nowhere warm', () => {
    const { sim, w, x, y } = colony('2');
    // A few days before winter.
    sim.tick = (DAYS_PER_SEASON * 3 - 3) * 24 * TICKS_PER_HOUR;
    sim.syncClock();
    expect(texts().some((t) => t.includes('nowhere warm to shelter'))).toBe(true);
    // A closed hut with a campfire is enough.
    for (const i of outline(w, x + 2, y - 3, x + 7, y + 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 4, y + 2), featureId('door'));
    w.setFeature(w.idx(x + 4, y), featureId('campfire'));
    expect(texts().some((t) => t.includes('nowhere warm to shelter'))).toBe(false);
    expect(texts().some((t) => t.startsWith('Winter in'))).toBe(true);
  });

  it('point out wounded raiders, and what capturing them still needs', () => {
    const { sim, w, x, y } = colony('3');
    const base = { faction: 0, since: sim.tick, food: 0.6, resistance: 3, skill: 4, lastVisit: 0, hungryHours: 0 };
    sim.captives.push({ ...base, id: 1, name: 'Wren', tile: w.idx(x - 3, y), state: 'downed', capture: false });
    const about = () => texts().find((t) => /wounded|prisoner bed|Warden/.test(t));
    expect(about()).toMatch(/drag Capture/);
    sim.captives[0].capture = true;
    expect(about()).toMatch(/Build a prisoner bed/);
    w.setFeature(w.idx(x + 3, y), featureId('prisonerBed'));
    for (const c of sim.colonists) {
      c.priorities.warden = 0;
    }
    expect(about()).toMatch(/Warden/);
    sim.colonists[0].priorities.warden = 2;
    expect(about()).toMatch(/to be brought in/);
  });
});
