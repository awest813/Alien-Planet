import { describe, expect, it } from 'vitest';
import { NIGHT_START } from './constants';
import { featureId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround } from './test-helpers';

// A story circle runs on past bedtime to its end (inEveningCompany). The load fix in "Fixes from a review of this
// session's changes" restores a circle only for a teller `freeForStories`, which is false in a sleep slot.
describe('a story circle running on past bedtime, across a save', () => {
  it('picks up again on loading, as it carries on without one', () => {
    let checked = false;
    for (const seed of [61, 62, 63, 64, 65, 66, 67, 68]) {
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
      // Late in the evening: a circle started now runs past ten.
      sim.tick = 20.6 * HOUR - 7 * HOUR + 2 * 24 * HOUR;
      sim.syncClock();
      while (!sim.storyCircle && sim.hour < 21) {
        sim.step();
      }
      if (!sim.storyCircle) {
        continue;
      }
      const circle = sim.storyCircle;
      // Into bedtime, the circle still going.
      while (sim.hour < NIGHT_START + 0.05) {
        for (const c of sim.living()) {
          c.needs.rest = 1;
        }
        sim.step();
      }
      const teller = sim.colonists[circle.teller];
      if (!sim.storyCircle || sim.tick >= circle.endsAt - HOUR / 10 || !teller.job?.telling) {
        continue;
      }
      checked = true;
      // Without a save, it goes on to its end.
      const copy = deserialize(structuredClone(serialize(sim)));
      expect(copy.storyCircle).not.toBeNull();
      expect(copy.colonists[teller.id].job?.telling).toBe(true);
      break;
    }
    expect(checked).toBe(true);
  }, 120000);
});
