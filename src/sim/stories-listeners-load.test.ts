import { describe, expect, it } from 'vitest';
import { NIGHT_START } from './constants';
import { featureId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround } from './test-helpers';
import { Colonist } from './types';

// Review of "Fixes from a review of the last two passes": a story circle restored past bedtime (freeForStories
// with `underWay`) seats everyone awake, not only those who were listening.
describe('a story circle restored past bedtime', () => {
  it("doesn't pull in a colonist who was on their way to bed", () => {
    let checked = false;
    for (const seed of [61, 62, 63, 64, 65, 66, 67, 68]) {
      const sim = Simulation.newColony(seed);
      const w = sim.world;
      const { x, y } = clearAround(sim, 12);
      sim.animals = [];
      sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
      w.setFeature(w.idx(x + 3, y), featureId('campfire'));
      // A bed some way off, for the one going to bed.
      w.setFeature(w.idx(x - 10, y - 10), featureId('bed'));
      const [elder, child, other] = sim.colonists;
      elder.age = 70;
      child.age = 10;
      for (const c of [elder, child, other]) {
        c.needs.food = 1;
        c.needs.rest = 1;
        c.needs.joy = 0.4;
      }
      sim.tick = 20.6 * HOUR - 7 * HOUR + 2 * 24 * HOUR;
      sim.syncClock();
      while (!sim.storyCircle && sim.hour < 21) {
        sim.step();
      }
      if (!sim.storyCircle) {
        continue;
      }
      const circle = sim.storyCircle;
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
      // Someone else, not at the fire: past bedtime, off to bed.
      const sleeper = sim.living().find((c) => c !== teller && !c.job?.hearing && !c.sleeping) as Colonist | undefined;
      const goer = sleeper ?? sim.living().find((c) => c !== teller)!;
      (sim as unknown as { endJob(c: Colonist): void }).endJob(goer);
      goer.needs.rest = 0.5;
      (sim as unknown as { startSleep(c: Colonist): void }).startSleep(goer);
      if (goer.job?.type !== 'sleep' || goer.sleeping || goer.path.length < 3) {
        continue;
      }
      checked = true;
      // Without a save they go on to bed.
      const copy = deserialize(structuredClone(serialize(sim)));
      expect(copy.storyCircle).not.toBeNull();
      for (let n = 0; n < 20; n++) {
        sim.step();
      }
      expect(goer.job?.hearing ?? false).toBe(false);
      const after = copy.colonists[goer.id];
      // With one, they're sat down at the fire to listen (and, "in evening company", stay up).
      expect(after.job?.hearing ?? false).toBe(false);
      break;
    }
    expect(checked).toBe(true);
  }, 120000);
});
