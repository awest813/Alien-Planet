import { describe, expect, it } from 'vitest';
import { featureId } from '../sim/defs';
import { World } from '../sim/world';
import { LightBuffer, litTiles } from './lighting';

describe('light after dark', () => {
  it('is stopped by walls, which catch it on their near face', () => {
    const w = new World(12, 12);
    // A wall two tiles east of the light, running north–south.
    for (let y = 0; y < 12; y++) {
      w.setFeature(w.idx(7, y), featureId('woodWall'));
    }
    const lit = new Map(litTiles(w, w.idx(5, 5), 3.6).map((t) => [t.tile, t.share]));
    expect(lit.get(w.idx(5, 5))).toBe(1);
    expect(lit.get(w.idx(6, 5))).toBeGreaterThan(0.6);
    // The wall is lit at half strength; nothing beyond it is.
    expect(lit.get(w.idx(7, 5))).toBeCloseTo((1 - 2 / 3.6) / 2);
    expect(lit.has(w.idx(8, 5))).toBe(false);
    expect([...lit.keys()].some((i) => w.xOf(i) > 7)).toBe(false);
    // On the open side it reaches its radius.
    expect(lit.has(w.idx(2, 5))).toBe(true);
    expect(lit.has(w.idx(1, 5))).toBe(false);
  });

  it('writes only lit tiles and clears them the next frame', () => {
    const buffer = new LightBuffer(4);
    const pixels = new Uint8ClampedArray(16);
    buffer.add(1, 0xff8000, 0.5);
    buffer.add(1, 0xff8000, 0.5);
    expect(buffer.flush(pixels)).toBe(true);
    expect([...pixels.slice(4, 8)]).toEqual([255, 128, 0, 0]);
    expect(buffer.flush(pixels)).toBe(true);
    expect([...pixels.slice(4, 8)]).toEqual([0, 0, 0, 0]);
    expect(buffer.flush(pixels)).toBe(false);
  });
});
