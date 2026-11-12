import { describe, expect, it } from 'vitest';
import { featureId, itemId } from '../sim/defs';
import { triggerEvent } from '../sim/storyteller';
import { HOUR, clearAround } from '../sim/test-helpers';
import { Captive } from '../sim/types';
import { Alert, controller } from './controller';

// What a player found in the middle game (the ninth pass's playthrough of phases 3-5), each first seen failing.

const alerts = (): Alert[] =>
  (controller as unknown as { buildAlerts(t: unknown): Alert[] }).buildAlerts(controller.sim.resourceTotals());
const goal = (id: string) => controller.getState().objectives.find((o) => o.id === id)!;

function colony(seed: string) {
  controller.newColony(seed);
  const sim = controller.sim;
  const { x, y } = clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  return { sim, w: sim.world, x, y };
}

describe('the middle game', () => {
  it('Q with nothing attacking stands down whoever was left drafted, and their hunger says why', () => {
    // (Two left drafted after a boar fought back starved for a day with the stores full; Q drafted the rest.)
    const { sim } = colony('drafted-starving');
    const [a] = sim.living();
    controller.command({ type: 'draft', colonist: a.id, drafted: true });
    a.needs.food = 0;
    expect(alerts().some((x) => x.text === `${a.name} is starving, drafted: stand them down (Q) to eat`)).toBe(true);
    controller.selectColonist(null);
    controller.draftKey();
    expect(sim.living().some((c) => c.drafted)).toBe(false);
  });

  it('a right-click with nobody selected sends everyone drafted, each to a tile of their own', () => {
    const { sim, w, x, y } = colony('group-move');
    const drafted = sim.living().slice(0, 3);
    for (const c of drafted) {
      controller.command({ type: 'draft', colonist: c.id, drafted: true });
    }
    controller.selectColonist(null);
    const spot = w.idx(x + 6, y + 6);
    expect(controller.orderMove(spot)).toBe(true);
    const ends = drafted.map((c) => c.path[c.path.length - 1] ?? c.tile);
    expect(new Set(ends).size).toBe(drafted.length);
    expect(ends.every((i) => w.distance(i, spot) <= 2)).toBe(true);
    // A tap on a phone (no group order) still doesn't.
    expect(controller.orderMove(spot, false)).toBe(false);
  });

  it('bread and iron move on from their research to what comes next', () => {
    const { sim, w, x, y } = colony('bread-iron');
    sim.research.done.push('milling', 'pottery', 'smelting');
    controller.publish();
    expect(goal('bread').tool).toBe('millstone');
    w.setFeature(w.idx(x + 3, y + 3), featureId('millstone'));
    controller.publish();
    expect(goal('bread').tool).toBe('growGrain');
    w.addItem(w.idx(x + 5, y + 5), itemId('grain'), 20);
    controller.publish();
    expect(goal('bread').screen).toBe('production');
    expect(goal('iron').tool).toBe('kiln');
    w.setFeature(w.idx(x - 3, y - 3), featureId('kiln'));
    controller.publish();
    expect(goal('iron').how).toMatch(/Fire bricks/);
    w.addItem(w.idx(x - 5, y - 5), itemId('bricks'), 20);
    controller.publish();
    expect(goal('iron').tool).toBe('smelter');
  });

  it("a goal's label stops asking for research once it's learned", () => {
    const { sim } = colony('parkas-label');
    controller.publish();
    if (goal('parkas')) {
      expect(goal('parkas').label).toMatch(/research Tailoring/);
      sim.research.done.push('tailoring');
      controller.publish();
      expect(goal('parkas').label).not.toMatch(/research/);
    }
  });

  it('a hunt marked shows as under way, and the great boar request says it is marked', () => {
    const { sim } = colony('hunt-underway');
    controller.publish();
    expect(goal('hunt').underway).toBeFalsy();
    const deer = sim.animals.find((a) => !a.tame)!;
    deer.hunted = true;
    controller.publish();
    expect(goal('hunt').underway).toBe(true);
  });

  it('Capture on the Prisoners screen takes the one, not everyone on the tile', () => {
    const { sim, w, x, y } = colony('capture-one');
    const tile = w.idx(x + 4, y + 4);
    const make = (id: number): Captive => ({
      id,
      name: `Captive ${id}`,
      faction: 0,
      tile,
      state: 'downed',
      capture: false,
      since: sim.tick,
      food: 0.6,
      resistance: 2,
      skill: 7,
      lastVisit: 0,
      hungryHours: 0,
    });
    sim.captives.push(make(901), make(902));
    controller.captureCaptive(901);
    expect(sim.captives.map((p) => p.capture)).toEqual([true, false]);
  });

  it('a cold snap says the crops in the open may die, and how many are ripe', () => {
    const { sim, w, x, y } = colony('frost-warning');
    for (let k = 0; k < 4; k++) {
      w.setFeature(w.idx(x + 3 + k, y + 3), featureId('potatoPlant'));
    }
    w.growth[w.idx(x + 3, y + 3)] = 1;
    sim.tick += 4 * 24 * HOUR;
    sim.syncClock();
    expect(triggerEvent(sim, 'coldSnap')).toBe(true);
    const said = sim.log.map((e) => e.text).find((t) => t.startsWith('A cold snap'))!;
    expect(said).toMatch(/frost can kill the 4 crops in the open \(1 ripe: harvest it now\)/);
  });
});
