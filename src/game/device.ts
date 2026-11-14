// What kind of machine the game is on, and the settings that follow from it. A Chromebook is most often a small,
// low-powered laptop: a touchpad rather than a mouse (two fingers to scroll, a pinch to zoom), often a touch screen
// as well, no Delete key, and a GPU that a sharp canvas at 60 frames a second keeps busy (and its battery low).
// "Chromebook mode" is on by itself on one (Auto), and can be turned on or off anywhere.

export const CHROMEBOOK_AUTO = 0;
export const CHROMEBOOK_ON = 1;
export const CHROMEBOOK_OFF = 2;

export const SCROLL_AUTO = 0;
export const SCROLL_ZOOMS = 1;
export const SCROLL_MOVES = 2;

// In Chromebook mode the map is drawn at most this many times a second (sixty kept a small GPU at full tilt for
// little to see: the colony moves at a walk).
export const CHROMEBOOK_FPS = 30;

interface NavigatorLike {
  userAgent?: string;
  userAgentData?: { platform?: string };
}

export function isChromeOS(nav: NavigatorLike | undefined = typeof navigator === 'undefined' ? undefined : navigator) {
  if (!nav) {
    return false;
  }
  // (Newer Chrome tells the platform outright; the user agent's "CrOS" covers older ones and the rest.)
  return nav.userAgentData?.platform === 'Chrome OS' || /\bCrOS\b/.test(nav.userAgent ?? '');
}

export const chromebookMode = (setting: number, chromeOS: boolean): boolean =>
  setting === CHROMEBOOK_ON || (setting === CHROMEBOOK_AUTO && chromeOS);

// Whether a scroll (two fingers on a touchpad, or the wheel) moves the map rather than zooming it. Auto: it moves
// in Chromebook mode, where it's a touchpad's (and a pinch zooms), and zooms elsewhere, where it's a mouse wheel's.
export const scrollMoves = (setting: number, chromebook: boolean): boolean =>
  setting === SCROLL_MOVES || (setting === SCROLL_AUTO && chromebook);

// How much one wheel event zooms by, as a factor (over 1 nearer, under 1 further). In proportion to how far it
// scrolled: a touchpad sends dozens of small events a gesture, and at a fixed step each, two fingers zoomed in and
// out wildly. A mouse wheel's notch (100 pixels, or 3 lines in Firefox) is the old step, 15%; a pinch (sent as a
// wheel event with Ctrl held, in small steps) more for its size.
const NOTCH = 100;
const STEP = 1.15;
const LINE = 33;
export function wheelZoom(deltaY: number, deltaMode: number, pinch: boolean): number {
  const pixels = deltaMode === 1 ? deltaY * LINE : deltaMode === 2 ? deltaY * 800 : deltaY;
  const rate = pinch ? 0.01 : Math.log(STEP) / NOTCH;
  let power = -pixels * rate;
  // A scroll of 50 pixels or more at once is a mouse wheel's notch, whatever the browser counts it as (Chrome on
  // Linux says 53, on Windows 100): at least the old step, so no mouse zooms at half speed. (A touchpad's steps
  // are far smaller.)
  if (!pinch && Math.abs(pixels) >= 50) {
    power = Math.sign(power) * Math.max(Math.abs(power), Math.log(STEP));
  }
  const factor = Math.exp(power);
  // (One event never jumps more than a notch and a half: a fast flick on some mice reports thousands.)
  return Math.min(STEP * 1.3, Math.max(1 / (STEP * 1.3), factor));
}

// A wheel event's scroll in the page's pixels.
export const wheelPixels = (delta: number, deltaMode: number): number =>
  deltaMode === 1 ? delta * LINE : deltaMode === 2 ? delta * 800 : delta;
