import { describe, expect, it } from 'vitest';
import { FACTIONS, featureId, itemId } from '../sim/defs';
import { STOCKPILE_ZONE } from '../sim/world';
import { DAYS_PER_SEASON } from '../sim/seasons';
import { HOUR, clearAround, outline } from '../sim/test-helpers';
import { TICKS_PER_HOUR } from '../sim/simulation';
import { spawnRaid } from '../sim/combat';
import { Alert, controller } from './controller';

// The alerts the side panel would show right now.
const alerts = (): Alert[] =>
  (controller as unknown as { buildAlerts(t: unknown): Alert[] }).buildAlerts(controller.sim.resourceTotals());
const texts = () => alerts().map((a) => a.text);

// A fresh colony with a cleared patch around the first colonist.
function colony(seed: string) {
  controller.newColony(seed);
  const sim = controller.sim;
  const { x, y } = clearAround(sim, 12);
  return { sim, w: sim.world, x, y };
}

describe('alerts', () => {
  it('say when nobody can get to the beds', () => {
    const { sim, w, x, y } = colony('1');
    sim.tick = HOUR * 30;
    // A walled hut with a bed and a door that opens onto rock.
    for (const i of outline(w, x + 2, y - 3, x + 6, y + 1)) {
      w.setFeature(i, featureId('woodWall'));
    }
    const door = w.idx(x + 4, y + 1);
    w.setFeature(door, featureId('door'));
    w.setFeature(w.idx(x + 4, y - 1), featureId('bed'));
    expect(texts().some((t) => t.startsWith('Nobody can get to the beds'))).toBe(false);
    w.setFeature(w.idx(x + 4, y + 2), featureId('rock'));
    expect(texts().some((t) => t.startsWith('Nobody can get to the beds'))).toBe(true);
  });

  it('say when nobody can get to a blueprint, or a colonist is shut in', () => {
    const { sim, w, x, y } = colony('1');
    sim.tick = HOUR * 30;
    // The same hut, with a bed still to build inside.
    for (const i of outline(w, x + 2, y - 3, x + 6, y + 1)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 4, y + 1), featureId('door'));
    sim.apply({ type: 'build', feature: featureId('bed'), tiles: [w.idx(x + 4, y - 1)] });
    const reachBlueprint = () => texts().some((t) => t.startsWith('Nobody can get to a blueprint'));
    const shutIn = () => texts().some((t) => t.includes('is cut off from the colony'));
    expect(reachBlueprint()).toBe(false);
    w.setFeature(w.idx(x + 4, y + 2), featureId('rock'));
    expect(reachBlueprint()).toBe(true);
    expect(shutIn()).toBe(false);
    // One colonist inside with the bed: now they're the one cut off, and the blueprint isn't.
    const [inside] = sim.living();
    inside.tile = w.idx(x + 3, y - 1);
    expect(texts().filter((t) => t.includes('is cut off from the colony'))).toEqual([
      `${inside.name} is cut off from the colony: there's no way through to the others`,
    ]);
    expect(reachBlueprint()).toBe(false);
  });

  it('say when fences make no pen yet, and when a pen has no trough', () => {
    const { w, x, y } = colony('3');
    const fenceAlert = () => texts().some((t) => t.startsWith("The fences don't make a pen yet"));
    const troughAlert = () => texts().some((t) => t.startsWith('A pen has no feeding trough'));
    for (const i of outline(w, x + 2, y + 2, x + 7, y + 6)) {
      w.setFeature(i, featureId('fence'));
    }
    expect(fenceAlert()).toBe(true);
    w.setFeature(w.idx(x + 4, y + 6), featureId('gate'));
    expect(fenceAlert()).toBe(false);
    expect(troughAlert()).toBe(true);
    w.setFeature(w.idx(x + 5, y + 4), featureId('trough'));
    expect(troughAlert()).toBe(false);
  });

  it('warn plainly when winter is coming and there is nowhere warm', () => {
    const { sim, w, x, y } = colony('2');
    // A few days before winter.
    sim.tick = (DAYS_PER_SEASON * 3 - 3) * 24 * TICKS_PER_HOUR;
    sim.syncClock();
    expect(texts().some((t) => t.includes('nowhere warm to shelter'))).toBe(true);
    // A closed hut with a campfire is enough.
    for (const i of outline(w, x + 2, y - 3, x + 7, y + 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 4, y + 2), featureId('door'));
    w.setFeature(w.idx(x + 4, y), featureId('campfire'));
    expect(texts().some((t) => t.includes('nowhere warm to shelter'))).toBe(false);
    expect(texts().some((t) => t.startsWith('Winter in'))).toBe(true);
  });

  it('point out wounded raiders, and what capturing them still needs', () => {
    const { sim, w, x, y } = colony('3');
    const base = { faction: 0, since: sim.tick, food: 0.6, resistance: 3, skill: 4, lastVisit: 0, hungryHours: 0 };
    sim.captives.push({ ...base, id: 1, name: 'Wren', tile: w.idx(x - 3, y), state: 'downed', capture: false });
    const about = () => texts().find((t) => /wounded|prisoner bed|Warden/.test(t));
    expect(about()).toMatch(/drag Capture/);
    sim.captives[0].capture = true;
    expect(about()).toMatch(/Build a prisoner bed/);
    w.setFeature(w.idx(x + 3, y), featureId('prisonerBed'));
    for (const c of sim.colonists) {
      c.priorities.warden = 0;
    }
    expect(about()).toMatch(/Warden/);
    sim.colonists[0].priorities.warden = 2;
    expect(about()).toMatch(/to be brought in/);
  });

  it('count a stockpile with settings as a stockpile', () => {
    const { sim, w, x, y } = colony('4');
    w.addItem(w.idx(x + 3, y + 3), itemId('wood'), 5);
    expect(texts()).toContain('No stockpile: items are left where they fall');
    sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y - 4, x1: x - 2, y1: y - 2 }, zone: STOCKPILE_ZONE });
    sim.apply({ type: 'stockpile', tile: w.idx(x - 4, y - 4), refused: 1, priority: 'high' });
    expect(texts()).not.toContain('No stockpile: items are left where they fall');
  });

  it('warn before the woodpile runs out, and when a fire goes out', () => {
    const { w, x, y } = colony('5');
    for (const i of [...w.tilesWith('items')]) {
      w.takeItem(i, w.itemCount[i]);
    }
    const fire = w.idx(x + 3, y);
    w.setFeature(fire, featureId('campfire'));
    expect(texts().some((t) => t.startsWith('Wood is running low'))).toBe(true);
    w.addItem(w.idx(x - 3, y), itemId('wood'), 75);
    expect(texts().some((t) => t.startsWith('Wood is running low'))).toBe(false);
    w.fuel[fire] = 0;
    expect(texts().some((t) => /gone out: colonists with Haul work bring wood/.test(t))).toBe(true);
  });

  it('say when colonists freeze even indoors', () => {
    const { sim, w, x, y } = colony('6');
    for (const i of outline(w, x + 2, y - 3, x + 7, y + 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 4, y + 2), featureId('door'));
    const c = sim.colonists[0];
    c.tile = w.idx(x + 4, y);
    c.health.hypothermia = 0.1;
    const real = sim.temperatureAt.bind(sim);
    sim.temperatureAt = () => -3;
    expect(texts().some((t) => /getting dangerously cold: add a campfire/.test(t))).toBe(true);
    sim.temperatureAt = real;
  });

  it('leave children out of "nothing to do", and drop an obsession alert once the artist is gone', () => {
    const { sim, w, x, y } = colony('7');
    const kid = sim.colonists[0];
    kid.age = 7;
    kid.schedule.fill('W');
    const idleSince = (controller as unknown as { idleSince: Map<number, number> }).idleSince;
    idleSince.set(kid.id, sim.tick - HOUR * 3);
    expect(texts().some((t) => t.startsWith('Nothing to do') && t.includes(kid.name))).toBe(false);
    // An obsession whose artist has died: no alert, even before the hourly update notices.
    const artist = sim.colonists[1];
    const tile = w.idx(x + 4, y + 4);
    w.blueprint[tile] = featureId('legendarySculpture');
    sim.obsession = { colonist: artist.id, tile, started: sim.tick, deadline: sim.tick + HOUR * 48 };
    expect(texts().some((t) => t.includes('obsessed'))).toBe(true);
    artist.health.dead = true;
    expect(texts().some((t) => t.includes('obsessed'))).toBe(false);
  });
});

describe('on a big map', () => {
  it('suggest a stockpile out where goods are piling up far from storage', () => {
    controller.newColony('far', 'standard', 128);
    const sim = controller.sim;
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    sim.apply({ type: 'zone', rect: { x0: x - 2, y0: y - 2, x1: x + 2, y1: y + 2 }, zone: STOCKPILE_ZONE });
    const far = (dx: number) => {
      const tx = x + dx < w.width ? x + dx : x - dx;
      return w.idx(tx, y);
    };
    const near = alerts().find((a) => a.text.includes('from any stockpile'));
    expect(near).toBeUndefined();
    // A felling 50 tiles off: 70 logs left lying.
    w.addItem(far(50), itemId('wood'), 40);
    w.addItem(far(51), itemId('wood'), 30);
    const alert = alerts().find((a) => a.text.includes('from any stockpile'));
    expect(alert?.text).toMatch(/^70 items lie more than 40 tiles/);
    expect(alert?.tile).toBe(far(50));
    // On a Tiny map nothing is ever that far.
    controller.newColony('far');
    expect(texts().some((t) => t.includes('from any stockpile'))).toBe(false);
  });
});

describe('a raid on the way', () => {
  it('says when to expect the raiders, and that they are gathering on a small map', () => {
    controller.newColony('raid');
    const sim = controller.sim;
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    expect(
      spawnRaid(
        sim,
        FACTIONS.findIndex((f) => f.hostile),
        3,
      ),
    ).toBe(true);
    const raid = texts().find((t) => t.startsWith('Raid:'));
    expect(raid).toMatch(
      /gathering at the edge: here (within the hour|in about (an hour|\d+ hours))\. Draft with Q\.$/,
    );
  });
});
