import { describe, expect, it } from 'vitest';
import { featureId } from './defs';
import { Simulation, START_HOUR } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';

// A cleared patch where everyone is off work and bored, with nothing else to do.
function park(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  for (const c of sim.colonists) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 0.1;
    c.schedule.fill('J');
  }
  return { sim, w, x, y };
}

const thoughtLabels = (sim: Simulation, i = 0) => sim.thoughtsOf(sim.colonists[i]).map((t) => t.label);

describe('recreation tolerance', () => {
  it('gets less out of a kind of recreation had a lot of lately', () => {
    const { sim } = park(1);
    const c = sim.colonists[0];
    expect(sim.joyEfficiency(c, 'relaxing')).toBe(1);
    // A fair share costs nothing; past it, less and less.
    c.recentJoy.relaxing = 0.4;
    expect(sim.joyEfficiency(c, 'relaxing')).toBe(1);
    c.recentJoy.relaxing = 2;
    expect(sim.joyEfficiency(c, 'relaxing')).toBeLessThan(0.6);
    expect(sim.joyEfficiency(c, 'gaming')).toBe(1);
    c.recentJoy.relaxing = 50;
    expect(sim.joyEfficiency(c, 'relaxing')).toBeGreaterThanOrEqual(0.25);
  });

  it('picks a different kind over one they have had their fill of', () => {
    const { sim, w, x, y } = park(2);
    w.setFeature(w.idx(x + 3, y), featureId('armchair'));
    w.setFeature(w.idx(x - 3, y), featureId('horseshoePin'));
    const c = sim.colonists[0];
    c.recentJoy.relaxing = 3;
    for (const o of sim.colonists.slice(1)) {
      o.schedule.fill('W');
      o.needs.joy = 1;
    }
    for (let t = 0; t < HOUR && c.job?.target !== w.idx(x - 3, y); t++) {
      sim.step();
    }
    expect(c.job?.target).toBe(w.idx(x - 3, y));
  });

  it('feels varied recreation, and tires of only ever one kind', () => {
    const { sim } = park(3);
    const c = sim.colonists[0];
    c.recentJoy = { relaxing: 0.5, gaming: 0.4, outdoor: 0.3 };
    expect(thoughtLabels(sim)).toContain('Varied recreation');
    // Only walks so far, on a fresh landing: no complaint.
    c.recentJoy = { outdoor: 1.2 };
    expect(thoughtLabels(sim)).not.toContain('Same old thing for fun');
    // Once there's something built for fun, only ever one kind gets old.
    sim.world.setFeature(sim.world.idx(5, 5), featureId('horseshoePin'));
    c.recentJoy = { gaming: 1.2, outdoor: 0.05 };
    expect(thoughtLabels(sim)).toContain('Same old thing for fun');
  });
});

describe('games for two', () => {
  it('sit two colonists down to chess, talking as they play', () => {
    const { sim, w, x, y } = park(4);
    w.setFeature(w.idx(x + 3, y), featureId('chessTable'));
    const [a, b] = sim.colonists;
    for (const o of sim.colonists.slice(2)) {
      o.schedule.fill('W');
      o.needs.joy = 1;
    }
    const before = (a.opinions[b.id] ?? 0) + (b.opinions[a.id] ?? 0);
    let together = 0;
    for (let t = 0; t < HOUR * 3; t++) {
      sim.step();
      if (
        a.job?.target === w.idx(x + 3, y) &&
        b.job?.target === w.idx(x + 3, y) &&
        a.path.length + b.path.length === 0
      ) {
        together++;
      }
    }
    expect(together).toBeGreaterThan(HOUR / 2);
    expect(sim.stats.chessGames ?? 0).toBeGreaterThan(0);
    expect((a.recentJoy.gaming ?? 0) + (b.recentJoy.gaming ?? 0)).toBeGreaterThan(0.3);
    const after = (a.opinions[b.id] ?? 0) + (b.opinions[a.id] ?? 0);
    expect(after).not.toBe(before);
  });

  it('are much less fun alone', () => {
    const solo = park(5);
    solo.w.setFeature(solo.w.idx(solo.x + 3, solo.y), featureId('chessTable'));
    const c = solo.sim.colonists[0];
    for (const o of solo.sim.colonists.slice(1)) {
      o.schedule.fill('W');
      o.needs.joy = 1;
    }
    run(solo.sim, HOUR);
    // With nobody to play, a walk is the better choice.
    expect(c.job?.target ?? -1).not.toBe(solo.w.idx(solo.x + 3, solo.y));
  });

  it("don't seat rivals at the same table", () => {
    const { sim, w, x, y } = park(6);
    const table = w.idx(x + 3, y);
    w.setFeature(table, featureId('chessTable'));
    const [a, b] = sim.colonists;
    a.opinions[b.id] = -60;
    b.opinions[a.id] = -60;
    for (const o of sim.colonists.slice(2)) {
      o.schedule.fill('W');
      o.needs.joy = 1;
    }
    for (let t = 0; t < HOUR * 2; t++) {
      sim.step();
      expect(a.job?.target === table && b.job?.target === table).toBe(false);
    }
  });
});

describe('stargazing', () => {
  it('happens on clear nights under the open sky, not by day or under a roof', () => {
    const { sim, w, x, y } = park(7);
    const scope = w.idx(x + 3, y);
    w.setFeature(scope, featureId('telescope'));
    const c = sim.colonists[0];
    for (const o of sim.colonists.slice(1)) {
      o.schedule.fill('W');
      o.needs.joy = 1;
    }
    // Midday: nobody stargazes.
    run(sim, HOUR * 2);
    expect(sim.colonists.some((o) => o.job?.target === scope)).toBe(false);
    // Night.
    sim.tick = (24 + 22 - START_HOUR) * HOUR;
    sim.syncClock();
    c.needs.joy = 0.1;
    let gazed = false;
    for (let t = 0; t < HOUR * 3 && !gazed; t++) {
      sim.step();
      gazed = (c.recentJoy.outdoor ?? 0) > 0 && thoughtLabels(sim).includes('Gazed at the stars');
    }
    expect(gazed).toBe(true);
    expect(sim.isNight()).toBe(true);
  });
});

describe('nature walks', () => {
  it('do more good among trees than across bare ground', () => {
    const gain = (trees: boolean) => {
      const { sim, w, x, y } = park(8);
      if (trees) {
        for (let dy = -10; dy <= 10; dy++) {
          for (let dx = -10; dx <= 10; dx++) {
            if ((dx + dy) % 2 === 0 && w.inBounds(x + dx, y + dy)) {
              w.setFeature(w.idx(x + dx, y + dy), featureId('tree'));
            }
          }
        }
      }
      const c = sim.colonists[0];
      for (const o of sim.colonists.slice(1)) {
        o.schedule.fill('W');
      }
      run(sim, HOUR);
      return c.recentJoy.outdoor ?? 0;
    };
    expect(gain(true)).toBeGreaterThan(gain(false));
  });
});
