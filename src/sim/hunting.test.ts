import { describe, expect, it } from 'vitest';
import { hurtAnimal, spareForBreeding } from './animals';
import { ANIMALS, FACTIONS } from './defs';
import { HUNT_RANGE, Simulation } from './simulation';
import { goodwillOf } from './trade';
import { HOUR, clearAround, run } from './test-helpers';
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
