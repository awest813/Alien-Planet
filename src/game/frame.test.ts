import { afterEach, describe, expect, it, vi } from 'vitest';
import { controller } from './controller';

// The controller's frame: the clock stopping where it should, and what the interface is handed.

afterEach(() => vi.restoreAllMocks());

describe('a frame', () => {
  it('stops the clock at the tick of an emergency, not after the rest of the frame', () => {
    // A long frame (the tab back from the background, a hitch) ran every tick owed before looking at what had
    // happened, so the colony played on for up to a third of an hour past a death that should have paused it.
    controller.newColony('pause-at-once');
    controller.setSpeed(3);
    const sim = controller.sim;
    let ticksAfterEvent = -1;
    const step = sim.step.bind(sim);
    vi.spyOn(sim, 'step').mockImplementation(() => {
      step();
      if (ticksAfterEvent < 0) {
        sim.events.push('death');
        ticksAfterEvent = 0;
      } else {
        ticksAfterEvent++;
      }
    });
    // The last frame was a second ago (the most frame() allows for).
    (controller as unknown as { lastFrame: number }).lastFrame = performance.now() - 1000;
    controller.frame();
    expect(controller.getState().speed).toBe(0);
    expect(ticksAfterEvent).toBe(0);
  });

  it('keeps colonists where they were drawn when the clock stops', () => {
    // Paused, the fraction of a tick dropped to 0: a walking colonist snapped back to the last whole tick, and
    // forward again on resume.
    controller.newColony('pause-in-place');
    controller.setSpeed(1);
    (controller as unknown as { accumulator: number }).accumulator = 0.6;
    const moving = controller.tickFraction;
    controller.setSpeed(0);
    expect(controller.tickFraction).toBe(moving);
  });

  it('hands the interface only plain objects, arrays and values', () => {
    // A Map, a Set, a typed array or a class instance would be passed through by reference, and the interface
    // would hold live simulation state.
    controller.newColony('plain-state');
    for (let i = 0; i < 2000; i++) controller.sim.step();
    controller.publish();
    const odd: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (v === null || typeof v !== 'object') {
        return;
      }
      if (Array.isArray(v)) {
        v.forEach((x, i) => walk(x, `${path}[${i}]`));
        return;
      }
      const proto: unknown = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) {
        odd.push(`${path}: ${(proto as { constructor?: { name: string } }).constructor?.name}`);
        return;
      }
      for (const [k, x] of Object.entries(v)) {
        walk(x, `${path}.${k}`);
      }
    };
    walk(controller.getState(), 'state');
    expect(odd).toEqual([]);
  });
});
