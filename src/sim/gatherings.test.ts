import { describe, expect, it } from 'vitest';
import { featureId, itemId } from './defs';
import { checkHealth } from './health';
import { triggerEvent } from './storyteller';
import { deserialize, serialize } from './serialize';
import { Simulation, START_HOUR } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { WORK_TYPES } from './types';
import { STOCKPILE_ZONE } from './world';

const DAY = HOUR * 24;

// A cleared patch, everyone fed and rested and free in the evenings, no events.
function village(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 14);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  for (const c of sim.colonists) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 0.6;
    for (const work of WORK_TYPES) {
      c.priorities[work] = 0;
    }
    c.schedule.fill('A');
  }
  // A hut, so there's a home and somewhere to gather.
  w.setFeature(w.idx(x + 6, y + 6), featureId('woodWall'));
  return { sim, w, x, y };
}

// Sets the clock to `hour` on a given day of the colony (day 1 is the landing day).
function at(sim: Simulation, day: number, hour: number) {
  sim.tick = (day - 1) * DAY + (hour - START_HOUR) * HOUR;
  sim.syncClock();
}

function kill(sim: Simulation, index: number) {
  const c = sim.colonists[index];
  c.health.bloodLoss = 1;
  checkHealth(sim, c);
  return c;
}

const has = (sim: Simulation, i: number, key: string) => sim.colonists[i].thoughts.some((t) => t.key === key);

describe('funerals', () => {
  it('lay the fallen to rest in a grave, easing the mourners’ grief', () => {
    const { sim, w, x, y } = village(1);
    at(sim, 2, 9);
    const dead = kill(sim, 2);
    expect(sim.unburied.map((f) => f.name)).toEqual([dead.name]);
    expect(sim.thoughtsOf(sim.colonists[0]).map((t) => t.label)).toContain('One of us lies unburied');
    const grief = () => sim.colonists[0].thoughts.find((t) => t.key === 'colonistDied' || t.key === 'friendDied');
    const before = grief()!.expires - sim.tick;
    const grave = w.idx(x - 4, y);
    w.setFeature(grave, featureId('grave'));
    run(sim, HOUR * 4);
    expect(sim.graves.get(grave)?.name).toBe(dead.name);
    expect(sim.unburied).toEqual([]);
    expect(sim.stats.funerals).toBe(1);
    expect(has(sim, 0, 'saidGoodbye')).toBe(true);
    expect(grief()!.expires - sim.tick).toBeLessThan(before / 2 + 1);
    // Saved with the colony.
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.graves.get(grave)?.name).toBe(dead.name);
  });

  it('wait for a grave, and are held by day', () => {
    const { sim, w, x, y } = village(2);
    at(sim, 2, 21);
    kill(sim, 2);
    w.setFeature(w.idx(x - 4, y), featureId('grave'));
    run(sim, HOUR * 3);
    expect(sim.gathering).toBeNull();
    run(sim, HOUR * 12);
    expect(sim.stats.funerals).toBe(1);
  });
});

describe('weddings', () => {
  it('marry devoted lovers in the evening, with everyone there', () => {
    const { sim } = village(3);
    const [a, b] = sim.colonists;
    a.lover = b.id;
    b.lover = a.id;
    a.opinions[b.id] = 90;
    b.opinions[a.id] = 90;
    at(sim, 2, 5);
    let planned = false;
    for (let d = 0; d < 20 && !planned; d++) {
      // Nobody works in this test: keep everyone fed and rested while we wait.
      for (const c of sim.colonists) {
        c.needs.food = 1;
        c.needs.rest = 1;
      }
      run(sim, HOUR * 2);
      planned = sim.gathering?.kind === 'wedding';
      if (!planned) {
        run(sim, DAY - HOUR * 2);
      }
    }
    expect(planned).toBe(true);
    expect(sim.gatheringNotice()).toContain('17:00');
    run(sim, HOUR * 15);
    expect(a.spouse).toBe(b.id);
    expect(b.spouse).toBe(a.id);
    expect(has(sim, 0, 'gotMarried')).toBe(true);
    expect(has(sim, 2, 'attendedWedding')).toBe(true);
    expect(sim.thoughtsOf(a).map((t) => t.label)).toContain('Married');
    expect(sim.objectivesDone.wedding).toBe(true);
  });

  it('are called off by a raid', () => {
    const { sim, x, y, w } = village(4);
    at(sim, 2, 16);
    sim.gathering = {
      kind: 'wedding',
      tile: w.idx(x, y + 2),
      startsAt: sim.tick + HOUR,
      endsAt: sim.tick + HOUR * 3,
      host: -1,
      couple: [0, 1],
    };
    expect(triggerEvent(sim, 'raid')).toBe(true);
    run(sim, HOUR * 2);
    expect(sim.gathering).toBeNull();
    expect(sim.colonists[0].spouse).toBe(-1);
  });
});

describe('festivals', () => {
  // Day 14 is the fourth day of autumn on a new colony's calendar.
  const HARVEST_DAY = 14;

  it('make a feast of the harvest when there are meals in store', () => {
    const { sim, w, x, y } = village(5);
    sim.apply({ type: 'zone', rect: { x0: x - 3, y0: y + 3, x1: x - 1, y1: y + 4 }, zone: STOCKPILE_ZONE });
    w.addItem(w.idx(x - 3, y + 3), itemId('meal'), 10);
    at(sim, HARVEST_DAY, 5);
    expect(sim.season).toBe('Autumn');
    const meals = sim.stockOf(itemId('meal'));
    run(sim, HOUR * 2);
    expect(sim.gathering?.kind).toBe('harvestFestival');
    run(sim, HOUR * 15);
    expect(sim.stats.feasts).toBe(1);
    expect(has(sim, 0, 'harvestFeast')).toBe(true);
    expect(sim.stockOf(itemId('meal'))).toBeLessThan(meals);
  });

  it('can be turned off', () => {
    const { sim } = village(6);
    sim.apply({ type: 'festivals', on: false });
    at(sim, HARVEST_DAY, 5);
    run(sim, HOUR * 15);
    expect(sim.stats.feasts ?? 0).toBe(0);
    expect(sim.gathering?.kind).not.toBe('harvestFestival');
  });
});

describe('parties', () => {
  it('are thrown on an evening by someone in good spirits', () => {
    const { sim } = village(7);
    for (const c of sim.colonists) {
      c.mood = 80;
    }
    let partied = false;
    for (let d = 2; d < 12 && !partied; d++) {
      at(sim, d, 17);
      for (const c of sim.colonists) {
        c.mood = 80;
        c.needs.food = 1;
        c.needs.rest = 1;
      }
      run(sim, HOUR * 6);
      partied = (sim.stats.parties ?? 0) > 0;
    }
    expect(partied).toBe(true);
    expect(sim.colonists.some((c) => c.thoughts.some((t) => t.key === 'attendedParty'))).toBe(true);
  });
});

describe('memorials', () => {
  it('are carved with the names of the fallen, who are then remembered', () => {
    const { sim, w, x, y } = village(8);
    at(sim, 2, 9);
    const dead = kill(sim, 2);
    const [artist] = sim.colonists;
    artist.priorities.art = 1;
    artist.priorities.hauling = 1;
    artist.skills.artistic = 8;
    w.dropItemNear(w.idx(x - 5, y - 5), itemId('stone'), 60);
    const spot = w.idx(x + 3, y - 3);
    sim.apply({ type: 'build', feature: featureId('memorial'), tiles: [spot] });
    run(sim, HOUR * 20);
    const art = sim.artworkAt(spot)!;
    expect(art.title).toBe(`In Memory of ${dead.name}`);
    expect(art.honors).toEqual([dead.id]);
    expect(sim.thoughtsOf(sim.colonists[1]).map((t) => t.label)).toContain('The fallen are remembered');
    expect(sim.objectivesDone.memorial).toBe(true);
  });
});

describe('gathering edge cases', () => {
  it("don't let a party take the place of a funeral planned that evening", () => {
    const { sim, w, x, y } = village(9);
    for (const c of sim.colonists) {
      c.mood = 90;
    }
    at(sim, 2, 18);
    kill(sim, 2);
    w.setFeature(w.idx(x - 4, y), featureId('grave'));
    for (let t = 0; t < HOUR && sim.gathering?.kind !== 'funeral'; t++) {
      sim.step();
    }
    expect(sim.gathering?.kind).toBe('funeral');
    for (let t = 0; t < HOUR / 2; t++) {
      sim.step();
      expect(sim.gathering?.kind).toBe('funeral');
    }
  });

  it('start funerals on the hour, as the notice says', () => {
    const { sim, w, x, y } = village(10);
    at(sim, 2, 9);
    sim.tick += Math.round(HOUR * 0.7);
    sim.syncClock();
    kill(sim, 2);
    w.setFeature(w.idx(x - 4, y), featureId('grave'));
    run(sim, 40);
    const g = sim.gathering!;
    expect(g.kind).toBe('funeral');
    expect(sim.gatheringNotice()).toContain('11:00');
    expect((g.startsAt - (2 - 1) * DAY - (11 - START_HOUR) * HOUR) % HOUR).toBe(0);
  });

  it('call off a wedding if the couple break up before it', () => {
    const { sim, x, y, w } = village(11);
    const [a, b] = sim.colonists;
    a.lover = b.id;
    b.lover = a.id;
    at(sim, 2, 16);
    sim.gathering = {
      kind: 'wedding',
      tile: w.idx(x, y + 2),
      startsAt: sim.tick + HOUR,
      endsAt: sim.tick + HOUR * 3,
      host: -1,
      couple: [a.id, b.id],
    };
    a.lover = -1;
    b.lover = -1;
    run(sim, HOUR * 4);
    expect(a.spouse).toBe(-1);
    expect(sim.stats.weddings ?? 0).toBe(0);
  });

  it('treat a grave rebuilt where an old one stood as empty', () => {
    const { sim, w, x, y } = village(12);
    const tile = w.idx(x - 4, y);
    w.setFeature(tile, featureId('grave'));
    sim.graves.set(tile, { id: 7, name: 'Old', day: 1, cause: 'age' });
    expect(sim.emptyGrave()).toBeUndefined();
    w.setFeature(tile, 0);
    run(sim, 40);
    w.setFeature(tile, featureId('grave'));
    expect(sim.emptyGrave()).toBe(tile);
    expect(sim.graveAt(tile)).toBeUndefined();
  });
});
