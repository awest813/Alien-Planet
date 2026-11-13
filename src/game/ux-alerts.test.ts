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

describe('notifications', () => {
  it('a notification about someone takes the camera to them', () => {
    // (Cards said "Mara is inspired" or "Lightning started a fire" with no way to find where.)
    const sim = colony('notice-go');
    const c = sim.living()[1];
    sim.addLog(`${c.name} is inspired.`, 'good', true, { colonist: c.id });
    sim.addLog('A fire!', 'danger', true, { tile: 77 });
    (controller as unknown as { collectNotifications(now: number): void }).collectNotifications(Date.now());
    const [person, place] = controller.getState().notifications.slice(-2);
    expect(person.about).toEqual({ colonist: c.id });
    controller.focusNotification(person);
    expect(controller.selectedColonist).toBe(c.id);
    controller.focusNotification(place);
    expect(controller.selectedTile).toBe(77);
    // Since died: the card takes the camera to where they fell. Since left: no link at all (it did nothing).
    c.health.dead = true;
    controller.publish();
    expect(controller.getState().notifications.slice(-2)[0].about).toEqual({ tile: c.tile });
    c.health.dead = false;
    c.away = 'gone';
    controller.publish();
    expect(controller.getState().notifications.slice(-2)[0].about).toBeUndefined();
    c.away = undefined;
  });
});

describe('what the sound hears', () => {
  it('colonists at work in view are heard, panned to where they stand', () => {
    const sim = colony('work-sounds');
    const w = sim.world;
    const c = sim.living()[0];
    const tree = w.idx(w.xOf(c.tile) + 1, w.yOf(c.tile));
    w.setFeature(tree, featureId('tree'));
    c.path = [];
    c.job = {
      type: 'chop',
      target: tree,
      source: -1,
      item: 0,
      count: 0,
      line: 0,
      stage: 2,
      progress: 0,
      wait: 0,
      patient: -1,
    };
    sim.burning.add(tree);
    const x = w.xOf(c.tile);
    const y = w.yOf(c.tile);
    controller.cameraView = { x0: x - 4, y0: y - 10, x1: x + 20, y1: y + 10 };
    const scene = (controller as unknown as { soundScene(): import('./audio').SoundScene }).soundScene();
    const heard = scene.workers.find((h) => h.id === c.id)!;
    expect(heard.kind).toBe('chop');
    // Left of the middle of the screen.
    expect(heard.pan).toBeLessThan(-0.5);
    expect(scene.fire).toBeGreaterThan(0);
    controller.cameraView = { x0: x + 30, y0: y + 30, x1: x + 40, y1: y + 40 };
    const away = (controller as unknown as { soundScene(): import('./audio').SoundScene }).soundScene();
    expect(away.workers).toHaveLength(0);
    expect(away.fire).toBe(0);
  });
});
