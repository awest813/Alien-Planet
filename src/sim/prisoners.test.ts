import { describe, expect, it } from 'vitest';
import { woundEnemy } from './combat';
import { featureId, itemId } from './defs';
import { DOWNED_TICKS, STARVE_HOURS, prisoners } from './prisoners';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { Captive, Enemy, WORK_TYPES } from './types';
import { STOCKPILE_ZONE } from './world';

// A cleared patch with a closed hut holding a prisoner bed, everyone fed and rested, no events, and
// nobody working; the first colonist can be made a warden.
function camp(seed: number) {
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
    for (const work of WORK_TYPES) {
      c.priorities[work] = 0;
    }
  }
  for (const i of outline(w, x + 2, y - 3, x + 8, y + 3)) {
    w.setFeature(i, featureId('woodWall'));
  }
  w.setFeature(w.idx(x + 2, y), featureId('door'));
  const bed = w.idx(x + 5, y);
  w.setFeature(bed, featureId('prisonerBed'));
  const warden = sim.colonists[0];
  warden.priorities.warden = 1;
  warden.mood = 60;
  return { sim, w, x, y, bed, warden };
}

// A raider lying wounded on a tile.
function downed(sim: Simulation, tile: number, extra: Partial<Captive> = {}): Captive {
  const p: Captive = {
    id: 900 + sim.captives.length,
    name: `Captive ${sim.captives.length}`,
    faction: 0,
    tile,
    state: 'downed',
    capture: false,
    since: sim.tick,
    food: 0.6,
    resistance: 2,
    skill: 7,
    lastVisit: 0,
    hungryHours: 0,
    ...extra,
  };
  sim.captives.push(p);
  return p;
}

// Keeps the colonists fed and rested while a long test runs.
function days(sim: Simulation, n: number) {
  for (let h = 0; h < n * 24; h++) {
    for (const c of sim.living()) {
      c.needs.food = 1;
      c.needs.rest = 1;
      c.needs.joy = 1;
    }
    run(sim, HOUR);
  }
}

describe('downed raiders', () => {
  it('sometimes fall wounded instead of dying when brought down', () => {
    const sim = Simulation.newColony(1);
    let wounded = 0;
    for (let k = 0; k < 40; k++) {
      const e = { id: k, name: `R${k}`, faction: 0, tile: sim.colonists[0].tile, hp: 0.1, skill: 4 } as Enemy;
      woundEnemy(sim, e, 1, 'Test');
      wounded = sim.captives.length;
    }
    expect(wounded).toBeGreaterThan(5);
    expect(wounded).toBeLessThan(35);
    expect(sim.captives.every((p) => p.state === 'downed' && !p.capture)).toBe(true);
  });

  it('die of their wounds if nobody takes them in', () => {
    const { sim, x, y } = camp(2);
    const p = downed(sim, sim.world.idx(x - 4, y));
    run(sim, DOWNED_TICKS - HOUR);
    expect(sim.captives).toContain(p);
    run(sim, HOUR * 2);
    expect(sim.captives).toEqual([]);
  });

  it('are carried to a prisoner bed once marked for capture, but not while raiders fight on', () => {
    const { sim, w, x, y, bed } = camp(3);
    const p = downed(sim, w.idx(x - 4, y + 2));
    run(sim, HOUR);
    expect(p.state).toBe('downed');
    sim.apply({ type: 'capture', rect: { x0: x - 5, y0: y + 1, x1: x - 3, y1: y + 3 }, add: true });
    expect(p.capture).toBe(true);
    // A raider still on their feet keeps everyone away.
    sim.enemies.push({ id: 1, name: 'Holdout', hp: 1, fleeing: false, tile: w.idx(0, 0) } as Enemy);
    expect((sim as unknown as { tryCapture(c: unknown): boolean }).tryCapture(sim.colonists[0])).toBe(false);
    sim.enemies = [];
    run(sim, HOUR * 3);
    expect(p.state).toBe('prisoner');
    expect(p.tile).toBe(bed);
    expect(sim.stats.captured).toBe(1);
  });

  it('stay where they are if the order is called off on the way', () => {
    const { sim, w, x, y } = camp(10);
    const p = downed(sim, w.idx(x - 6, y + 4), { capture: true });
    for (let t = 0; t < HOUR && sim.colonists[0].job?.type !== 'capture'; t++) {
      sim.step();
    }
    expect(sim.colonists[0].job?.type).toBe('capture');
    sim.apply({ type: 'capture', rect: { x0: 0, y0: 0, x1: w.width - 1, y1: w.height - 1 }, add: false });
    run(sim, HOUR * 3);
    expect(p.state).toBe('downed');
  });

  it('are moved aside when a wall goes up where they lie', () => {
    const { sim, w, x, y } = camp(11);
    const tile = w.idx(x - 4, y + 4);
    const p = downed(sim, tile);
    sim.apply({ type: 'build', feature: featureId('woodWall'), tiles: [tile] });
    w.dropItemNear(w.idx(x - 6, y + 6), itemId('wood'), 20);
    sim.colonists[1].priorities.construction = 1;
    sim.colonists[1].priorities.hauling = 1;
    run(sim, HOUR * 4);
    expect(w.feature[tile]).toBe(featureId('woodWall'));
    expect(p.tile).not.toBe(tile);
    expect(w.isPassable(p.tile)).toBe(true);
  });

  it('wait for a free prisoner bed', () => {
    const { sim, w, x, y, bed } = camp(4);
    downed(sim, bed, { state: 'prisoner' });
    const p = downed(sim, w.idx(x - 4, y), { capture: true });
    run(sim, HOUR * 3);
    expect(p.state).toBe('downed');
  });
});

describe('prisoners', () => {
  it('are fed, talked round and won over to join the colony', () => {
    const { sim, w, x, y, bed, warden } = camp(5);
    sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y - 6, x1: x - 2, y1: y - 5 }, zone: STOCKPILE_ZONE });
    w.addItem(w.idx(x - 4, y - 6), itemId('meal'), 10);
    const p = downed(sim, bed, { state: 'prisoner', food: 0.2, resistance: 2 });
    const before = sim.colonists.length;
    days(sim, 1);
    expect(p.food).toBeGreaterThan(0.4);
    expect(p.lastVisit).toBeGreaterThan(0);
    days(sim, 8);
    expect(sim.captives).toEqual([]);
    expect(sim.colonists.length).toBe(before + 1);
    const recruit = sim.colonists.at(-1)!;
    expect(recruit.name.startsWith(p.name)).toBe(true);
    expect(recruit.skills.combat).toBeGreaterThanOrEqual(7);
    expect(sim.stats.recruited).toBe(1);
    expect(sim.objectivesDone.recruit).toBe(true);
    expect(warden.health.dead).toBe(false);
  });

  it('are still visited while another goes hungry with no food to be had', () => {
    const { sim, w, x, y, bed } = camp(12);
    for (const i of [...w.tilesWith('items')]) {
      w.takeItem(i, w.itemCount[i]);
    }
    const second = w.idx(x + 6, y);
    w.setFeature(second, featureId('prisonerBed'));
    downed(sim, bed, { state: 'prisoner', food: 0.1, lastVisit: sim.tick });
    const fed = downed(sim, second, { state: 'prisoner', food: 1, resistance: 9 });
    days(sim, 1);
    expect(fed.lastVisit).toBeGreaterThan(0);
    expect(fed.resistance).toBeLessThan(9);
  });

  it('starve if nobody feeds them', () => {
    const { sim, bed, warden } = camp(6);
    warden.priorities.warden = 0;
    downed(sim, bed, { state: 'prisoner', food: 0 });
    run(sim, HOUR * (STARVE_HOURS - 2));
    expect(prisoners(sim)).toHaveLength(1);
    run(sim, HOUR * 3);
    expect(prisoners(sim)).toHaveLength(0);
  });

  it('slip away if their bed is taken down', () => {
    const { sim, w, bed } = camp(9);
    downed(sim, bed, { state: 'prisoner' });
    w.setFeature(bed, 0);
    run(sim, HOUR);
    expect(sim.captives).toEqual([]);
  });

  it('can be let go', () => {
    const { sim, bed } = camp(7);
    const p = downed(sim, bed, { state: 'prisoner' });
    sim.apply({ type: 'release', captive: p.id });
    expect(sim.captives).toEqual([]);
    expect(sim.storyLog.at(-1)!.text).toContain('released');
  });

  it('are saved with the colony', () => {
    const { sim, bed, x, y } = camp(8);
    downed(sim, bed, { state: 'prisoner', resistance: 3.5 });
    downed(sim, sim.world.idx(x - 3, y), { capture: true });
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.captives).toEqual(sim.captives);
  });
});
