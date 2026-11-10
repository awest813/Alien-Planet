// How many canvas pixels the map gets for each of the page's: on a sharp (high-density) screen, up to 2, so the
// map isn't drawn at the page's resolution and blown up soft. That is up to four times the pixels to paint, and
// an older phone's GPU may not keep up: the "Map sharpness" setting can say Fast (the page's resolution), Sharp,
// or Auto, which starts sharp and drops to fast if the frames run slow.

export const SHARPNESS_AUTO = 0;
export const SHARPNESS_FAST = 1;
export const SHARPNESS_SHARP = 2;

// What Auto has found this visit: whether the frames ran slow and it dropped to fast.
export const autoSharpness = { slow: false };

// (Three times over, as some phones are, is more than twice the pixels again for little to see.)
const MOST = 2;

export function canvasRatio(setting: number, deviceRatio: number, slow: boolean): number {
  if (setting === SHARPNESS_FAST || (setting === SHARPNESS_AUTO && slow)) {
    return 1;
  }
  return Math.min(MOST, Math.max(1, deviceRatio || 1));
}

// Watches frame times for Auto: slow is under about 35 frames a second, on average over a few seconds, twice
// running (not one busy moment: a map being built, a save loading). The first seconds don't count, nor a frame
// after a long gap (the tab in the background, the machine asleep).
const WARM_UP_MS = 5000;
const WINDOW_MS = 3000;
const SLOW_FRAME_MS = 1000 / 35;
const GAP_MS = 1000;

export class FrameWatch {
  private warm = 0;
  private sum = 0;
  private frames = 0;
  private slowWindows = 0;

  // Takes one frame's time; true once the frames have run slow.
  public frame(deltaMs: number): boolean {
    if (!(deltaMs > 0) || deltaMs > GAP_MS) {
      return false;
    }
    if (this.warm < WARM_UP_MS) {
      this.warm += deltaMs;
      return false;
    }
    this.sum += deltaMs;
    this.frames++;
    if (this.sum < WINDOW_MS) {
      return false;
    }
    const slow = this.sum / this.frames > SLOW_FRAME_MS;
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    this.sum = 0;
    this.frames = 0;
    return this.slowWindows >= 2;
  }
}
