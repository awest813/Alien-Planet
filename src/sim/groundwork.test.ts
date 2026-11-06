import { describe, expect, it } from 'vitest';
import { FEATURES, JOY_KINDS, featureId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { SKILL_LABELS } from './skills';
import { HOUR, clearAround, run } from './test-helpers';
import { SKILL_KEYS } from './types';

// Groundwork for the recreation, art and music phases.
describe('recreation kinds', () => {
  it('gives every joy building a known kind and something to show the colonist doing', () => {
    const joyful = FEATURES.filter((f) => f.joy);
    expect(joyful.length).toBeGreaterThan(0);
    for (const f of joyful) {
      expect(JOY_KINDS).toContain(f.joy!.kind);
      expect(f.joy!.activity.length).toBeGreaterThan(0);
    }
    expect(FEATURES.find((f) => f.key === 'armchair')!.joy!.kind).toBe('relaxing');
    expect(FEATURES.find((f) => f.key === 'horseshoePin')!.joy!.kind).toBe('gaming');
  });

  it('notes the kind of recreation a colonist has had, which fades day by day', () => {
    const sim = Simulation.newColony(21);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    w.setFeature(w.idx(x + 3, y), featureId('horseshoePin'));
    const c = sim.colonists[0];
    for (const other of sim.colonists) {
      other.needs.joy = 0.1;
      other.schedule.fill('J');
    }
    run(sim, HOUR * 4);
    expect(Object.keys(c.recentJoy).length).toBeGreaterThan(0);
    const total = Object.values(c.recentJoy).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.1);
    // Someone played horseshoes; anyone who couldn't went for a walk (outdoors).
    expect(sim.colonists.some((o) => (o.recentJoy.gaming ?? 0) > 0)).toBe(true);
    const saved = deserialize(structuredClone(serialize(sim)));
    expect(saved.colonists[0].recentJoy).toEqual(c.recentJoy);
    // A few dawns later it's mostly forgotten.
    for (const other of sim.colonists) {
      other.schedule.fill('W');
    }
    run(sim, HOUR * 24 * 3);
    const later = Object.values(c.recentJoy).reduce((a, b) => a + b, 0);
    expect(later).toBeLessThan(total);
  });
});

describe('artistic skill', () => {
  it('is a skill every colonist has, with a label, and survives a save', () => {
    expect(SKILL_KEYS).toContain('artistic');
    expect(SKILL_LABELS.artistic).toBe('Artistic');
    const sim = Simulation.newColony(22);
    for (const c of sim.colonists) {
      expect(c.skills.artistic).toBeGreaterThanOrEqual(1);
      expect(c.skillXp.artistic).toBe(0);
    }
    sim.colonists[0].skills.artistic = 12;
    expect(deserialize(structuredClone(serialize(sim))).colonists[0].skills.artistic).toBe(12);
  });
});
