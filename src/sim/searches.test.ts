import { describe, expect, it } from 'vitest';
import { measureRooms } from './climate';
import { featureDef, featureId } from './defs';
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
  refreshGrid(): void;
  powerTiles: number[];
  lampTiles: number[];
  fishingSpots: number[];
  fireTiles: number[];
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

  it('rooms measured from the tiles indoors and the buildings outdoors are as a scan of the whole map gives', () => {
    for (const [size, seed] of [
      [64, 9],
      [128, 4],
    ]) {
      const sim = built(size, seed);
      const inner = sim as unknown as Inner;
      const w = sim.world;
      const { x, y } = clearAround(sim, 0);
      // Furniture indoors and out, a fire, a floor in a room and one outside, trees felled and planted.
      const place = (dx: number, dy: number, key: string) => w.setFeature(w.idx(x + dx, y + dy), featureId(key));
      place(-8, -7, 'campfire');
      place(-7, -7, 'bed');
      place(5, 4, 'table');
      place(-1, 0, 'campfire');
      place(1, -1, 'bed');
      w.setLayer('floor', w.idx(x - 9, y - 6), featureId('woodFloor'));
      w.setLayer('floor', w.idx(x, y - 2), featureId('woodFloor'));
      const check = () => {
        const quick = inner.contents();
        const whole = measureRooms(w, inner.rooms, (i) => sim.beautyAt(i), false);
        for (let r = 0; r < whole.length; r++) {
          // Beauty only counts in an enclosed room, and there it's the same to the last bit; the rest everywhere.
          const { beauty, ...rest } = whole[r];
          const { beauty: quickBeauty, ...quickRest } = quick[r];
          expect(quickRest).toEqual(rest);
          if (inner.rooms.enclosed[r]) {
            expect(quickBeauty).toBe(beauty);
          }
        }
      };
      check();
      let felled = 0;
      for (const i of [...w.tilesWith('features')]) {
        if (felled < 20 && w.feature[i] === featureId('tree')) {
          w.setFeature(i, 0);
          felled++;
        }
      }
      check();
    }
  });

  it('fires, generators, lamps and fishing spots, and the colony centre, are as a scan of the whole map finds them', () => {
    const sim = built(96, 12);
    const inner = sim as unknown as Inner;
    const w = sim.world;
    const { x, y } = clearAround(sim, 0);
    for (const [dx, dy, key] of [
      [3, 3, 'campfire'],
      [-4, 6, 'campfire'],
      [6, -3, 'bed'],
      [-6, -2, 'table'],
    ] as const) {
      w.setFeature(w.idx(x + dx, y + dy), featureId(key));
    }
    inner.refreshGrid();
    const scan = (test: (f: number) => boolean) => {
      const tiles: number[] = [];
      for (let i = 0; i < w.size; i++) {
        if (w.feature[i] !== 0 && test(w.feature[i])) {
          tiles.push(i);
        }
      }
      return tiles;
    };
    const def = (f: number) => featureDef(f);
    expect(inner.fireTiles).toEqual(scan((f) => !!def(f).burns));
    expect(inner.fireTiles.length).toBeGreaterThan(0);
    expect(inner.fishingSpots).toEqual(scan((f) => def(f).fishing));
    expect(inner.powerTiles).toEqual(scan((f) => !!def(f).power));
    expect(inner.lampTiles).toEqual(scan((f) => !!def(f).power && def(f).growLight > 0));
    let sx = 0;
    let sy = 0;
    const centre = scan((f) => !def(f).natural && !def(f).crop);
    for (const i of centre) {
      sx += w.xOf(i);
      sy += w.yOf(i);
    }
    expect(sim.homeTile()).toBe(w.idx(Math.round(sx / centre.length), Math.round(sy / centre.length)));
  });
});
