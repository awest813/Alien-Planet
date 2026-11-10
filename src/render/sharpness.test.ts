import { describe, expect, it } from 'vitest';
import { FrameWatch, SHARPNESS_AUTO, SHARPNESS_FAST, SHARPNESS_SHARP, canvasRatio } from './sharpness';

const run = (watch: FrameWatch, ms: number, frameMs: number) => {
  let slow = false;
  for (let t = 0; t < ms; t += frameMs) {
    slow = watch.frame(frameMs) || slow;
  }
  return slow;
};

describe('map sharpness', () => {
  it('draws at the screen density, at most twice over, unless told fast', () => {
    expect(canvasRatio(SHARPNESS_SHARP, 3, false)).toBe(2);
    expect(canvasRatio(SHARPNESS_SHARP, 1.5, true)).toBe(1.5);
    expect(canvasRatio(SHARPNESS_AUTO, 2, false)).toBe(2);
    expect(canvasRatio(SHARPNESS_AUTO, 2, true)).toBe(1);
    expect(canvasRatio(SHARPNESS_FAST, 2, false)).toBe(1);
    expect(canvasRatio(SHARPNESS_SHARP, 0, false)).toBe(1);
  });

  it('stays sharp at a smooth frame rate, or held to 30 a second', () => {
    expect(run(new FrameWatch(), 60000, 16.7)).toBe(false);
    expect(run(new FrameWatch(), 60000, 33.4)).toBe(false);
  });

  it('gives up sharpness when the frames stay slow', () => {
    const watch = new FrameWatch();
    expect(run(watch, 8000, 40)).toBe(false);
    expect(run(watch, 4000, 40)).toBe(true);
  });

  it("isn't put off by a slow start, one busy moment, or a long gap", () => {
    const watch = new FrameWatch();
    // Loading: slow, but in the warm-up.
    expect(run(watch, 5000, 50)).toBe(false);
    // One slow stretch between smooth ones.
    expect(run(watch, 3000, 40)).toBe(false);
    expect(run(watch, 3000, 16.7)).toBe(false);
    expect(run(watch, 3000, 40)).toBe(false);
    // Frames after the tab was in the background.
    expect(run(watch, 20000, 1500)).toBe(false);
  });
});
