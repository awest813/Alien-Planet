import { describe, expect, it } from 'vitest';
import { featureId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';

function evening(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.animals = [];
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  w.setFeature(w.idx(x + 3, y), featureId('campfire'));
  const [elder, child, other] = sim.colonists;
  elder.age = 70;
  child.age = 10;
  for (const c of [elder, child, other]) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 0.4;
  }
  sim.tick = 18 * HOUR - 7 * HOUR + 2 * 24 * HOUR;
  sim.syncClock();
  return { sim, elder };
}

describe('stories by the fire across a save', () => {
  it('a teller drafted just before the save is not sent back to the fire on loading', () => {
    const { sim } = evening(61);
    for (let t = 0; t < HOUR * 3 && !sim.storyCircle; t++) {
      sim.step();
    }
    expect(sim.storyCircle).not.toBeNull();
    run(sim, HOUR / 2);
    const teller = sim.colonists[sim.storyCircle!.teller];
    // A raid, say: the player pauses, drafts the teller and saves at once (no tick in between).
    sim.apply({ type: 'draft', colonist: teller.id, drafted: true });
    expect(teller.drafted).toBe(true);
    expect(teller.job?.telling).toBeFalsy();
    const copy = deserialize(structuredClone(serialize(sim)));
    const loaded = copy.colonists[teller.id];
    expect(loaded.drafted).toBe(true);
    // Drafted, they wait for orders; the loaded game made them a storyteller again.
    expect(loaded.job?.telling).toBeFalsy();
  }, 60000);
});
