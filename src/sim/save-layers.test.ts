import { describe, expect, it } from 'vitest';
import {
  OLDEST_SAVE_VERSION,
  PackedLayer,
  SAVE_VERSION,
  deserialize,
  loadableVersion,
  packLayer,
  serialize,
} from './serialize';
import { Simulation } from './simulation';

// Layers that are mostly empty are saved as the tiles that aren't (version 17): every value comes back to the bit.

const LAYERS = [
  'terrain',
  'feature',
  'designation',
  'zone',
  'blueprint',
  'delivered',
  'itemType',
  'itemCount',
  'progress',
  'filth',
  'forbidden',
  'locked',
  'drying',
  'growth',
  'fresh',
  'quality',
  'damage',
  'fire',
  'floor',
  'roof',
  'fuel',
] as const;

const bitsOf = (a: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }) => [
  ...new Uint8Array(a.buffer, a.byteOffset, a.byteLength),
];

describe('packed layers', () => {
  it('keep a mostly empty layer as its filled tiles, and a full one whole', () => {
    const sparse = new Float32Array(1000);
    sparse[3] = 0.25;
    sparse[900] = -0;
    sparse[901] = 7;
    const packed = packLayer(sparse) as PackedLayer;
    expect([...packed.at]).toEqual([3, 900, 901]);
    expect(packed.length).toBe(1000);
    const full = new Uint8Array(100).fill(2);
    expect(packLayer(full)).toBeInstanceOf(Uint8Array);
    expect(packLayer(full)).not.toBe(full);
  });

  it('give back every layer of a colony to the bit, straight, through JSON and through a file', () => {
    const sim = Simulation.newColony(7, 'standard', 96);
    for (let t = 0; t < 200 * 30; t++) {
      sim.step();
    }
    // A float's sign, kept even when it's -0.
    sim.world.growth[5] = -0;
    sim.world.damage[sim.world.size - 1] = 1e-30;
    const saved = serialize(sim);
    const viaJson = JSON.parse(JSON.stringify(saved));
    const viaFile = JSON.parse(
      JSON.stringify(saved, (_k, v: unknown) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v)),
    );
    // (Through browser storage it's bit for bit; JSON can't tell -0 from 0, whole layers or packed.)
    for (const [data, exact] of [
      [structuredClone(saved), true],
      [viaJson, false],
      [viaFile, false],
    ] as const) {
      const back = deserialize(data);
      for (const key of LAYERS) {
        if (exact) {
          expect(bitsOf(back.world[key]), key).toEqual(bitsOf(sim.world[key]));
        } else {
          // (-0 + 0 is 0.)
          expect(
            Array.from(back.world[key], (v) => v + 0),
            key,
          ).toEqual(Array.from(sim.world[key], (v) => v + 0));
        }
      }
      expect(Object.is(back.world.growth[5], -0)).toBe(exact);
      // And it plays on as the colony it came from.
      const a = deserialize(structuredClone(saved));
      for (let t = 0; t < 600; t++) {
        a.step();
        back.step();
      }
      expect(back.tick).toBe(a.tick);
      expect(bitsOf(back.world.feature)).toEqual(bitsOf(a.world.feature));
      expect(back.colonists.map((c) => c.tile)).toEqual(a.colonists.map((c) => c.tile));
    }
  });

  it('make an XL save a fraction of the size', () => {
    const sim = Simulation.newColony(3, 'standard', 256);
    const saved = serialize(sim);
    const bytes = (v: unknown): number =>
      ArrayBuffer.isView(v)
        ? v.byteLength
        : v && typeof v === 'object'
          ? Object.values(v).reduce<number>((n, x) => n + bytes(x), 0)
          : 0;
    const whole = LAYERS.reduce((n, key) => n + sim.world[key].byteLength, 0);
    expect(bytes(saved.layers) - saved.layers.temperature.byteLength).toBeLessThan(whole / 3);
  });

  it('load saves of the version before, and none from a newer one', () => {
    expect(SAVE_VERSION).toBe(17);
    expect(loadableVersion(OLDEST_SAVE_VERSION)).toBe(true);
    expect(loadableVersion(SAVE_VERSION)).toBe(true);
    expect(loadableVersion(SAVE_VERSION + 1)).toBe(false);
    expect(loadableVersion(15)).toBe(false);
    expect(loadableVersion(undefined)).toBe(false);
  });
});
