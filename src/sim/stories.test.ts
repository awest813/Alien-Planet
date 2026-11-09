import { describe, expect, it } from 'vitest';
import { featureId } from './defs';
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
