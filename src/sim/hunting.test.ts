import { describe, expect, it } from 'vitest';
import { hurtAnimal, spareForBreeding } from './animals';
import { ANIMALS, FACTIONS, featureId, itemDef, itemId } from './defs';
import { HUNT_RANGE, Simulation } from './simulation';
import { goodwillOf } from './trade';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { Animal } from './types';

function field(seed: number) {
  const sim = Simulation.newColony(seed);
  const { x, y } = clearAround(sim, 16);
  sim.animals = [];
  // Just the hunt: no events in the way.
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  return { sim, w: sim.world, x, y };
}

function place(sim: Simulation, kind: string, tile: number, extra: Partial<Animal> = {}): Animal {
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

const kin = () => FACTIONS.findIndex((f) => !f.hostile);
const all = { x0: 0, y0: 0, x1: 63, y1: 63 };

describe('hunting only the surplus', () => {
  it('leaves a breeding pair of each kind unmarked when the player marks a whole herd', () => {
    const { sim, w, x, y } = field(41);
    sim.apply({ type: 'policy', hunting: 'surplus' });
    for (let k = 0; k < 5; k++) {
      place(sim, 'deer', w.idx(x + 8, y - 4 + k));
    }
    place(sim, 'hare', w.idx(x - 8, y));
    sim.apply({ type: 'hunt', rect: all, add: true });
    const deer = sim.animals.filter((a) => a.kind === 'deer');
    expect(deer.filter((a) => a.hunted).length).toBe(3);
    // A lone hare is all there is of its kind: it's left be.
    expect(sim.animals.find((a) => a.kind === 'hare')!.hunted).toBe(false);
  });

  it('has hunters stop at the last pair, even of animals marked before', () => {
    const { sim, w, x, y } = field(42);
    for (const c of sim.colonists) {
      c.priorities.hunting = 1;
      c.needs.food = 1;
    }
    for (let k = 0; k < 4; k++) {
      place(sim, 'deer', w.idx(x + 6, y - 2 + k), { hunted: true });
    }
    // Marked under "hunt all", then the policy changes.
    sim.apply({ type: 'policy', hunting: 'surplus' });
    for (const a of sim.animals) {
      a.hunted = true;
    }
    run(sim, HOUR * 10);
    expect(sim.animals.filter((a) => a.kind === 'deer').length).toBe(2);
    expect(sim.stats.hunted).toBe(2);
    expect(sim.animals.every((a) => spareForBreeding(sim, a))).toBe(true);
  });

  it('hunts down the last ones when told to hunt all', () => {
    const { sim, w, x, y } = field(42);
    for (const c of sim.colonists) {
      c.priorities.hunting = 1;
      c.needs.food = 1;
    }
    for (let k = 0; k < 3; k++) {
      place(sim, 'deer', w.idx(x + 6, y - 2 + k), { hunted: true });
    }
    run(sim, HOUR * 12);
    expect(sim.animals.filter((a) => a.kind === 'deer').length).toBe(0);
  });
});

describe('the Meadow Kin mind the valley', () => {
  it('lose goodwill when the colony kills the last of a kind, and say so', () => {
    const { sim, w, x, y } = field(43);
    const before = goodwillOf(sim, kin());
    const a = place(sim, 'deer', w.idx(x + 3, y), { hunted: true });
    place(sim, 'hare', w.idx(x + 5, y));
    hurtAnimal(sim, a, 100, sim.colonists[0]);
    expect(goodwillOf(sim, kin())).toBeLessThan(before);
    expect(sim.log.some((l) => l.text.includes('last deer'))).toBe(true);
    // Not every lone animal shot is a new grievance.
    const after = goodwillOf(sim, kin());
    const b = place(sim, 'boar', w.idx(x + 4, y), { hunted: true });
    hurtAnimal(sim, b, 100, sim.colonists[0]);
    expect(goodwillOf(sim, kin())).toBe(after);
  });

  it('do not mind a herd thinned with a pair left', () => {
    const { sim, w, x, y } = field(44);
    const before = goodwillOf(sim, kin());
    const herd = [0, 1, 2].map((k) => place(sim, 'deer', w.idx(x + 3, y + k), { hunted: true }));
    hurtAnimal(sim, herd[0], 100, sim.colonists[0]);
    expect(goodwillOf(sim, kin())).toBe(before);
  });

  it('lose goodwill when the colony hunts the herds wary', () => {
    const { sim, w, x, y } = field(45);
    const before = goodwillOf(sim, kin());
    for (let k = 0; k < 12; k++) {
      place(sim, 'grouse', w.idx(x + 6, y - 6 + k), { hunted: true });
    }
    for (const a of sim.animals.slice(0, 9)) {
      hurtAnimal(sim, a, 100, sim.colonists[0]);
    }
    expect(sim.story.waryUntil).toBeGreaterThan(sim.tick);
    expect(goodwillOf(sim, kin())).toBeLessThan(before);
    expect(sim.log.some((l) => l.text.includes('displeased'))).toBe(true);
  });
});

describe('hunting range', () => {
  it('leaves marked game far from home alone until it comes within range', () => {
    const sim = Simulation.newColony(43, 'standard', 192);
    const w = sim.world;
    const { x, y } = clearAround(sim, 16);
    sim.animals = [];
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    for (const c of sim.colonists) {
      c.priorities.hunting = 1;
      c.needs.food = 1;
    }
    const home = sim.homeTile() ?? sim.colonists[0].tile;
    const region = sim.regionOf(w.idx(x, y));
    // A deer about 70 tiles off, on ground the colonists can reach.
    let far = -1;
    for (let i = 0; i < w.size && far < 0; i++) {
      const d = w.distance(home, i);
      if (d > HUNT_RANGE + 20 && d < HUNT_RANGE + 26 && w.isPassable(i) && sim.regionOf(i) === region) {
        far = i;
      }
    }
    expect(far).toBeGreaterThanOrEqual(0);
    const deer = place(sim, 'deer', far, { hunted: true, restUntil: Number.MAX_SAFE_INTEGER });
    let setOut = false;
    for (let t = 0; t < HOUR * 2; t++) {
      sim.step();
      setOut ||= sim.colonists.some((c) => c.job?.type === 'hunt');
    }
    expect(setOut).toBe(false);
    expect(deer.hp).toBe(ANIMALS.deer.hp);
    // Within range, it's hunted.
    deer.tile = w.idx(x + 10, y);
    deer.path = [];
    run(sim, HOUR * 6);
    expect(sim.stats.hunted).toBe(1);
  });
});

describe('marked game out of range', () => {
  it('is free to move on, and the range is measured from the colony, not a wandering colonist', () => {
    const sim = Simulation.newColony(44, 'standard', 192);
    const w = sim.world;
    sim.animals = [];
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    // Nothing built yet: the range is measured from the middle of the map, where the colony landed.
    const centre = w.idx(96, 96);
    expect(sim.inHuntRange(centre)).toBe(true);
    expect(sim.inHuntRange(w.idx(96, 96 + HUNT_RANGE + 5))).toBe(false);
    sim.colonists[0].tile = w.idx(5, 5);
    expect(sim.inHuntRange(w.idx(8, 8))).toBe(false);
    // A deer marked far off, and moving on: it heads off rather than waiting for a hunter who won't come.
    let far = -1;
    for (let i = 0; i < w.size && far < 0; i++) {
      if (w.isPassable(i) && !sim.inHuntRange(i, 20) && sim.regionOf(i) === sim.outsideRegion()) {
        far = i;
      }
    }
    const deer = place(sim, 'deer', far, { hunted: true, leaving: true });
    expect(sim.huntable(deer)).toBe(false);
    run(sim, HOUR * 2);
    expect(deer.tile === far && sim.animals.includes(deer)).toBe(false);
    // Livestock in a far pen can still be marked for slaughter.
    const cow = place(sim, 'muskox', far, { hunted: true, tame: true });
    expect(sim.huntable(cow)).toBe(true);
  });
});

describe('the colony provider', () => {
  it('goes for food before other work when food is short (once there is shelter)', () => {
    const { sim, w, x, y } = field(45);
    // A hut, so the first shelter is done.
    for (const i of outline(w, x - 6, y - 6, x - 2, y - 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x - 4, y - 2), featureId('door'));
    expect(sim.hasShelter()).toBe(true);
    // Nothing to eat in the stores, and building to do at top priority.
    for (let i = 0; i < w.size; i++) {
      if (w.itemType[i] !== 0 && itemDef(w.itemType[i]).nutrition > 0) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    sim.apply({ type: 'build', feature: featureId('woodWall'), tiles: [w.idx(x + 4, y + 4)] });
    w.addItem(w.idx(x + 3, y + 4), itemId('wood'), 50);
    sim.colonists.forEach((c, k) => {
      c.priorities.construction = 1;
      c.priorities.hunting = 3;
      c.skills.animals = k === 1 ? 12 : 1;
      c.needs.food = 1;
      c.job = null;
    });
    place(sim, 'deer', w.idx(x + 8, y), { hunted: true });
    run(sim, 60);
    expect(sim.colonists[1].job?.type).toBe('hunt');
    expect(sim.colonists.filter((c) => c.job?.type === 'hunt')).toHaveLength(1);
  });

  it('is someone who can go: not asleep, laid up in bed or in a break', () => {
    const { sim, w, x, y } = field(46);
    for (const i of outline(w, x - 6, y - 6, x - 2, y - 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x - 4, y - 2), featureId('door'));
    for (let i = 0; i < w.size; i++) {
      if (w.itemType[i] !== 0 && itemDef(w.itemType[i]).nutrition > 0) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    sim.colonists.forEach((c, k) => {
      c.priorities.hunting = 3;
      c.skills.animals = 12 - k;
    });
    const providers = () => (sim as unknown as { providers(): number[] }).providers();
    const after = () => {
      (sim as unknown as { providersAt: number }).providersAt = 0;
      return providers();
    };
    // (With nothing at all to eat there's a second, to fish: the first is the best hunter who can go.)
    expect(after()[0]).toBe(sim.colonists[0].id);
    sim.colonists[0].sleeping = true;
    expect(after()[0]).toBe(sim.colonists[1].id);
  });

  it("fishes without a hut from the third day (a desert island's hut took two weeks)", () => {
    const { sim, w } = field(47);
    for (let i = 0; i < w.size; i++) {
      if (w.itemType[i] !== 0 && itemDef(w.itemType[i]).nutrition > 0) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    sim.colonists.forEach((c, k) => {
      c.priorities.hunting = 3;
      c.skills.animals = 12 - k;
    });
    expect(sim.hasShelter()).toBe(false);
    const providers = () => {
      (sim as unknown as { providersAt: number }).providersAt = 0;
      return (sim as unknown as { providers(): number[] }).providers();
    };
    // The first night's hut comes first...
    expect(providers()).toEqual([]);
    // ...but not for two weeks.
    sim.tick += 2 * 24 * HOUR;
    sim.syncClock();
    expect(providers().length).toBeGreaterThan(0);
  });

  it('sends a second, with under half a day of food, to fish but not to hunt', () => {
    // (Off after game, the second starved a valley colony worse than staying in the fields; at a fishing spot,
    // they fed an island one.)
    const { sim, w, x, y } = field(48);
    for (const i of outline(w, x - 6, y - 6, x - 2, y - 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x - 4, y - 2), featureId('door'));
    for (let i = 0; i < w.size; i++) {
      if (w.itemType[i] !== 0 && itemDef(w.itemType[i]).nutrition > 0) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    sim.colonists.forEach((c, k) => {
      c.priorities.hunting = 3;
      c.skills.animals = k < 2 ? 12 - k : 0;
      c.needs.food = 1;
      c.job = null;
    });
    place(sim, 'deer', w.idx(x + 8, y), { hunted: true });
    run(sim, 60);
    // No fishing spot: the best hunter hunts, and the second stays at their work.
    expect(sim.colonists[0].job?.type).toBe('hunt');
    expect(sim.colonists[1].job?.type).not.toBe('hunt');
  });
});
