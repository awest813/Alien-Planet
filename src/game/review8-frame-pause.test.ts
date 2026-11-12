import { afterEach, describe, expect, it, vi } from 'vitest';
import { controller } from './controller';

afterEach(() => vi.restoreAllMocks());

describe('review8: a frame that stops at an emergency', () => {
  it('does not run the rest of the owed ticks on the next frames while paused', () => {
    controller.newColony('review8-pause');
    controller.setSpeed(3);
    const sim = controller.sim;
    let fired = false;
    const step = sim.step.bind(sim);
    vi.spyOn(sim, 'step').mockImplementation(() => {
      step();
      if (!fired) {
        sim.events.push('death');
        fired = true;
      }
    });
    (controller as unknown as { lastFrame: number }).lastFrame = performance.now() - 1000;
    controller.frame();
    expect(controller.getState().speed).toBe(0);
    const pausedAt = sim.tick;
    // A few more frames with the clock stopped.
    for (let i = 0; i < 5; i++) controller.frame();
    expect(controller.getState().speed).toBe(0);
    expect(sim.tick).toBe(pausedAt);
  });
});
