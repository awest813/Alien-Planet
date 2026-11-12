import { describe, expect, it } from 'vitest';
import { ANIMALS, featureId } from '../sim/defs';
import { spawnRaid } from '../sim/combat';
import { clearAround } from '../sim/test-helpers';
import { Animal } from '../sim/types';
import { Alert, controller } from './controller';

// Review of "Fixes from a mid-game playthrough": drafting and the group move.

const alerts = (): Alert[] =>
  (controller as unknown as { buildAlerts(t: unknown): Alert[] }).buildAlerts(controller.sim.resourceTotals());

function colony(seed: string) {
  controller.newColony(seed);
  const sim = controller.sim;
  const { x, y } = clearAround(sim, 14);
  sim.animals = [];
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  return { sim, w: sim.world, x, y };
}

function place(kind: string, tile: number, extra: Partial<Animal> = {}): Animal {
  const sim = controller.sim;
  const a: Animal = {
    id: sim.nextAnimalId++,
    kind,
    tile,
    path: [],
    moveProgress: 0,
    hp: ANIMALS[kind].hp,
    hunted: false,
    taming: false,
    tame: false,
    revengeOn: -1,
    cooldown: 0,
    restUntil: 0,
    revengeUntil: 0,
    ...extra,
  };
  sim.animals.push(a);
  return a;
}

describe('drafting', () => {
  it('an animal that lashed out at its tamer is no fight for everyone (nobody else may fight it)', () => {
    const { sim, w, x, y } = colony('lashout');
    const [tamer] = sim.living();
    place('boar', w.idx(x + 1, y), { revengeOn: tamer.id, lashOut: true, revengeUntil: sim.tick + 200 });
    // colonistCombat leaves a lash-out animal to the one it snapped at, drafted or not, so the top bar's
    // "Draft all" (and Q drafting everyone) does nothing useful.
    controller.publish();
    expect(controller.getState().animalsAttacking).toBe(false);
  });

  it("the starving-drafted alert's advice (Q) stands them down during a raid", () => {
    const { sim } = colony('starving-raid');
    expect(spawnRaid(sim, 1, 2)).toBe(true);
    const [a] = sim.living();
    controller.command({ type: 'draft', colonist: a.id, drafted: true });
    a.needs.food = 0;
    // (Q with nobody selected drafts the rest in a fight: the advice says to select them first, and that works.)
    expect(alerts().some((t) => t.text.includes('select them and stand them down (Q) to eat'))).toBe(true);
    controller.selectColonist(a.id);
    controller.draftKey();
    expect(a.drafted).toBe(false);
  });
});

describe('group move', () => {
  it("doesn't say everyone is on the way to a spot none of them can reach", () => {
    const { sim, w, x, y } = colony('island');
    const drafted = sim.living().slice(0, 3);
    for (const c of drafted) {
      controller.command({ type: 'draft', colonist: c.id, drafted: true });
    }
    controller.selectColonist(null);
    // A walled-off pocket (a ring of wall) with the spot inside.
    const cx = x + 8;
    const cy = y + 8;
    for (let ty = cy - 2; ty <= cy + 2; ty++) {
      for (let tx = cx - 2; tx <= cx + 2; tx++) {
        if (Math.abs(tx - cx) === 2 || Math.abs(ty - cy) === 2) {
          w.setFeature(w.idx(tx, ty), featureId('woodWall'));
        }
      }
    }
    const spot = w.idx(cx, cy);
    const moved = controller.orderMove(spot);
    expect(drafted.every((c) => c.path.length === 0)).toBe(true);
    // Nobody went, and it says so (it said "Everyone drafted is on the way.").
    expect(moved).toBe(true);
    expect(controller.getState().toast).toMatch(/None of the drafted colonists can get there/);
  });

  it('a right-click on an embrasure or wall with nobody selected sends them beside it, as for one colonist', () => {
    const { sim, w, x, y } = colony('wall');
    const drafted = sim.living().slice(0, 2);
    for (const c of drafted) {
      controller.command({ type: 'draft', colonist: c.id, drafted: true });
    }
    const wall = w.idx(x + 6, y);
    w.setFeature(wall, featureId('embrasure'));
    // One selected: they go beside it.
    controller.selectColonist(drafted[0].id);
    expect(controller.orderMove(wall)).toBe(true);
    expect(drafted[0].path.length).toBeGreaterThan(0);
    // Nobody selected: nothing at all (the right-click just drops the tool).
    controller.selectColonist(null);
    expect(controller.orderMove(wall)).toBe(true);
  });
});
