import { describe, expect, it } from 'vitest';
import { CHILD_GROWTH, EXPECTING_DAYS, TODDLER, updateLifespans } from './lifespans';
import { DAYS_PER_YEAR } from './seasons';
import { START_HOUR, Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';

// Children born in the colony, and couples expecting (found by the sixth audit).

const DAY = HOUR * 24;

function family(seed: number) {
  const sim = Simulation.newColony(seed);
  clearAround(sim, 12);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  const days = (n: number) => {
    for (let h = 0; h < n * 24; h++) {
      for (const c of sim.living()) {
        c.needs.food = 1;
        c.needs.rest = 1;
        c.needs.joy = 1;
        c.health.hypothermia = 0;
        c.health.heatstroke = 0;
      }
      run(sim, HOUR);
    }
  };
  return { sim, days };
}

describe('a child born in the colony', () => {
  it('takes their first steps without a bow out of nowhere', () => {
    const { sim, days } = family(4);
    const [a, b] = sim.colonists;
    a.age = 26;
    b.age = 28;
    a.lover = b.id;
    b.lover = a.id;
    a.spouse = b.id;
    b.spouse = a.id;
    a.expectingUntil = sim.tick + EXPECTING_DAYS * DAY;
    days(EXPECTING_DAYS + 1);
    expect(sim.infants).toHaveLength(1);
    const before = sim.colonists.length;
    days(Math.ceil((TODDLER / CHILD_GROWTH) * DAYS_PER_YEAR) + 1);
    expect(sim.colonists.length).toBe(before + 1);
    const child = sim.colonists.at(-1)!;
    expect(child.age).toBeLessThan(4);
    // A three-year-old walks out of the cradle armed with a short bow nobody made.
    expect(child.weapon).toBe('fists');
  });
});

describe('one baby at a time', () => {
  it('holds whichever of the couple already has a baby in arms', () => {
    // Seeds where the couple would otherwise conceive within the run.
    for (const seed of [1, 2, 3]) {
      const sim = Simulation.newColony(seed);
      sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
      const [a, b, ex] = sim.colonists;
      a.age = 30;
      b.age = 30;
      a.lover = b.id;
      b.lover = a.id;
      a.spouse = b.id;
      b.spouse = a.id;
      // b (the higher id) has a baby from an earlier marriage.
      sim.infants.push({ id: sim.nextInfantId++, name: 'Wren', age: 0, parents: [b.id, ex.id], carer: b.id });
      let expecting = false;
      for (let d = 1; d < 120 && !expecting; d++) {
        sim.tick = d * DAY + (6 - START_HOUR) * HOUR;
        updateLifespans(sim);
        expecting = a.expectingUntil !== undefined || b.expectingUntil !== undefined;
      }
      expect(sim.infants).toHaveLength(1);
      expect(expecting).toBe(false);
    }
  });
});
