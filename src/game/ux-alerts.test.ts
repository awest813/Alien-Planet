import { describe, expect, it } from 'vitest';
import { spawnRaid } from '../sim/combat';
import { featureId, itemId } from '../sim/defs';
import { Designation } from '../sim/world';
import { HOUR, clearAround } from '../sim/test-helpers';
import { Alert, controller } from './controller';

// From a review of how the game feels to use, each first seen failing.

const alerts = (): Alert[] =>
  (controller as unknown as { buildAlerts(t: unknown): Alert[] }).buildAlerts(controller.sim.resourceTotals());

function colony(seed: string) {
  controller.newColony(seed);
  const sim = controller.sim;
  clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  return sim;
}

describe('alerts and orders', () => {
  it('an alert that names its fix carries it, one click away', () => {
    // ("Forage berries (G)" and "(Factions)" were plain text: clicked, nothing happened.)
    const sim = colony('alert-fixes');
    for (const i of [...sim.world.tilesWith('items')]) {
      sim.world.takeItem(i, sim.world.itemCount[i]);
    }
    sim.tick = 30 * HOUR;
    sim.syncClock();
    const food = alerts().find((a) => /food/i.test(a.text) && /forage/.test(a.text))!;
    expect(food.tool).toBe('forage');
    expect(food.text).toMatch(/^Out of food/);
    const research = alerts().find((a) => a.text === 'No research project selected');
    if (research) {
      expect(research.screen).toBe('research');
    }
  });

  it('the starving are said once for all of them', () => {
    const sim = colony('starving-once');
    for (const c of sim.living()) {
      c.needs.food = 0;
    }
    const starving = alerts().filter((a) => /starving/.test(a.text));
    expect(starving).toHaveLength(1);
    expect(starving[0].text).toMatch(new RegExp(`^${sim.living().length} colonists are starving: `));
  });

  it('Q with one colonist selected in a fight says it drafted only them', () => {
    const sim = colony('q-one');
    expect(spawnRaid(sim, 1, 2)).toBe(true);
    const [a] = sim.living();
    controller.selectColonist(a.id);
    controller.draftKey();
    expect(a.drafted).toBe(true);
    expect(controller.getState().toast).toMatch(new RegExp(`^${a.name} is drafted\\. For everyone`));
  });

  it('a right-click with an undrafted colonist selected says how to send them', () => {
    const sim = colony('rc-undrafted');
    const [a] = sim.living();
    controller.selectColonist(a.id);
    expect(controller.orderMove(sim.world.idx(5, 5))).toBe(true);
    expect(controller.getState().toast).toBe(`Draft ${a.name} (Q) to send them somewhere.`);
  });
});

describe('tile card', () => {
  it('offers the map orders for the selected tile as buttons', () => {
    // (Cancelling one order or forbidding one pile meant picking a tool and dragging over a single tile.)
    const sim = colony('tile-actions');
    const w = sim.world;
    const { x, y } = { x: w.xOf(sim.colonists[0].tile) + 5, y: w.yOf(sim.colonists[0].tile) };
    const tree = w.idx(x, y);
    w.setFeature(tree, featureId('tree'));
    controller.selectTile(tree);
    expect(controller.getState().selectedTile!.actions).toMatchObject({
      harvest: 'chop',
      deconstruct: false,
      cancel: false,
    });
    controller.command({ type: 'designate', kind: 'chop', rect: { x0: x, y0: y, x1: x, y1: y } });
    controller.publish();
    expect(controller.getState().selectedTile!.actions).toMatchObject({ harvest: null, cancel: true });

    const wall = w.idx(x + 1, y);
    w.setFeature(wall, featureId('woodWall'));
    controller.selectTile(wall);
    expect(controller.getState().selectedTile!.actions).toMatchObject({ harvest: null, deconstruct: true });

    const pile = w.idx(x + 2, y);
    w.addItem(pile, itemId('wood'), 5);
    controller.selectTile(pile);
    controller.publish();
    expect(controller.getState().selectedTile!.actions.forbidden).toBe(false);
    expect(w.designation[tree]).toBe(Designation.CHOP);
  });
});
