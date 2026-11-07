import { describe, expect, it } from 'vitest';
import { healed, isInfected, scarAim, scarMove, scarWork, scarsOf } from './body';
import { featureId } from './defs';
import { damage, tend, updateHealth } from './health';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { Injury, WORK_TYPES } from './types';

// A quiet colony with a closed hut, nobody working, no events.
function ward(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 14);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  for (const c of sim.colonists) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 1;
    for (const work of WORK_TYPES) {
      c.priorities[work] = 0;
    }
  }
  for (const i of outline(w, x + 2, y - 3, x + 8, y + 3)) {
    w.setFeature(i, featureId('woodWall'));
  }
  w.setFeature(w.idx(x + 2, y), featureId('door'));
  return { sim, w, x, y, inside: (dx: number, dy: number) => w.idx(x + 5 + dx, y + dy) };
}

const wound = (severity: number, extra: Partial<Injury> = {}): Injury => ({
  label: 'Cut',
  severity,
  bleeding: 0,
  tended: 0,
  part: 'leg',
  peak: severity,
  ...extra,
});

describe('wounds', () => {
  it('land on a body part, remembering how bad they were', () => {
    const { sim } = ward(1);
    const c = sim.colonists[0];
    damage(sim, c, 0.2, 'cut');
    const injury = c.health.injuries[0];
    expect(['torso', 'arm', 'leg', 'hand', 'head', 'eye']).toContain(injury.part);
    expect(injury.peak).toBeCloseTo(injury.severity);
  });

  it('left untended may turn infected and get worse, until treated with medicine', () => {
    const { sim } = ward(2);
    const c = sim.colonists[0];
    c.health.injuries = [wound(0.6)];
    for (let h = 0; h < 600 && !isInfected(c.health.injuries[0]); h++) {
      updateHealth(sim, c, 1);
      // A wound that healed clean: try another.
      if (c.health.injuries.length === 0) {
        c.health.injuries = [wound(0.6)];
      }
    }
    const injury = c.health.injuries[0];
    expect(isInfected(injury)).toBe(true);
    const before = injury.severity;
    updateHealth(sim, c, 2);
    expect(injury.severity).toBeGreaterThan(before);
    expect(sim.thoughtsOf(c).map((t) => t.label)).toContain('Infected wound');
    // A doctor with medicine treats it, and it heals again.
    tend(sim, sim.colonists[1], c, true);
    expect(isInfected(injury)).toBe(false);
    const treated = injury.severity;
    updateHealth(sim, c, 4);
    expect(injury.severity).toBeLessThan(treated);
  });

  it('can leave a lasting mark when a bad one heals, which slows them down', () => {
    const { sim } = ward(3);
    const c = sim.colonists[0];
    for (let k = 0; k < 30 && scarsOf(c).length === 0; k++) {
      healed(sim, c, wound(0.9));
    }
    expect(scarsOf(c)[0]).toEqual({ part: 'leg', kind: 'limp' });
    expect(scarMove(c)).toBeCloseTo(0.85);
    expect(sim.thoughtsOf(c).map((t) => t.label)).toContain('Will never be the same');
    // A small wound leaves nothing.
    const other = sim.colonists[1];
    for (let k = 0; k < 30; k++) {
      healed(sim, other, wound(0.1));
    }
    expect(scarsOf(other)).toEqual([]);
    // Other marks: a stiff hand, a lost eye.
    c.health.scars!.push({ part: 'hand', kind: 'stiffHand' }, { part: 'eye', kind: 'lostEye' });
    expect(scarWork(c)).toBeCloseTo(0.9);
    expect(scarAim(c)).toBeLessThan(0);
    // Saved with the colony.
    expect(scarsOf(deserialize(structuredClone(serialize(sim))).colonists[0])).toEqual(scarsOf(c));
  });
});

describe('hospital beds', () => {
  it('make a room an infirmary, take patients first, and heal them faster', () => {
    const { sim, w, x, y, inside } = ward(4);
    const hospital = inside(0, 0);
    w.setFeature(hospital, featureId('hospitalBed'));
    expect(sim.roomAt(inside(1, 1))!.role).toBe('Infirmary');
    w.setFeature(w.idx(x - 4, y + 4), featureId('bed'));
    const c = sim.colonists[0];
    c.health.injuries = [wound(0.5, { tended: 0.5 })];
    run(sim, HOUR);
    expect(c.tile).toBe(hospital);
    expect(c.job?.type).toBe('rest');
    expect(sim.thoughtsOf(c).map((t) => t.label)).toContain('Cared for in a hospital bed');
    // Faster than the same wound in an ordinary bed.
    const other = sim.colonists[1];
    other.tile = w.idx(x - 4, y + 4);
    other.sleeping = true;
    other.health.injuries = [wound(0.5, { tended: 0.5 })];
    c.health.injuries[0].severity = 0.5;
    updateHealth(sim, c, 4);
    updateHealth(sim, other, 4);
    expect(c.health.injuries[0]?.severity ?? 0).toBeLessThan(other.health.injuries[0].severity);
  });
});
