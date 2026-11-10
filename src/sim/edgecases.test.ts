import { describe, expect, it } from 'vitest';
import { inHospitalBed } from './body';
import { NONE, featureId, itemId } from './defs';
import { damage, die } from './health';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { ignite } from './weather';

// A quiet colony on cleared ground, with nothing lying about.
function quiet(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  for (const i of [...w.tilesWith('items')]) {
    w.takeItem(i, w.itemCount[i]);
  }
  return { sim, w, x, y };
}

// A hut with an ordinary bed by the door and two hospital beds at the back; one colonist collapses.
function infirmary(where: 'outdoors' | 'indoors') {
  const { sim, w, x, y } = quiet(5);
  for (const t of outline(w, x - 3, y - 3, x + 3, y + 3)) {
    w.setFeature(t, featureId(t === w.idx(x, y + 3) ? 'door' : 'woodWall'));
  }
  w.setFeature(w.idx(x, y + 2), featureId('bed'));
  w.setFeature(w.idx(x - 2, y - 2), featureId('hospitalBed'));
  w.setFeature(w.idx(x + 2, y - 2), featureId('hospitalBed'));
  const [patient, doctor, other] = sim.colonists;
  other.health.dead = true;
  patient.tile = where === 'outdoors' ? w.idx(x, y + 6) : w.idx(x, y);
  doctor.tile = w.idx(x + 2, y + 6);
  for (const c of [patient, doctor]) {
    c.path = [];
    c.job = null;
    c.needs.food = 1;
    c.needs.rest = 1;
    c.traits = [];
  }
  damage(sim, patient, 0.5, 'bruise');
  damage(sim, patient, 0.5, 'bruise');
  expect(patient.health.downed).toBe(true);
  return { sim, patient, doctor };
}

describe('the downed', () => {
  it('are carried to a free hospital bed, past a nearer ordinary one', () => {
    const { sim, patient } = infirmary('outdoors');
    run(sim, HOUR * 3);
    expect(inHospitalBed(sim, patient)).toBe(true);
  });

  it('are lifted off the hut floor into a bed', () => {
    const { sim, patient } = infirmary('indoors');
    run(sim, HOUR * 3);
    expect(inHospitalBed(sim, patient)).toBe(true);
  });

  it('crawl indoors when the only doctor is drafted', () => {
    const { sim, patient, doctor } = infirmary('outdoors');
    sim.apply({ type: 'draft', colonist: doctor.id, drafted: true });
    run(sim, HOUR * 6);
    expect(doctor.drafted).toBe(true);
    expect(sim.isIndoors(patient.tile)).toBe(true);
  });
});

describe('fire', () => {
  it('leaves iron, ore, bricks and clay where a shelf burned down', () => {
    const { sim, w, x, y } = quiet(6);
    const kinds = ['iron', 'ironOre', 'bricks', 'clay', 'stone'];
    const tiles = kinds.map((_, k) => w.idx(x - 6 + k * 3, y - 5));
    kinds.forEach((kind, k) => {
      w.setFeature(tiles[k], featureId('shelf'));
      w.addItem(tiles[k], itemId(kind), 20);
      ignite(sim, tiles[k]);
    });
    for (const c of sim.colonists) {
      sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    }
    run(sim, HOUR * 3);
    expect(tiles.map((t) => w.feature[t])).toEqual(kinds.map(() => NONE));
    expect(tiles.map((t) => w.itemCount[t])).toEqual(kinds.map(() => 20));
  });

  it("doesn't promise to rebuild a sculpture it destroyed", () => {
    const { sim, w, x, y } = quiet(6);
    const t = w.idx(x - 5, y - 5);
    w.setFeature(t, featureId('sculptureSmall'));
    ignite(sim, t);
    for (const c of sim.colonists) {
      sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    }
    run(sim, HOUR * 3);
    expect(w.feature[t]).toBe(NONE);
    const line = sim.log.find((l) => l.text.startsWith('Fire destroyed a small sculpture'));
    expect(line?.text).toBe('Fire destroyed a small sculpture.');
  });
});

describe('edge cases', () => {
  it('someone away on the road is widowed too', () => {
    const { sim } = quiet(7);
    const [a, b] = sim.colonists;
    a.lover = a.spouse = b.id;
    b.lover = b.spouse = a.id;
    b.away = 'gone';
    die(sim, a, 'test');
    expect([b.lover, b.spouse]).toEqual([-1, -1]);
  });

  it('a legendary piece finds a site when the middle of the colony is a wall', () => {
    const { sim, w, x, y } = quiet(7);
    w.setFeature(w.idx(x + 3, y), featureId('woodWall'));
    expect(sim.homeTile()).toBe(w.idx(x + 3, y));
    expect(sim.legendSite()).not.toBeUndefined();
  });

  it("nobody lies down in someone else's bed", () => {
    const { sim, w, x, y } = quiet(8);
    const bed = w.idx(x + 2, y);
    w.setFeature(bed, featureId('bed'));
    const [a, b, c] = sim.colonists;
    c.health.dead = true;
    a.tile = bed;
    a.needs.rest = 0.05;
    run(sim, 3);
    expect(a.sleeping && a.tile === bed).toBe(true);
    sim.endJob(b);
    b.tile = bed;
    b.path = [];
    b.needs.rest = 0.05;
    run(sim, HOUR);
    expect(b.tile).not.toBe(bed);
    expect(sim.reservations.get(`b${bed}`)).toBe(a.id);
  });

  it('a hauler on the way to a stack leaves it when it is forbidden', () => {
    const { sim, w, x, y } = quiet(9);
    sim.apply({ type: 'zone', rect: { x0: x - 2, y0: y + 2, x1: x + 2, y1: y + 4 }, zone: 1 });
    const pile = w.idx(x + 9, y - 6);
    w.addItem(pile, itemId('wood'), 20);
    for (let t = 0; t < HOUR * 2; t++) {
      sim.step();
      if (sim.living().some((c) => c.job?.source === pile && c.job.stage === 0)) {
        break;
      }
    }
    expect(sim.living().some((c) => c.job?.source === pile && c.job.stage === 0)).toBe(true);
    sim.apply({ type: 'forbid', rect: { x0: x + 9, y0: y - 6, x1: x + 9, y1: y - 6 }, on: true });
    run(sim, HOUR * 2);
    expect(w.itemCount[pile]).toBe(20);
  });
});
