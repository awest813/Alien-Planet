import { describe, expect, it } from 'vitest';
import { featureId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';

// A colony at dusk: an elder, a child, and a campfire burning (as in stories.test.ts).
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
  for (const c of [elder, child, other]) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 0.4;
  }
  sim.tick = 18 * HOUR - 7 * HOUR + 2 * 24 * HOUR;
  sim.syncClock();
  return { sim, elder, child };
}

describe('stories by the fire across a save', () => {
  it('a story circle under way when the game is saved still counts once loaded', () => {
    const { sim } = evening(61);
    for (let t = 0; t < HOUR * 3 && !sim.storyCircle; t++) {
      sim.step();
    }
    expect(sim.storyCircle).not.toBeNull();
    // Well into the telling (past the half hour that counts).
    run(sim, HOUR);
    expect(sim.storyCircle).not.toBeNull();
    const copy = deserialize(structuredClone(serialize(sim)));
    run(sim, HOUR * 2);
    run(copy, HOUR * 2);
    expect(sim.stats.storyNights).toBe(1);
    // Continued and loaded games agree (the loaded one lost the evening: the circle wasn't saved).
    expect(copy.stats.storyNights ?? 0).toBe(1);
  }, 60000);
});
