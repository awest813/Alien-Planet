import { describe, expect, it } from 'vitest';
import { featureId, itemId } from './defs';
import { LEGEND, LEGEND_QUALITY, OBSESSION_DAYS, chooseBreak, inspire, smashable, startObsession } from './minds';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { WORK_TYPES } from './types';
import { STOCKPILE_ZONE } from './world';

// A quiet colony with a closed hut and a bed, nobody working, no events.
function village(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 14);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  for (const c of sim.colonists) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 1;
    c.schedule.fill('W');
    c.age = 30;
    for (const work of WORK_TYPES) {
      c.priorities[work] = 0;
    }
  }
  for (const i of outline(w, x + 2, y - 3, x + 8, y + 3)) {
    w.setFeature(i, featureId('woodWall'));
  }
  w.setFeature(w.idx(x + 2, y), featureId('door'));
  const bed = w.idx(x + 6, y + 1);
  w.setFeature(bed, featureId('bed'));
  const keepFed = (hours: number) => {
    for (let h = 0; h < hours; h++) {
      for (const c of sim.living()) {
        c.needs.rest = 1;
        c.needs.joy = 1;
      }
      run(sim, HOUR);
    }
  };
  return { sim, w, x, y, bed, keepFed };
}

describe('mental breaks', () => {
  it('come in kinds that follow a colonist’s nature', () => {
    const { sim } = village(1);
    const c = sim.colonists[0];
    const tally = (traits: string[], age = 30) => {
      c.traits = traits;
      c.age = age;
      const seen: Record<string, number> = {};
      for (let k = 0; k < 400; k++) {
        const kind = chooseBreak(sim, c);
        seen[kind] = (seen[kind] ?? 0) + 1;
      }
      return seen;
    };
    expect(tally(['glutton']).binge).toBeGreaterThan(150);
    expect(tally(['kind']).tantrum ?? 0).toBe(0);
    expect(tally(['abrasive']).tantrum).toBeGreaterThan(80);
    const child = tally([], 8);
    expect((child.binge ?? 0) + (child.tantrum ?? 0)).toBe(0);
  });

  it('in a rage, smash a nearby piece of furniture, which goes back on the build list', () => {
    const { sim, w, x, y } = village(2);
    const c = sim.colonists[0];
    const table = w.idx(x - 3, y + 2);
    w.setFeature(table, featureId('table'));
    c.tile = w.idx(x - 5, y + 2);
    sim.startBreak(c, 'tantrum', 4);
    expect(sim.describe(c)).toContain('rage');
    run(sim, HOUR);
    expect(w.feature[table]).not.toBe(featureId('table'));
    expect(w.blueprint[table]).toBe(featureId('table'));
    expect(w.filth[table]).not.toBe(0);
    expect(sim.stats.smashed).toBe(1);
  });

  it('sulking, go off to bed and stay there', () => {
    const { sim, bed } = village(3);
    const c = sim.colonists[0];
    sim.startBreak(c, 'sulk', 4);
    run(sim, HOUR * 2);
    expect(c.tile).toBe(bed);
    expect(sim.describe(c)).toContain('sulking');
  });

  it('on a binge, eat far more than they need', () => {
    const { sim, w, x, y } = village(4);
    for (const i of [...w.tilesWith('items')]) {
      w.takeItem(i, w.itemCount[i]);
    }
    sim.apply({ type: 'zone', rect: { x0: x - 6, y0: y - 6, x1: x - 4, y1: y - 4 }, zone: STOCKPILE_ZONE });
    w.addItem(w.idx(x - 6, y - 6), itemId('meal'), 10);
    const c = sim.colonists[0];
    c.needs.food = 1;
    sim.startBreak(c, 'binge', 4);
    run(sim, HOUR * 4);
    expect(sim.stockOf(itemId('meal'))).toBeLessThan(8);
  });
});

describe('inspirations', () => {
  it('include a creative spark that makes the next sculpture far better, then is spent', () => {
    const { sim } = village(5);
    const c = sim.colonists[0];
    c.skills.artistic = 8;
    sim.addThought(c, 'creativeInspiration');
    const art = (sim as unknown as { finishArtwork(c: unknown, t: number, n: string): void }).finishArtwork.bind(sim);
    const tile = sim.world.idx(1, 1);
    sim.world.setFeature(tile, featureId('sculptureSmall'));
    art(c, tile, 'Small sculpture');
    expect(sim.artworks.get(tile)!.quality).toBeGreaterThanOrEqual(8 - 3 + 6);
    expect(c.thoughts.some((t) => t.key === 'creativeInspiration')).toBe(false);
  });

  it('suit the colonist: only those who could use one get it', () => {
    const { sim } = village(6);
    for (const c of sim.colonists) {
      c.skills.artistic = 0;
      c.skills.animals = 0;
    }
    for (let k = 0; k < 10; k++) {
      expect(inspire(sim)).toBe(true);
    }
    const kinds = new Set(sim.colonists.flatMap((c) => c.thoughts.map((t) => t.key)));
    expect(kinds.has('creativeInspiration')).toBe(false);
    expect(kinds.has('tamingInspiration')).toBe(false);
    expect(kinds.has('teachingInspiration')).toBe(false);
    expect(kinds.has('inspired')).toBe(true);
  });
});

describe('obsessions', () => {
  // An artist with the skill for a vision, and a stockpile with what it needs.
  function vision(seed: number, supplied: boolean) {
    const v = village(seed);
    const { sim, w, x, y } = v;
    const [artist, helper] = sim.colonists;
    artist.skills.artistic = 12;
    artist.mood = 70;
    for (const c of sim.colonists.slice(1)) {
      c.skills.artistic = 2;
      c.skills.crafting = 2;
    }
    helper.priorities.art = 1;
    helper.priorities.hauling = 1;
    sim.apply({ type: 'zone', rect: { x0: x - 7, y0: y - 7, x1: x - 4, y1: y - 4 }, zone: STOCKPILE_ZONE });
    if (supplied) {
      w.addItem(w.idx(x - 7, y - 7), itemId('stoneBlocks'), 50);
      w.addItem(w.idx(x - 6, y - 7), itemId('wood'), 50);
      w.addItem(w.idx(x - 5, y - 7), itemId('silver'), 40);
    }
    expect(startObsession(sim)).toBe(true);
    return { ...v, artist, helper };
  }

  it('seize a skilled artist, who alone carves a legendary sculpture once the materials come', () => {
    const { sim, w, artist, keepFed } = vision(7, true);
    const o = sim.obsession!;
    expect(o.colonist).toBe(artist.id);
    expect(w.blueprint[o.tile]).toBe(LEGEND);
    expect(sim.thoughtsOf(artist).map((t) => t.label)).toContain('Obsessed with a vision');
    // Saved with the colony.
    expect(deserialize(structuredClone(serialize(sim))).obsession).toEqual(o);
    keepFed(24 * 4);
    expect(w.feature[o.tile]).toBe(LEGEND);
    expect(sim.artworks.get(o.tile)!.quality).toBe(LEGEND_QUALITY);
    expect(sim.obsession).toBeNull();
    expect(sim.stats.legends).toBe(1);
    expect(sim.thoughtsOf(artist).map((t) => t.label)).toContain('Made a legend');
  });

  it('end in a breakdown if the materials never come', () => {
    const { sim, w, artist, keepFed } = vision(8, false);
    const tile = sim.obsession!.tile;
    for (const i of [...w.tilesWith('items')]) {
      if (w.itemType[i] === itemId('silver')) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    keepFed(OBSESSION_DAYS * 24 + 2);
    expect(sim.obsession).toBeNull();
    expect(w.blueprint[tile]).not.toBe(LEGEND);
    expect(artist.thoughts.some((t) => t.key === 'obsessionFailed')).toBe(true);
    expect(sim.storyLog.some((e) => e.text.includes('came to nothing'))).toBe(true);
  });
});

describe('a rage on a cold night', () => {
  it('spares the fires', () => {
    const sim = Simulation.newColony(41);
    const w = sim.world;
    const t = sim.colonists[0].tile;
    w.setFeature(t + 2, featureId('campfire'));
    w.setFeature(t + 3, featureId('chessTable'));
    expect(smashable(sim, t + 3)).toBe(true);
    // Whatever the weather now, below 5°C outside the fire is spared.
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    sim.tick = 20 * 24 * 200;
    sim.syncClock();
    expect(sim.outdoorTemperature()).toBeLessThan(5);
    expect(smashable(sim, t + 2)).toBe(false);
    expect(smashable(sim, t + 3)).toBe(true);
  });
});

describe('a sulk', () => {
  it('in a freezing bed gives up for somewhere warm rather than freezing to death', () => {
    const { sim, bed } = village(3);
    const c = sim.colonists[0];
    // The bed (and only the bed) is bitterly cold.
    const warm = sim.temperatureAt.bind(sim);
    sim.temperatureAt = (i: number) => (i === bed ? -40 : Math.max(18, warm(i)));
    sim.startBreak(c, 'sulk', 8);
    let worst = 0;
    let leftBed = false;
    for (let t = 0; t < HOUR * 8; t++) {
      sim.step();
      c.needs.food = 1;
      worst = Math.max(worst, c.health.hypothermia);
      leftBed ||= worst > 0.5 && c.tile !== bed;
    }
    expect(c.health.dead).toBe(false);
    expect(leftBed).toBe(true);
    expect(worst).toBeLessThan(0.9);
  });
});
