import { describe, expect, it } from 'vitest';
import { artBeauty, rollQuality, titleFor } from './art';
import { featureId, itemId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { WORK_TYPES } from './types';

// A cleared patch with the wood for a sculpture lying about, everyone fed and rested.
function studio(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  w.dropItemNear(w.idx(x - 5, y - 5), itemId('wood'), 120);
  for (const c of sim.colonists) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 1;
    c.schedule.fill('W');
  }
  return { sim, w, x, y };
}

// Only colonist 0 does art; nobody else works at all.
function onlyArtist(sim: Simulation, skill: number) {
  const [artist, ...rest] = sim.colonists;
  for (const c of sim.colonists) {
    for (const work of WORK_TYPES) {
      c.priorities[work] = 0;
    }
  }
  artist.priorities.art = 1;
  artist.priorities.hauling = 2;
  artist.skills.artistic = skill;
  for (const c of rest) {
    c.priorities.hauling = 1;
  }
  return artist;
}

describe('sculpting', () => {
  it('is Art work: an artist carves the piece, with a quality and a title', () => {
    const { sim, w, x, y } = studio(1);
    const artist = onlyArtist(sim, 9);
    const spot = w.idx(x + 3, y);
    sim.apply({ type: 'build', feature: featureId('sculptureSmall'), tiles: [spot] });
    run(sim, HOUR * 12);
    expect(w.feature[spot]).toBe(featureId('sculptureSmall'));
    const art = sim.artworkAt(spot)!;
    expect(art.artist).toBe(artist.name);
    expect(art.quality).toBeGreaterThanOrEqual(6);
    expect(art.title.length).toBeGreaterThan(0);
    expect(sim.stats.sculptures).toBe(1);
    expect(artist.thoughts.some((t) => t.key === 'madeArt' || t.key === 'madeMasterwork')).toBe(true);
    expect(sim.objectivesDone.sculpture).toBe(true);
    // Saved with the colony.
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.artworkAt(spot)).toEqual(art);
  });

  it("isn't done by builders: without Art work the sculpture waits", () => {
    const { sim, w, x, y } = studio(2);
    onlyArtist(sim, 9);
    for (const c of sim.colonists) {
      c.priorities.art = 0;
      c.priorities.construction = 1;
    }
    const spot = w.idx(x + 3, y);
    sim.apply({ type: 'build', feature: featureId('sculptureSmall'), tiles: [spot] });
    run(sim, HOUR * 12);
    expect(w.feature[spot]).not.toBe(featureId('sculptureSmall'));
  });

  it('comes out better from a more skilled artist', () => {
    const { sim } = studio(3);
    const c = sim.colonists[0];
    const average = (skill: number) => {
      c.skills.artistic = skill;
      let total = 0;
      for (let k = 0; k < 200; k++) {
        total += rollQuality(sim, c);
      }
      return total / 200;
    };
    expect(average(16)).toBeGreaterThan(average(3) + 10);
    expect(artBeauty(17)).toBeGreaterThan(artBeauty(6) * 1.8);
  });

  it('takes its subject from the colony story', () => {
    const { sim } = studio(4);
    sim.storyLog = [{ day: 9, hour: 14, text: 'Ada and Bram have become friends.', tone: 'good' }];
    expect(titleFor(sim, sim.colonists[0])).toBe('Ada and Bram');
    sim.storyLog = [];
    expect(titleFor(sim, sim.colonists[0])).toContain(sim.colonists[0].name);
  });
});

describe('beauty', () => {
  // A 5×5 room with a door, and its inside tiles.
  function room(seed: number) {
    const s = studio(seed);
    const { w, x, y } = s;
    for (const i of outline(w, x + 2, y - 3, x + 8, y + 3)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 2, y), featureId('door'));
    return { ...s, inside: (dx: number, dy: number) => w.idx(x + 5 + dx, y + dy) };
  }

  it('makes a room with a fine sculpture a gallery, more impressive the better the piece', () => {
    const { sim, w, inside } = room(5);
    const spot = inside(0, 0);
    w.setFeature(spot, featureId('sculptureLarge'));
    sim.artworks.set(spot, { quality: 3, title: 'Rough', artist: 'Ada', day: 1 });
    sim.colonists[0].tile = inside(1, 1);
    const roomAt = () => sim.roomAt(inside(1, 1))!;
    expect(roomAt().role).toBe('Gallery');
    const rough = roomAt().impressiveness;
    // Re-placed, as a newly finished piece would be.
    w.setFeature(spot, 0);
    sim.artworks.set(spot, { quality: 18, title: 'Fine', artist: 'Ada', day: 1 });
    w.setFeature(spot, featureId('sculptureLarge'));
    expect(roomAt().impressiveness).toBeGreaterThan(rough + 10);
  });

  it('lifts the spirits of anyone near it, and a bare room drags a little', () => {
    const { sim, w, inside } = room(6);
    const c = sim.colonists[0];
    c.tile = inside(0, 0);
    const labels = () => sim.thoughtsOf(c).map((t) => t.label);
    expect(labels()).toContain('Drab surroundings');
    w.setFeature(inside(1, 0), featureId('sculptureLarge'));
    sim.artworks.set(inside(1, 0), { quality: 14, title: 'Fine', artist: 'Ada', day: 1 });
    w.setFeature(inside(-1, 0), featureId('flowerPot'));
    expect(labels()).toContain('Beautiful surroundings');
  });

  it('fades for flowers in winter', () => {
    const { sim, w, x, y } = studio(7);
    const pot = w.idx(x + 3, y);
    w.setFeature(pot, featureId('flowerPot'));
    const summer = sim.beautyAt(pot);
    sim.tick = 20 * 24 * HOUR;
    sim.syncClock();
    expect(sim.season).toBe('Winter');
    expect(sim.beautyAt(pot)).toBeLessThan(summer);
  });

  it('gives art recreation to those who stop to admire a sculpture', () => {
    const { sim, w, x, y } = studio(8);
    const spot = w.idx(x + 3, y);
    w.setFeature(spot, featureId('sculptureSmall'));
    sim.artworks.set(spot, { quality: 10, title: 'Piece', artist: 'Ada', day: 1 });
    const c = sim.colonists[0];
    c.recentJoy = { outdoor: 2 };
    c.needs.joy = 0.1;
    c.schedule.fill('J');
    run(sim, HOUR * 2);
    expect(c.recentJoy.art ?? 0).toBeGreaterThan(0.1);
  });
});
