import { describe, expect, it } from 'vitest';
import { ailmentPain } from './ageing';
import { featureId, itemId } from './defs';
import { damage } from './health';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { SKILL_KEYS } from './types';

// A colony at dusk: an elder who knows their trade, a child, and a campfire burning.
function evening(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.animals = [];
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  const fire = w.idx(x + 3, y);
  w.setFeature(fire, featureId('campfire'));
  const [elder, child, other] = sim.colonists;
  elder.age = 70;
  elder.skills.crafting = 14;
  child.age = 10;
  child.skills.crafting = 0;
  child.skillXp.crafting = 0;
  for (const c of [elder, child, other]) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 0.4;
  }
  sim.tick = 18 * HOUR - 7 * HOUR + 2 * 24 * HOUR;
  sim.syncClock();
  return { sim, w, fire, elder, child, other };
}

describe('stories by the fire', () => {
  it("an elder gathers the colony round a fire in the evening; the young learn the teller's craft", () => {
    const { sim, fire, elder, child } = evening(61);
    expect(SKILL_KEYS.reduce((b, k) => (elder.skills[k] > elder.skills[b] ? k : b))).toBe('crafting');
    for (let t = 0; t < HOUR * 3 && !sim.storyCircle; t++) {
      sim.step();
    }
    expect(sim.storyCircle).not.toBeNull();
    expect(sim.storyCircle!.teller).toBe(elder.id);
    expect(sim.storyCircle!.fire).toBe(fire);
    expect(sim.log.some((l) => l.text.startsWith(`${elder.name} is telling the old stories by the campfire`))).toBe(
      true,
    );
    expect(child.job?.hearing).toBe(true);
    run(sim, HOUR * 2);
    expect(sim.storyCircle).toBeNull();
    expect(elder.thoughts.some((t) => t.key === 'toldStories')).toBe(true);
    expect(child.thoughts.some((t) => t.key === 'heardStories')).toBe(true);
    expect(child.skills.crafting * 1000 + child.skillXp.crafting).toBeGreaterThan(0);
    expect(sim.stats.storyNights).toBe(1);
    // Not again the next evening: once in two days.
    expect(sim.story.storiesAt).toBeGreaterThan(sim.tick + 24 * HOUR);
  });

  it('are not broken up by a concert', () => {
    const { sim, w, fire, other } = evening(61);
    for (let t = 0; t < HOUR * 3 && !sim.storyCircle; t++) {
      sim.step();
    }
    expect(sim.storyCircle).not.toBeNull();
    // A fine musician at a lute nearby, who would strike up a concert on any other evening.
    const lute = w.neighbors(fire + 4 * w.width).find((i) => w.isPassable(i) && w.feature[i] === 0)!;
    w.setFeature(lute, featureId('lute'));
    other.skills.artistic = 15;
    for (let t = 0; t < HOUR; t++) {
      sim.step();
      expect(sim.concert).toBeNull();
    }
  });

  it('needs an elder and a fire', () => {
    const { sim, w, fire, elder } = evening(62);
    elder.age = 40;
    run(sim, HOUR * 2);
    expect(sim.stats.storyNights ?? 0).toBe(0);
    elder.age = 70;
    w.setFeature(fire, 0);
    run(sim, HOUR * 2);
    expect(sim.storyCircle).toBeNull();
  });
});

describe("easing an elder's aches", () => {
  it('a doctor with medicine to spare rubs an aching elder, and the aches hurt less for three days', () => {
    const sim = Simulation.newColony(63);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    sim.animals = [];
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    const [elder, doctor] = sim.colonists;
    elder.age = 72;
    elder.health.ailments = ['stiffJoints', 'soreBack'];
    const before = ailmentPain(elder);
    for (const c of sim.colonists) {
      c.needs.food = 1;
      c.needs.rest = 1;
      c.priorities.doctor = c === doctor ? 1 : 0;
    }
    w.addItem(w.idx(x + 2, y + 2), itemId('herbalMedicine'), 10);
    for (let t = 0; t < HOUR * 6 && elder.health.easedUntil === undefined; t++) {
      sim.step();
    }
    expect(elder.health.easedUntil).toBeDefined();
    expect(ailmentPain(elder)).toBeCloseTo(before * 0.4);
    expect(elder.thoughts.some((t) => t.key === 'achesEased')).toBe(true);
    expect(sim.stockOf(itemId('herbalMedicine'))).toBe(9);
    // Three days on, that rub has worn off (the doctor may have given another since).
    const first = elder.health.easedUntil!;
    expect(first - sim.tick).toBeLessThanOrEqual(HOUR * 24 * 3);
    run(sim, HOUR * 24 * 3 + HOUR);
    expect(elder.health.easedUntil).not.toBe(first);
  });

  it("keeps the colony's last few doses for wounds", () => {
    const sim = Simulation.newColony(64);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    sim.animals = [];
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    const elder = sim.colonists[0];
    elder.age = 72;
    elder.health.ailments = ['soreBack'];
    w.addItem(w.idx(x + 2, y + 2), itemId('herbalMedicine'), 3);
    run(sim, HOUR * 6);
    expect(elder.health.easedUntil).toBeUndefined();
  });
});

describe('a rub for the aches gives way to real tending', () => {
  const setup = (seed: number) => {
    const sim = Simulation.newColony(seed);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    sim.animals = [];
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    const [elder, doctor, other] = sim.colonists;
    elder.age = 72;
    elder.health.ailments = ['stiffJoints', 'soreBack'];
    for (const c of sim.colonists) {
      c.needs.food = 1;
      c.needs.rest = 1;
      c.priorities.doctor = c === doctor ? 1 : 0;
    }
    w.addItem(w.idx(x + 8, y + 8), itemId('herbalMedicine'), 10);
    for (let t = 0; t < HOUR * 2 && doctor.job?.type !== 'soothe'; t++) {
      sim.step();
    }
    expect(doctor.job?.type).toBe('soothe');
    return { sim, elder, doctor, other };
  };

  it('stops when the elder is hurt, and the doctor tends them instead', () => {
    const { sim, elder, doctor } = setup(65);
    damage(sim, elder, 0.2, 'cut');
    run(sim, 30);
    expect(doctor.job?.type).not.toBe('soothe');
    for (let t = 0; t < HOUR && doctor.job?.type !== 'tend'; t++) {
      sim.step();
    }
    expect(doctor.job?.type).toBe('tend');
    expect(doctor.job?.patient).toBe(elder.id);
  });

  it("doesn't keep the doctor from someone else bleeding", () => {
    const { sim, doctor, other } = setup(66);
    damage(sim, other, 0.3, 'cut');
    // (Called away within moments, not after the rub: that took 300 ticks of bleeding.)
    for (let t = 0; t < 120 && doctor.job?.patient !== other.id; t++) {
      sim.step();
    }
    expect(doctor.job?.type).toBe('tend');
    expect(doctor.job?.patient).toBe(other.id);
  });
});
