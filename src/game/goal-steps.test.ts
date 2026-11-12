import { describe, expect, it } from 'vitest';
import { ANIMALS, featureId, itemId } from '../sim/defs';
import { clearAround } from '../sim/test-helpers';
import { controller } from './controller';

// Review of "Fixes from a mid-game playthrough": the staged goal help and goals under way.

const goal = (id: string) => controller.getState().objectives.find((o) => o.id === id);

function colony(seed: string) {
  controller.newColony(seed);
  const sim = controller.sim;
  const { x, y } = clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  return { sim, w: sim.world, x, y };
}

describe('goal help', () => {
  it('bread with a millstone and grain but no stove asks for the stove, not for targets', () => {
    const { sim, w, x, y } = colony('bread-stove');
    sim.research.done.push('milling');
    w.setFeature(w.idx(x + 3, y + 3), featureId('millstone'));
    w.addItem(w.idx(x + 5, y + 5), itemId('grain'), 20);
    expect(sim.countBuilt((f) => f === featureId('stove'))).toBe(0);
    controller.publish();
    const bread = goal('bread')!;
    // "Set targets for flour and bread in Production: ... bake at a stove", with no stove to bake at.
    expect(bread.how).toMatch(/build a stove/i);
  });

  it('a slaughter mark on livestock does not make the hunt goal "under way"', () => {
    const { sim, w, x, y } = colony('hunt-tame');
    sim.animals = [
      {
        id: sim.nextAnimalId++,
        kind: 'muskox',
        tile: w.idx(x + 2, y),
        path: [],
        moveProgress: 0,
        hp: ANIMALS.muskox.hp,
        hunted: true,
        taming: false,
        tame: true,
        revengeOn: -1,
        cooldown: 0,
        restUntil: 0,
        revengeUntil: 0,
      },
    ];
    controller.publish();
    const hunt = goal('hunt');
    expect(hunt).toBeDefined();
    // Slaughtering one of the colony's own (a.tame) never counts as hunting (hurtAnimal), so the goal isn't begun.
    expect(hunt!.underway).toBe(false);
  });
});
