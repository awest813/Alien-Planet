import { describe, expect, it } from 'vitest';
import {
  CHROMEBOOK_AUTO,
  CHROMEBOOK_OFF,
  CHROMEBOOK_ON,
  SCROLL_AUTO,
  SCROLL_MOVES,
  SCROLL_ZOOMS,
  chromebookMode,
  isChromeOS,
  scrollMoves,
  wheelZoom,
} from './device';

describe('Chromebook mode', () => {
  it('knows a Chromebook by its platform or its user agent', () => {
    expect(isChromeOS({ userAgentData: { platform: 'Chrome OS' } })).toBe(true);
    expect(
      isChromeOS({
        userAgent:
          'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }),
    ).toBe(true);
    expect(isChromeOS({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0 Safari/537.36' })).toBe(false);
    expect(
      isChromeOS({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0' }),
    ).toBe(false);
    expect(isChromeOS(undefined)).toBe(false);
  });

  it('is on by itself on a Chromebook, and can be turned on or off anywhere', () => {
    expect(chromebookMode(CHROMEBOOK_AUTO, true)).toBe(true);
    expect(chromebookMode(CHROMEBOOK_AUTO, false)).toBe(false);
    expect(chromebookMode(CHROMEBOOK_ON, false)).toBe(true);
    expect(chromebookMode(CHROMEBOOK_OFF, true)).toBe(false);
  });

  it('a scroll moves the map in Chromebook mode (a touchpad), and zooms elsewhere (a mouse wheel)', () => {
    expect(scrollMoves(SCROLL_AUTO, true)).toBe(true);
    expect(scrollMoves(SCROLL_AUTO, false)).toBe(false);
    expect(scrollMoves(SCROLL_ZOOMS, true)).toBe(false);
    expect(scrollMoves(SCROLL_MOVES, false)).toBe(true);
  });
});

describe('zooming with the wheel', () => {
  it('a mouse wheel’s notch is the old 15% step, either way', () => {
    expect(wheelZoom(-100, 0, false)).toBeCloseTo(1.15, 3);
    expect(wheelZoom(100, 0, false)).toBeCloseTo(1 / 1.15, 3);
    // Firefox counts a notch in lines, and Chrome on Linux as 53 pixels.
    expect(wheelZoom(-3, 1, false)).toBeCloseTo(1.15, 1);
    expect(wheelZoom(-53, 0, false)).toBeCloseTo(1.15, 3);
    expect(wheelZoom(53, 0, false)).toBeCloseTo(1 / 1.15, 3);
  });

  it('a touchpad’s run of small scrolls zooms as far as one notch of the same distance, not one step each', () => {
    // (Twenty-five events of 4 pixels: at a step each, that was 1.15^25, thirty-three times nearer.)
    let zoom = 1;
    for (let k = 0; k < 25; k++) {
      zoom *= wheelZoom(-4, 0, false);
    }
    expect(zoom).toBeCloseTo(1.15, 2);
  });

  it('a pinch zooms more for its size, and no one event jumps far', () => {
    expect(wheelZoom(-10, 0, true)).toBeGreaterThan(wheelZoom(-10, 0, false));
    // Ctrl and a mouse wheel's notch: the same step as without Ctrl, not a pinch's rate on 100 pixels.
    expect(wheelZoom(-100, 0, true)).toBeCloseTo(1.15, 3);
    expect(wheelZoom(-53, 0, true)).toBeCloseTo(1.15, 3);
    expect(wheelZoom(-5000, 0, false)).toBeLessThan(1.5);
    expect(wheelZoom(5000, 0, false)).toBeGreaterThan(1 / 1.5);
  });
});
