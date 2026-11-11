import { afterEach, describe, expect, it, vi } from 'vitest';
import { FACTIONS, featureId, itemId } from '../sim/defs';
import { Designation, STOCKPILE_ZONE } from '../sim/world';
import { DAYS_PER_SEASON } from '../sim/seasons';
import { HOUR, clearAround, outline } from '../sim/test-helpers';
import { Simulation, TICKS_PER_HOUR } from '../sim/simulation';
import { spawnRaid } from '../sim/combat';
import { Alert, TOOLS, controller } from './controller';
import { deserialize, serialize } from '../sim/serialize';
import { DEFAULT_SETTINGS, loadSettings } from './settings';

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
    // One shut in with the bed, the rest out in the cold: it says who's locked out. (It said nothing, and in a
    // test colony four of five froze outside the door in a cold snap.)
    const [inside, ...outside] = sim.living();
    inside.tile = w.idx(x + 3, y - 1);
    expect(texts().some((t) => t.startsWith('Nobody can get to the beds'))).toBe(false);
    const names = outside.map((c) => c.name);
    const listed = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    expect(texts()).toContain(`${listed} can't get to a bed: check the way in (is the door blocked?)`);
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

describe('loading a colony', () => {
  it('drops the new-game "give your first orders" banner for a game already under way', () => {
    controller.newColony('fresh');
    controller.publish();
    expect(controller.getState().notStarted).toBe(true);
    // A save loaded before the clock was ever started.
    const loaded = Simulation.newColony(77);
    loaded.tick = 30 * 24 * TICKS_PER_HOUR;
    (controller as unknown as { replaceSim(sim: Simulation): void }).replaceSim(loaded);
    controller.publish();
    expect(controller.getState().notStarted).toBe(false);
  });
});

describe('the tile card', () => {
  const card = (tile: number) =>
    (controller as unknown as { describeTile(i: number): { details: string[] } }).describeTile(tile);

  it('says what a tree or rock gives and which order gets it, until it is ordered', () => {
    const { w, x, y } = colony('card');
    const tree = w.idx(x + 3, y);
    w.setFeature(tree, featureId('tree'));
    expect(card(tree).details.some((d) => /^Chop \(C\) for \d+ wood$/.test(d))).toBe(true);
    const rock = w.idx(x - 3, y);
    w.setFeature(rock, featureId('rock'));
    expect(card(rock).details.some((d) => d.startsWith('Mine (M) for '))).toBe(true);
    w.designation[tree] = Designation.CHOP;
    expect(card(tree).details.some((d) => d.startsWith('Chop (C) for'))).toBe(false);
  });
});

describe('saving and loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const replace = (sim: Simulation) => (controller as unknown as { replaceSim(sim: Simulation): void }).replaceSim(sim);

  it('autosaves on quitting while the only colonists left are away on a trip', async () => {
    controller.newColony('away');
    controller.setSpeed(1);
    const sim = controller.sim;
    const [home, ...party] = sim.colonists;
    for (const c of party) {
      c.away = 'gone';
    }
    home.health.dead = true;
    expect(sim.living().length).toBe(0);
    const save = vi.spyOn(controller, 'save').mockResolvedValue(true);
    expect(await controller.quitToTitle()).toBe(true);
    expect(save).toHaveBeenCalledWith('autosave', true);
  });

  it("doesn't autosave a new colony whose clock was never started", async () => {
    controller.newColony('unstarted');
    const save = vi.spyOn(controller, 'save').mockResolvedValue(true);
    expect(await controller.quitToTitle()).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('opens a loaded colony at home, not where the first colonist died', () => {
    controller.newColony('focus');
    const sim = controller.sim;
    sim.colonists[0].health.dead = true;
    sim.colonists[0].tile = sim.world.idx(1, 1);
    replace(deserialize(serialize(sim)));
    const focus = controller.focusRequest!;
    expect(focus).not.toBe(sim.world.idx(1, 1));
    expect(controller.sim.living().some((c) => controller.sim.world.distance(c.tile, focus) < 20)).toBe(true);
  });
});

describe('controls and settings', () => {
  it('gives no tool a key the game keeps for itself', () => {
    const reserved = new Set(['h', 'q', 'w', 'a', 's', 'd', '1', '2', '3', ' ', 'Tab']);
    expect(TOOLS.filter((t) => reserved.has(t.hotkey)).map((t) => t.id)).toEqual([]);
    const keys = TOOLS.map((t) => t.hotkey).filter((k) => k);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('puts stored settings no option offers back in range', () => {
    const stored = { uiScale: 0, noticeSeconds: -5, panSpeed: 0, masterVolume: 40, musicVolume: -1, showNames: false };
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(stored), setItem: () => undefined });
    const s = loadSettings();
    expect(s.uiScale).toBe(DEFAULT_SETTINGS.uiScale);
    expect(s.noticeSeconds).toBe(DEFAULT_SETTINGS.noticeSeconds);
    expect(s.panSpeed).toBe(DEFAULT_SETTINGS.panSpeed);
    expect(s.masterVolume).toBe(1);
    expect(s.musicVolume).toBe(0);
    expect(s.showNames).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('second audit: the interface', () => {
  const toast = () => controller.getState().toast;

  it('stands everyone down with Q even while one of them is in a mental break', () => {
    controller.newColony('draft');
    const sim = controller.sim;
    const [broken, ...rest] = sim.colonists;
    sim.startBreak(broken, 'daze', 4);
    controller.toggleDraftAll();
    expect(rest.every((c) => c.drafted)).toBe(true);
    controller.toggleDraftAll();
    expect(rest.some((c) => c.drafted)).toBe(false);
  });

  it('says on the spot why a dealing with the wider world was refused', () => {
    controller.newColony('away');
    const sim = controller.sim;
    controller.command({
      type: 'world',
      action: { kind: 'expedition', to: 0, purpose: 'salvage', colonists: sim.colonists.map((c) => c.id) },
    });
    expect(toast()).toBeTruthy();
    expect(sim.colonists.some((c) => c.away)).toBe(false);
  });

  it("judges the leader's spirits by the bar the colony does, which rises over the years", () => {
    controller.newColony('leader');
    const sim = controller.sim;
    sim.village.leader = 0;
    sim.colonists[0].mood = 50;
    sim.tick = 6 * 24 * 24 * HOUR;
    sim.syncClock();
    controller.publish();
    expect(controller.getState().village.leader?.spirits).toBe('fair');
  });

  it('shows Draft all while maddened animals hunt the colony, not only in a raid', () => {
    controller.newColony('pack');
    const sim = controller.sim;
    expect(controller.getState().animalsAttacking).toBe(false);
    const a = sim.animals[0];
    a.manhunter = true;
    a.revengeOn = sim.colonists[0].id;
    controller.publish();
    expect(controller.getState().animalsAttacking).toBe(true);
  });
});

describe('fourth audit: a newcomer playing', () => {
  const goal = (id: string) => {
    controller.publish();
    return controller.getState().objectives.find((o) => o.id === id)!;
  };

  it('moves the shelter goal on to the door once walls are up without one', () => {
    const { w, x, y } = colony('door');
    expect(goal('shelter').tool).toBe('woodWall');
    for (const i of outline(w, x + 2, y - 2, x + 6, y + 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    expect(goal('shelter').tool).toBe('door');
    w.setFeature(w.idx(x + 2, y), featureId('door'));
    expect(goal('shelter').tool).toBe('woodWall');
  });

  it('stops asking for a stove once there is one', () => {
    const { w, x, y } = colony('stove');
    expect(goal('meals').how).toMatch(/Build a stove/);
    w.setFeature(w.idx(x + 3, y), featureId('stove'));
    expect(goal('meals').how).toMatch(/raw food/);
  });

  it('says so when a hunt drag catches no animals', () => {
    const { sim } = colony('hunt');
    sim.animals = [];
    controller.sayIfNoAnimals({ x0: 0, y0: 0, x1: 5, y1: 5 }, 'hunt');
    expect(controller.getState().toast).toMatch(/No animals there to hunt/);
  });

  it('tells the silver in storage from the silver lying about', () => {
    const { sim, w, x, y } = colony('silver');
    w.addItem(w.idx(x + 3, y), itemId('silver'), 40);
    controller.publish();
    const d = controller.getState().diplomacy;
    expect(d.looseSilver).toBeGreaterThanOrEqual(40);
    expect(d.silver + d.looseSilver).toBe(sim.stockOf(itemId('silver')));
  });
});

describe('mid-game: what the screens say', () => {
  it("alerts an ally's call for help and a quarrel, and lights Factions, while they wait on an answer", () => {
    const { sim } = colony('calls');
    const friend = FACTIONS.findIndex((f) => !f.hostile);
    const other = FACTIONS.findIndex((f, i) => i !== friend);
    sim.diplomacy.call = { faction: friend, until: sim.tick + 30 * HOUR, item: itemId('wood'), count: 40 };
    sim.diplomacy.dispute = { a: friend, b: other, about: 'grazing', until: sim.tick + 40 * HOUR };
    const said = texts();
    expect(said.some((t) => t.includes('ask for help') && t.includes('left'))).toBe(true);
    expect(said.some((t) => t.includes('quarrelling'))).toBe(true);
  });

  it('moves goal help on once its research is done', () => {
    const { sim } = colony('research');
    controller.publish();
    const power = () => controller.getState().objectives.find((o) => o.id === 'power')!;
    expect(power().screen).toBe('research');
    sim.research.done.push('electricity');
    controller.publish();
    expect(power().tool).toBe('woodGenerator');
    expect(power().how).toMatch(/researched/);
  });

  it('says what a production bill is short of', () => {
    const { sim } = colony('bills');
    sim.research.done.push('tailoring');
    controller.publish();
    const view = controller.getState().bills.find((b) => /parka/i.test(b.name));
    expect(view?.short).toMatch(/leather/i);
  });

  it('warns that raiders are already on colonists working by the edge they come from', () => {
    const { sim } = colony('edge');
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    const w = sim.world;
    // Everyone out by the west edge, where the raiders will come in.
    for (const c of sim.colonists) {
      c.tile = w.idx(2, w.yOf(c.tile));
    }
    const hostile = FACTIONS.findIndex((f) => f.hostile);
    let tries = 0;
    while (!spawnRaid(sim, hostile, 3) && tries++ < 3);
    const raidLine = sim.log.map((l) => l.text).find((t) => t.startsWith('Raid!'))!;
    const near = sim.enemies.some((e) => sim.colonists.some((c) => w.distance(c.tile, e.tile) <= 14));
    expect(raidLine).toMatch(near ? /already on colonists/ : /will reach the colony/);
  });
});

describe('a hut with a gap in its walls', () => {
  it('says the walls leave a gap, rather than "plan walls and a door"', () => {
    const { sim, w, x, y } = colony('gap');
    const ring = outline(w, x + 2, y - 2, x + 6, y + 2);
    for (const i of ring) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 2, y), featureId('door'));
    // One tile of the far wall never built (over water, say).
    w.setFeature(w.idx(x + 6, y), 0);
    expect(sim.hasShelter()).toBe(false);
    sim.tick = 17 * HOUR - 7 * HOUR;
    sim.syncClock();
    expect(texts().some((t) => t.includes('leave a gap'))).toBe(true);
    controller.publish();
    expect(controller.getState().objectives.find((o) => o.id === 'shelter')?.how).toMatch(/gap/);
  });
});

describe('a maddened pack on its way', () => {
  it('has an alert to find it by before it attacks', () => {
    const { sim } = colony('pack-coming');
    const a = sim.animals[0];
    a.manhunter = true;
    a.revengeOn = -1;
    a.musterUntil = sim.tick + 2 * HOUR;
    const line = texts().find((t) => t.includes('maddened animal'));
    expect(line).toMatch(/coming, gathering at the edge/);
  });
});

describe('drafting with Q', () => {
  it('drafts everyone when the selected colonist cannot be drafted', () => {
    const { sim } = colony('q-dead');
    controller.selectedColonist = 0;
    sim.colonists[0].health.downed = true;
    controller.draftKey();
    expect(sim.colonists.map((c) => c.drafted)).toEqual([false, true, true]);
    // With someone able selected, the key is theirs alone.
    controller.selectedColonist = 1;
    controller.draftKey();
    expect(sim.colonists.map((c) => c.drafted)).toEqual([false, false, true]);
  });

  it('stands down a drafted colonist who has since collapsed', () => {
    const { sim } = colony('q-downed');
    controller.selectedColonist = null;
    controller.toggleDraftAll();
    expect(sim.colonists.every((c) => c.drafted)).toBe(true);
    sim.colonists[0].health.downed = true;
    controller.toggleDraftAll();
    expect(sim.colonists.map((c) => c.drafted)).toEqual([false, false, false]);
  });
});

describe('the ship waiting', () => {
  it('says where its choice is found once the dialog is closed', () => {
    const { sim } = colony('ship-waits');
    sim.beacon.landed = true;
    expect(texts().some((t) => t.includes('Ship, on the top bar'))).toBe(true);
  });
});

describe('fourth audit: the interface', () => {
  it('keeps a long numeric seed as typed text, so typing it again gives the same map', () => {
    controller.newColony('123456789012345678901234');
    const long = controller.getState().seed;
    expect(Number.isSafeInteger(long)).toBe(true);
    controller.newColony(String(long));
    expect(controller.getState().seed).toBe(long);
    controller.newColony('4242');
    expect(controller.getState().seed).toBe(4242);
  });

  it("runs the clock on the pause menu's Resume even if the game was paused before it opened", () => {
    controller.newColony('resume');
    controller.setSpeed(2);
    controller.setSpeed(0);
    controller.holdPause();
    controller.resumeAfterHold();
    controller.releasePause();
    expect(controller.getState().speed).toBe(2);
    // A new colony's clock still waits for its first orders.
    controller.newColony('resume');
    controller.holdPause();
    controller.resumeAfterHold();
    controller.releasePause();
    expect(controller.getState().speed).toBe(0);
  });
});
