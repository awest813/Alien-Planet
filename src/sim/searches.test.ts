import { describe, expect, it } from 'vitest';
import { measureRooms } from './climate';
import { featureId } from './defs';
import { Simulation } from './simulation';
import { Filth } from './world';
import { clearAround, outline } from './test-helpers';

// The quicker searches (over the map's edge, over the tiles indoors, and room contents with the mess added
// apart) give the same answers as the whole-map ones they replaced.

type Inner = {
  nearestIndoor(from: number, test: (i: number) => boolean, limit?: number, bias?: (i: number) => number): number[];
  isIndoors(i: number): boolean;
  contents(): ReturnType<typeof measureRooms>;
  rooms: Parameters<typeof measureRooms>[1];
};

// A colony with a few rooms built, on a map of the given size.
function built(size: number, seed: number): Simulation {
  const sim = Simulation.newColony(seed, 'standard', size);
  const w = sim.world;
  const { x, y } = clearAround(sim, 14);
  for (const [x0, y0, x1, y1] of [
    [x - 12, y - 10, x - 5, y - 4],
    [x + 2, y + 2, x + 9, y + 7],
    [x - 3, y + 5, x + 1, y + 11],
  ]) {
    for (const i of outline(w, x0, y0, x1, y1)) {
      w.setFeature(i, featureId('woodWall'));
    }
  }
  return sim;
}

describe('the quicker searches', () => {
  it('the nearest tiles on the edge are the ones the whole map gives', () => {
    for (const [size, seed] of [
      [64, 3],
      [128, 8],
      [96, 21],
    ]) {
      const sim = built(size, seed);
      const w = sim.world;
      const onEdge = (i: number) => {
        const x = w.xOf(i);
        const y = w.yOf(i);
        return x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1;
      };
      for (let k = 0; k < 60; k++) {
        const from = sim.rng.int(0, w.size - 1);
        const region = sim.regionOf(from);
        const test = (i: number) => sim.regionOf(i) === region;
        for (const limit of [1, 3]) {
          expect(sim.nearestEdge(from, test, limit)).toEqual(sim.nearest(from, (i) => onEdge(i) && test(i), limit));
        }
      }
    }
  });

  it('the nearest tiles indoors are the ones the whole map gives, with and without a bias', () => {
    const sim = built(96, 5);
    const inner = sim as unknown as Inner;
    const w = sim.world;
    let found = 0;
    for (let k = 0; k < 80; k++) {
      const from = sim.rng.int(0, w.size - 1);
      const test = (i: number) => w.isPassable(i) && i % 3 !== 0;
      const bias = (i: number) => (i % 7) * 0.5;
      for (const limit of [1, 8]) {
        const quick = inner.nearestIndoor(from, test, limit);
        expect(quick).toEqual(sim.nearest(from, (i) => inner.isIndoors(i) && test(i), limit));
        expect(inner.nearestIndoor(from, test, limit, bias)).toEqual(
          sim.nearest(from, (i) => inner.isIndoors(i) && test(i), limit, bias),
        );
        found += quick.length;
      }
    }
    // (Rooms there were, and found.)
    expect(found).toBeGreaterThan(0);
  });

  it('rooms measured with the mess added apart are as measured all at once, as the mess comes and goes', () => {
    const sim = built(64, 9);
    const inner = sim as unknown as Inner;
    const w = sim.world;
    const whole = () => measureRooms(w, inner.rooms, (i) => sim.beautyAt(i));
    const beauty = (rooms: ReturnType<typeof measureRooms>) => rooms.map((r) => Math.round(r.beauty * 1e9) / 1e9);
    expect(beauty(inner.contents())).toEqual(beauty(whole()));
    for (let k = 0; k < 200; k++) {
      // (Every other one in a room, where it counts.)
      const indoors = inner.nearestIndoor(sim.rng.int(0, w.size - 1), (t) => w.isPassable(t), 1)[0];
      const i = k % 2 === 0 && indoors !== undefined ? indoors : sim.rng.int(0, w.size - 1);
      if (k % 3 === 2) {
        w.cleanFilth(i, true);
      } else {
        w.addFilth(i, k % 2 === 0 ? Filth.BLOOD : Filth.DIRT, 1 + (k % 2));
      }
      if (k % 10 === 0) {
        expect(beauty(inner.contents())).toEqual(beauty(whole()));
      }
    }
    expect(beauty(inner.contents())).toEqual(beauty(whole()));
    // (Mess there was, indoors as well.)
    expect([...w.tilesWith('filth')].some((i) => inner.isIndoors(i))).toBe(true);
  });
});
