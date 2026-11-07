import { describe, expect, it } from 'vitest';
import { plunder } from './combat';
import { NONE, featureId, itemId } from './defs';
import { damage } from './health';
import { deserialize, serialize } from './serialize';
import { START_HOUR, Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { HOUR, clearAround, outline, run } from './test-helpers';

// Regression tests for problems found by playtesting.

describe('downed colonists', () => {
  it('get food brought to them', () => {
    const sim = Simulation.newColony(3);
    run(sim, HOUR);
    const patient = sim.colonists[0];
    damage(sim, patient, 0.45, 'cut');
    damage(sim, patient, 0.45, 'cut');
    expect(patient.health.downed).toBe(true);
    patient.needs.food = 0.1;
    run(sim, HOUR * 4);
    expect(patient.needs.food).toBeGreaterThan(0.3);
  });
});

describe('raids', () => {
  it('still come for a colony that walls itself in, and break through', () => {
    const sim = Simulation.newColony(5);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    const ring = outline(w, x - 2, y - 2, x + 2, y + 2);
    // Nothing lying about (the landing's timber and rations) to tempt the raiders instead.
    for (const i of [...w.tilesWith('items')]) {
      if (w.distance(i, w.idx(x, y)) < 8) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    for (const t of ring) {
      w.setFeature(t, featureId('woodWall'));
    }
    sim.colonists.forEach((c, k) => {
      c.tile = w.idx(x - 1 + (k % 3), y - 1 + Math.floor(k / 3));
      c.path = [];
      c.job = null;
    });
    run(sim, 1);
    expect(triggerEvent(sim, 'raid')).toBe(true);
    run(sim, HOUR * 8);
    expect(ring.some((t) => w.feature[t] === NONE)).toBe(true);
  });

  it('find the built wall of a room backed by natural rock', () => {
    const sim = Simulation.newColony(5);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    const ring = outline(w, x - 2, y - 2, x + 2, y + 2);
    // Nothing lying about (the landing's timber and rations) to tempt the raiders instead.
    for (const i of [...w.tilesWith('items')]) {
      if (w.distance(i, w.idx(x, y)) < 8) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    // The north side is a solid rock face, three tiles thick.
    for (let dy = -4; dy <= -2; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        w.setFeature(w.idx(x + dx, y + dy), featureId('rock'));
      }
    }
    const walls = ring.filter((t) => w.feature[t] === NONE);
    for (const t of walls) {
      w.setFeature(t, featureId('woodWall'));
    }
    sim.colonists.forEach((c, k) => {
      c.tile = w.idx(x - 1 + (k % 3), y - 1 + Math.floor(k / 3));
      c.path = [];
      c.job = null;
    });
    run(sim, 1);
    expect(triggerEvent(sim, 'raid')).toBe(true);
    run(sim, HOUR * 8);
    expect(walls.some((t) => w.feature[t] === NONE)).toBe(true);
  });
});

describe('generators', () => {
  it('save fuel when nothing needs the power', () => {
    const sim = Simulation.newColony(8);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    const generator = w.idx(x + 6, y);
    w.setFeature(generator, featureId('woodGenerator'));
    w.setFeature(w.idx(x + 6, y + 2), featureId('battery'));
    w.fuel[generator] = 40;
    run(sim, 1);
    sim.power.stored = 8000;
    run(sim, HOUR);
    expect(w.fuel[generator]).toBe(40);
  });
});

describe('gap audit fixes', () => {
  it('lets raiders carry off only 30% of each kind of loot', () => {
    const sim = Simulation.newColony(11);
    const w = sim.world;
    const { x, y } = clearAround(sim, 8);
    for (let k = 0; k < 10; k++) {
      w.addItem(w.idx(x - 5 + k, y + 4), itemId('meal'), 1);
    }
    const before = sim.stockOf(itemId('meal'));
    plunder(sim);
    expect(before - sim.stockOf(itemId('meal'))).toBe(Math.floor(before * 0.3));
  });

  it('keeps the quality of items pushed aside by construction', () => {
    const sim = Simulation.newColony(12);
    const w = sim.world;
    const { x, y } = clearAround(sim, 8);
    const tile = w.idx(x + 3, y);
    w.addItem(tile, itemId('parka'), 1, 1, 18);
    w.dropItemNear(w.idx(x, y + 3), itemId('wood'), 20);
    sim.apply({ type: 'build', feature: featureId('woodWall'), tiles: [tile] });
    run(sim, HOUR * 4);
    expect(w.feature[tile]).toBe(featureId('woodWall'));
    // It's either still lying beside the wall or someone has put it on.
    const tile18 = [...w.itemType.keys()].find((i) => w.itemType[i] === itemId('parka'));
    const worn = sim.colonists.find((c) => c.apparel?.item === itemId('parka'))?.apparel;
    expect(tile18 !== undefined ? w.quality[tile18] : worn?.quality).toBeCloseTo(18);
  });

  it('saves wall damage and clears it when the wall changes', () => {
    const sim = Simulation.newColony(13);
    const w = sim.world;
    const { x, y } = clearAround(sim, 8);
    const tile = w.idx(x + 3, y);
    w.setFeature(tile, featureId('woodWall'));
    w.damage[tile] = 40;
    expect(deserialize(structuredClone(serialize(sim))).world.damage[tile]).toBe(40);
    w.setFeature(tile, NONE);
    w.setFeature(tile, featureId('woodWall'));
    expect(w.damage[tile]).toBe(0);
  });

  it('lets a downed colonist crawl to shelter when no doctor is on hand', () => {
    const sim = Simulation.newColony(14);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    for (const t of outline(w, x + 4, y - 2, x + 8, y + 2)) {
      w.setFeature(t, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 4, y), featureId('door'));
    for (const c of sim.colonists) {
      c.priorities.doctor = 0;
    }
    const patient = sim.colonists[0];
    patient.tile = w.idx(x - 2, y);
    while (!patient.health.downed) {
      damage(sim, patient, 0.3, 'bruise');
    }
    expect(patient.health.downed).toBe(true);
    run(sim, HOUR * 6);
    expect(sim.isIndoors(patient.tile)).toBe(true);
  });

  it("doesn't keep carrying a patient around a room that is cold everywhere", () => {
    const sim = Simulation.newColony(15);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    for (const t of outline(w, x + 4, y - 3, x + 9, y + 3)) {
      w.setFeature(t, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 4, y), featureId('door'));
    const patient = sim.colonists[0];
    patient.tile = w.idx(x + 6, y);
    patient.apparel = null;
    while (!patient.health.downed) {
      damage(sim, patient, 0.3, 'bruise');
    }
    // Deep winter, so the unheated room is cold everywhere.
    for (let h = 0; h < 24 * 24; h++) {
      sim.tick = (h - START_HOUR) * HOUR;
      if (sim.outdoorTemperature() < -5) {
        break;
      }
    }
    let carries = 0;
    const log = sim.addLog.bind(sim);
    sim.addLog = (text, tone, story) => {
      if (text.includes('carried')) {
        carries++;
      }
      log(text, tone, story);
    };
    run(sim, HOUR * 6);
    expect(carries).toBeLessThanOrEqual(1);
  });

  it('has raiders fight back against a tame guard boar', () => {
    const sim = Simulation.newColony(16);
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    const boar = sim.animals[0];
    boar.kind = 'boar';
    boar.tame = true;
    const before = boar.hp;
    expect(triggerEvent(sim, 'raid')).toBe(true);
    // Hold the two together, well away from the colonists' bows.
    const raider = sim.enemies[0];
    for (let t = 0; t < 400; t++) {
      boar.tile = w.idx(x + 12, y + 12);
      boar.path = [];
      raider.tile = w.idx(x + 13, y + 12);
      raider.path = [];
      run(sim, 1);
    }
    expect(boar.hp).toBeLessThan(before);
  });
});
