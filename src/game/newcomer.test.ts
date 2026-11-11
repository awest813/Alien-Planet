import { describe, expect, it } from 'vitest';
import { featureId, itemId } from '../sim/defs';
import { HOUR, clearAround, outline } from '../sim/test-helpers';
import { STOCKPILE_ZONE } from '../sim/world';
import { Alert, controller } from './controller';

// What a newcomer's first days showed (the seventh audit's playthrough), each first seen failing.

const alerts = (): Alert[] =>
  (controller as unknown as { buildAlerts(t: unknown): Alert[] }).buildAlerts(controller.sim.resourceTotals());
const texts = () => alerts().map((a) => a.text);
const goal = (id: string) => controller.getState().objectives.find((o) => o.id === id)!;

function colony(seed: string) {
  controller.newColony(seed);
  const sim = controller.sim;
  const { x, y } = clearAround(sim, 12);
  return { sim, w: sim.world, x, y };
}

describe("a newcomer's first days", () => {
  it('a goal met while the clock is stopped ticks off then, not when it runs again', () => {
    const { x, y } = colony('paused-goal');
    controller.setSpeed(0);
    controller.command({ type: 'zone', rect: { x0: x + 2, y0: y + 2, x1: x + 4, y1: y + 4 }, zone: STOCKPILE_ZONE });
    controller.publish();
    expect(goal('stockpile').done).toBe(true);
  });

  it('a hut with something across its door says so, not that its walls leave a gap', () => {
    const { sim, w, x, y } = colony('blocked-door');
    for (const i of outline(w, x + 2, y - 2, x + 6, y + 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 4, y + 2), featureId('door'));
    // A campfire just inside the door: nobody can get in.
    w.setFeature(w.idx(x + 4, y + 1), featureId('campfire'));
    expect(sim.hasShelter()).toBe(false);
    sim.tick = 17 * HOUR - 7 * HOUR;
    sim.syncClock();
    const shelter = texts().find((t) => t.startsWith('No shelter yet'))!;
    expect(shelter).not.toMatch(/gap/);
    expect(shelter).toMatch(/door/);
    controller.publish();
    expect(goal('shelter').how).not.toMatch(/gap/);
    expect(goal('shelter').tool).toBe('deconstruct');
  });

  it('the cloth goal moves on from the bench to the weaving, then the armchair', () => {
    const { sim, w, x, y } = colony('cloth-goal');
    controller.publish();
    expect(goal('cloth').tool).toBe('craftingBench');
    w.setFeature(w.idx(x + 3, y + 3), featureId('craftingBench'));
    controller.publish();
    expect(goal('cloth').tool).not.toBe('craftingBench');
    w.addItem(w.idx(x + 5, y + 5), itemId('cloth'), 6);
    controller.publish();
    expect(goal('cloth').tool).toBe('armchair');
    expect(sim.objectivesDone.cloth).toBeFalsy();
  });

  it('says "1 stack", not "1 stacks"', () => {
    const { sim, w, x, y } = colony('one-stack');
    sim.apply({ type: 'zone', rect: { x0: x + 2, y0: y + 2, x1: x + 2, y1: y + 2 }, zone: STOCKPILE_ZONE });
    w.addItem(w.idx(x + 2, y + 2), itemId('wood'), 50);
    // Everything else the colony landed with gone, and one stack lying outside.
    for (const i of [...w.tilesWith('items')]) {
      if (i !== w.idx(x + 2, y + 2)) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    w.addItem(w.idx(x + 6, y + 6), itemId('stone'), 5);
    const full = texts().find((t) => t.startsWith('Stockpiles are full'));
    expect(full).toBeDefined();
    expect(full).toMatch(/^Stockpiles are full: 1 stack lying outside/);
  });
});
