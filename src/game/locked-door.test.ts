import { describe, expect, it } from 'vitest';
import { featureId } from '../sim/defs';
import { HOUR, clearAround, outline } from '../sim/test-helpers';
import { Alert, controller } from './controller';

const alerts = (): Alert[] =>
  (controller as unknown as { buildAlerts(t: unknown): Alert[] }).buildAlerts(controller.sim.resourceTotals());
const goal = (id: string) => controller.getState().objectives.find((o) => o.id === id)!;

// A hut whose only door is locked (found reviewing the seventh audit's blocked-door fix).
describe('a hut whose only door is locked', () => {
  it('says to unlock it, not to deconstruct something across the door', () => {
    controller.newColony('review8-locked');
    const sim = controller.sim;
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    for (const i of outline(w, x + 2, y - 2, x + 6, y + 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    const door = w.idx(x + 4, y + 2);
    w.setFeature(door, featureId('door'));
    expect(sim.hasShelter()).toBe(true);
    // Locked (to keep raiders out, say) with everyone outside: nothing is built across it.
    sim.apply({ type: 'lock', tile: door, locked: true });
    expect(w.locked[door]).toBe(1);
    expect(sim.hasShelter()).toBe(false);
    sim.tick = 17 * HOUR - 7 * HOUR;
    sim.syncClock();
    const shelter = alerts()
      .map((a) => a.text)
      .find((t) => t.startsWith('No shelter yet'))!;
    controller.publish();
    expect(shelter).toMatch(/locked/);
    expect(shelter).not.toMatch(/built across the door/);
    expect(goal('shelter').how).toMatch(/unlock/);
    expect(goal('shelter').tool).not.toBe('deconstruct');
  });
});
