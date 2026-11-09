import { describe, expect, it } from 'vitest';
import { NONE, featureId } from './defs';
import { damage, updateExposure } from './health';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { WeatherKind, ignite, isWet } from './weather';

const forever = Number.MAX_SAFE_INTEGER;

describe('weather', () => {
  it('changes through the year, with no snow in summer and drought only in summer', () => {
    const sim = Simulation.newColony(1);
    const seen = new Map<string, Set<WeatherKind>>();
    for (let hour = 0; hour < 24 * 24; hour++) {
      run(sim, HOUR);
      const set = seen.get(sim.season) ?? new Set();
      set.add(sim.weather.kind);
      seen.set(sim.season, set);
    }
    const all = new Set([...seen.values()].flatMap((s) => [...s]));
    expect(all.size).toBeGreaterThan(2);
    for (const [season, kinds] of seen) {
      if (season === 'Summer') {
        expect(kinds.has('snow')).toBe(false);
      }
      if (season !== 'Summer') {
        expect(kinds.has('drought')).toBe(false);
      }
    }
    // A whole year of play: give it room on a busy machine.
  }, 20_000);

  it('soaks colonists caught outside in the rain, who feel the cold more', () => {
    const sim = Simulation.newColony(2);
    clearAround(sim, 4);
    const [wet, dry] = sim.colonists;
    sim.weather = { kind: 'clear', until: forever };
    updateExposure(sim, dry, 3);
    sim.weather = { kind: 'rain', until: forever };
    expect(isWet(sim, wet.tile)).toBe(true);
    updateExposure(sim, wet, 3);
    expect(wet.health.hypothermia).toBeGreaterThanOrEqual(dry.health.hypothermia);
    run(sim, 2);
    expect(sim.thoughtsOf(wet).some((t) => t.label === 'Caught out in the weather')).toBe(true);
  });
});

describe('fire', () => {
  function forest(seed: number) {
    const sim = Simulation.newColony(seed);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    // High summer, in a drought that won't break.
    while (sim.season !== 'Summer') {
      sim.tick += HOUR * 24;
    }
    sim.weather = { kind: 'drought', until: forever };
    return { sim, w, x, y };
  }

  it('spreads through trees and burns them down', () => {
    const { sim, w, x, y } = forest(3);
    const trees: number[] = [];
    for (let k = 0; k < 6; k++) {
      const t = w.idx(x + 8 + k, y + 8);
      w.setFeature(t, featureId('tree'));
      trees.push(t);
    }
    // Nobody fights it: everyone's off work.
    for (const c of sim.colonists) {
      c.priorities.hauling = 0;
      c.priorities.construction = 0;
    }
    expect(ignite(sim, trees[0])).toBe(true);
    run(sim, HOUR * 6);
    expect(trees.filter((t) => w.feature[t] === 0).length).toBeGreaterThan(1);
  });

  it('is put out by rain, leaving the building standing', () => {
    const { sim, w, x, y } = forest(4);
    const wall = w.idx(x + 8, y + 8);
    w.setFeature(wall, featureId('woodWall'));
    ignite(sim, wall);
    sim.weather = { kind: 'rain', until: forever };
    for (const c of sim.colonists) {
      c.priorities.hauling = 0;
      c.priorities.construction = 0;
    }
    run(sim, HOUR * 3);
    expect(sim.burning.size).toBe(0);
    expect(w.feature[wall]).toBe(featureId('woodWall'));
  });

  it('marks a building it destroys for rebuilding', () => {
    const { sim, w, x, y } = forest(10);
    sim.weather = { kind: 'clear', until: forever };
    const wall = w.idx(x + 8, y + 8);
    w.setFeature(wall, featureId('woodWall'));
    for (const c of sim.colonists) {
      c.priorities.hauling = 0;
      c.priorities.construction = 0;
    }
    ignite(sim, wall);
    run(sim, HOUR * 2);
    expect(w.feature[wall]).toBe(NONE);
    expect(w.blueprint[wall]).toBe(featureId('woodWall'));
  });

  it('gets fought by colonists when it is near home', () => {
    const { sim, w, x, y } = forest(5);
    const wall = w.idx(x + 3, y);
    w.setFeature(wall, featureId('woodWall'));
    ignite(sim, wall);
    for (let t = 0; t < HOUR && sim.burning.size > 0; t++) {
      sim.step();
    }
    expect(sim.burning.size).toBe(0);
    expect(w.feature[wall]).toBe(featureId('woodWall'));
  });

  it('wakes sleepers close by, who put it out', () => {
    const { sim, w } = forest(7);
    for (let t = 0; t < HOUR * 30 && !sim.colonists.some((c) => c.job?.type === 'sleep'); t++) {
      sim.step();
    }
    const sleeper = sim.colonists.find((c) => c.job?.type === 'sleep')!;
    expect(sleeper).toBeDefined();
    const wall = w.idx(w.xOf(sleeper.tile) + 3, w.yOf(sleeper.tile));
    w.setFeature(wall, featureId('woodWall'));
    ignite(sim, wall);
    for (let t = 0; t < HOUR && sim.burning.size > 0; t++) {
      sim.step();
    }
    expect(sim.burning.size).toBe(0);
    expect(w.feature[wall]).toBe(featureId('woodWall'));
  });

  it('goes out once whatever was burning is gone', () => {
    const { sim, w, x, y } = forest(8);
    const t = w.idx(x + 8, y + 8);
    w.setFeature(t, featureId('tree'));
    ignite(sim, t);
    w.setFeature(t, NONE);
    run(sim, 40);
    expect(sim.burning.size).toBe(0);
    expect(w.fire[t]).toBe(0);
  });

  it('leaves burns that hurt but do not bleed', () => {
    const sim = Simulation.newColony(9);
    const c = sim.colonists[0];
    damage(sim, c, 0.1, 'burn');
    expect(c.health.injuries[0].label).toBe('Burn');
    expect(c.health.injuries[0].bleeding).toBe(0);
  });

  it('does not rebuild something that was marked for taking down', () => {
    const { sim, w, x, y } = forest(11);
    const wall = w.idx(x + 8, y + 8);
    w.setFeature(wall, featureId('woodWall'));
    sim.apply({ type: 'designate', kind: 'deconstruct', rect: { x0: x + 8, y0: y + 8, x1: x + 8, y1: y + 8 } });
    w.setFeature(wall, NONE);
    sim.rebuild(wall, featureId('woodWall'));
    expect(w.blueprint[wall]).toBe(NONE);
    expect(w.designation[wall]).toBe(0);
  });

  it('waits for a raid to end before rebuilding a breach', () => {
    const { sim, w, x, y } = forest(12);
    const wall = w.idx(x + 8, y + 8);
    sim.raid = {} as NonNullable<Simulation['raid']>;
    sim.rebuild(wall, featureId('woodWall'));
    expect(w.blueprint[wall]).toBe(NONE);
    sim.raid = null;
    sim.rebuildAfterRaid();
    expect(w.blueprint[wall]).toBe(featureId('woodWall'));
  });

  it('survives a save', () => {
    const { sim, w, x, y } = forest(6);
    const t = w.idx(x + 8, y + 8);
    w.setFeature(t, featureId('tree'));
    ignite(sim, t);
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.weather.kind).toBe('drought');
    expect(copy.burning.has(t)).toBe(true);
    expect(copy.world.fire[t]).toBeCloseTo(w.fire[t]);
  });
});

describe('third audit: fire and weather', () => {
  it("leaves torches and graves alone: one is a fire already, the other mustn't forget who lies there", () => {
    const sim = Simulation.newColony(41);
    const w = sim.world;
    const { x, y } = clearAround(sim, 8);
    const torch = w.idx(x + 3, y);
    const grave = w.idx(x - 3, y);
    w.setFeature(torch, featureId('torch'));
    w.setFeature(grave, featureId('grave'));
    expect(ignite(sim, torch)).toBe(false);
    expect(ignite(sim, grave)).toBe(false);
  });

  it('rain puts out a burning door as it does a wall', () => {
    const sim = Simulation.newColony(42);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    for (const i of outline(w, x + 2, y - 2, x + 6, y + 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    const door = w.idx(x + 2, y);
    w.setFeature(door, featureId('door'));
    sim.weather = { kind: 'rain', until: forever };
    for (const c of sim.colonists) {
      c.priorities.hauling = 0;
      c.priorities.construction = 0;
    }
    expect(ignite(sim, door)).toBe(true);
    run(sim, HOUR * 1.4);
    expect(w.feature[door]).toBe(featureId('door'));
    expect(w.fire[door]).toBe(0);
  });

  it("doesn't start snow on a mild day", () => {
    let warmSnow = 0;
    for (const seed of [1, 2, 3]) {
      const sim = Simulation.newColony(seed);
      for (let h = 0; h < 24 * 40; h++) {
        const before = sim.weather.kind;
        run(sim, HOUR);
        if (sim.weather.kind === 'snow' && before !== 'snow' && sim.outdoorTemperature() + 1 > 3) {
          warmSnow++;
        }
      }
    }
    expect(warmSnow).toBe(0);
  });

  it('wakes a sleeper whose bed catches fire, whoever they are', () => {
    const sim = Simulation.newColony(43);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    const bed = w.idx(x + 3, y);
    w.setFeature(bed, featureId('bed'));
    const c = sim.colonists[0];
    c.age = 8;
    c.tile = bed;
    c.needs.rest = 0.2;
    sim.tick = (22 - 7) * HOUR;
    sim.syncClock();
    run(sim, 30);
    expect(ignite(sim, bed)).toBe(true);
    run(sim, HOUR / 2);
    expect(c.tile).not.toBe(bed);
  });

  it('keeps the warmth beside a hearth in summer to a little over what a heater keeps a room', () => {
    const sim = Simulation.newColony(44, 'standard', 64, { biome: 'desert' });
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    const fire = w.idx(x + 3, y);
    w.setFeature(fire, featureId('campfire'));
    w.fuel[fire] = 20;
    sim.tick = 8 * 24 * HOUR + 7 * HOUR;
    sim.syncClock();
    const beside = w.idx(x + 4, y);
    const t = sim.temperatureAt(beside);
    expect(t).toBeLessThanOrEqual(Math.max(27, sim.temperatureAt(w.idx(x - 6, y)) + 0.01));
  });
});

describe('stepping out of a fire', () => {
  const setup = () => {
    const sim = Simulation.newColony(45);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    const bed = w.idx(x + 3, y);
    w.setFeature(bed, featureId('bed'));
    expect(ignite(sim, bed)).toBe(true);
    const c = sim.colonists[0];
    c.tile = bed;
    sim.tick -= sim.tick % 20;
    const step = () => (sim as unknown as { stepOutOfFire(c: unknown): boolean }).stepOutOfFire(c);
    return { sim, c, bed, step };
  };

  it("isn't for someone carrying the hurt out (they'd drop the patient back in the flames)", () => {
    const { c, step } = setup();
    c.job = { type: 'rescue', stage: 1 } as unknown as typeof c.job;
    expect(step()).toBe(false);
  });

  it('is for anyone else lying there, sulking included', () => {
    const { sim, c, bed, step } = setup();
    sim.startBreak(c, 'sulk', 4);
    c.path = [];
    expect(step()).toBe(true);
    expect(c.path.length + (c.tile === bed ? 0 : 1)).toBeGreaterThan(0);
  });
});
