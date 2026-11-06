import { describe, expect, it } from 'vitest';
import { FEATURES, ITEMS, TERRAIN } from '../sim/defs';
import { Frames, TILESET_COLUMNS, TILESET_ROWS } from './tileset-layout';

describe('tileset layout', () => {
  it('gives every piece of art its own frame inside the tileset', () => {
    const frames = [
      ...TERRAIN.flatMap((t) =>
        [0, 1, 2, 3].flatMap((season) => [0, 1, 2, 3].map((v) => Frames.terrain(t.id, v, season))),
      ),
      ...FEATURES.flatMap((f) => [Frames.feature(f.id), Frames.blueprint(f.id)]),
      ...[1, 2, 3, 4].map(Frames.designation),
      ...ITEMS.map((i) => Frames.item(i.id)),
      Frames.ZONE,
      Frames.INDOOR,
      Frames.GROW_ZONE,
      ...FEATURES.filter((f) => f.crop).flatMap((f) => [0, 0.4, 0.9].map((g) => Frames.crop(f.id, g))),
    ];
    expect(new Set(frames).size).toBe(frames.length);
    expect(Math.min(...frames)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...frames)).toBeLessThan(TILESET_COLUMNS * TILESET_ROWS);
  });
});
