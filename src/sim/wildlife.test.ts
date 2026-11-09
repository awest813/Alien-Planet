import { describe, expect, it } from 'vitest';
import { animalsAtDawn, herdArrives, herdsWary, hurtAnimal, wildCap } from './animals';
import { ANIMALS, featureId, itemId, matchesIngredient } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { triggerEvent } from './storyteller';
import { clearAround, run } from './test-helpers';
import { Animal } from './types';

// A cleared colony with every wild animal removed, so tests place exactly what they need.
function field(seed: number) {
  const sim = Simulation.newColony(seed);
  const { x, y } = clearAround(sim, 14);
  sim.animals = [];
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

describe('wildlife variety', () => {
  it('has wolves, foxes, muskoxen and grouse alongside deer, hares and boars', () => {
    for (const kind of ['deer', 'hare', 'boar', 'wolf', 'fox', 'muskox', 'grouse']) {
      expect(ANIMALS[kind]).toBeDefined();
      const [least, most] = ANIMALS[kind].group;
      expect(least).toBeGreaterThan(0);
      expect(most).toBeGreaterThanOrEqual(least);
    }
  });

  it('brings herds in each species’ own numbers', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { sim } = field(seed);
      const count = herdArrives(sim);
      expect(count).toBeGreaterThan(0);
      const kind = sim.animals[sim.animals.length - 1].kind;
      const [least, most] = ANIMALS[kind].group;
      expect(count).toBeGreaterThanOrEqual(least);
      expect(count).toBeLessThanOrEqual(most);
    }
  });

  it('has predators run down prey and leave a carcass behind', () => {
    const { sim, w, x, y } = field(13);
    // Colonists out of the way so the deer only runs from the wolf.
    for (const c of sim.colonists) {
      c.tile = w.idx(x - 13, y - 13);
      c.schedule.fill('S');
    }
    const wolf = place(sim, 'wolf', w.idx(x + 2, y));
    const deer = place(sim, 'deer', w.idx(x + 6, y));
    const meat = sim.stockOf(itemId('rawMeat'));
    for (let t = 0; t < 2000 && deer.hp > 0; t++) {
      for (const c of sim.colonists) {
        c.tile = w.idx(x - 13, y - 13);
        c.path = [];
      }
      sim.step();
    }
    expect(deer.hp).toBeLessThanOrEqual(0);
    expect(sim.stockOf(itemId('rawMeat'))).toBeGreaterThan(meat);
    expect(wolf.fedUntil ?? 0).toBeGreaterThan(sim.tick);
  });

  it('leaves people alone unless provoked (predators only hunt animals)', () => {
    const { sim, w, x, y } = field(14);
    place(sim, 'wolf', w.idx(x + 3, y));
    run(sim, 600);
    expect(sim.colonists.every((c) => c.health.injuries.length === 0)).toBe(true);
  });

  it('gives wool from tame muskoxen and eggs from tame grouse each morning', () => {
    const { sim, w, x, y } = field(15);
    place(sim, 'muskox', w.idx(x + 3, y), { tame: true });
    place(sim, 'grouse', w.idx(x + 4, y), { tame: true });
    animalsAtDawn(sim);
    expect(sim.stockOf(itemId('wool'))).toBe(ANIMALS.muskox.produce!.count);
    expect(sim.stockOf(itemId('egg'))).toBe(ANIMALS.grouse.produce!.count);
  });

  it('spins wool into cloth and counts eggs as meat for fine meals', () => {
    const { sim, w, x, y } = field(16);
    expect(matchesIngredient(itemId('egg'), { foodKind: 'meat', count: 1 })).toBe(true);
    w.setFeature(w.idx(x + 3, y), featureId('craftingBench'));
    w.dropItemNear(w.idx(x, y + 3), itemId('wool'), 12);
    for (const c of sim.colonists) {
      c.priorities.crafting = 1;
    }
    const cloth = sim.stockOf(itemId('cloth'));
    run(sim, 1200);
    expect(sim.stockOf(itemId('cloth'))).toBeGreaterThan(cloth);
  });

  it('sends wolf packs as manhunters sometimes', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 12 && kinds.size < 2; seed++) {
      const { sim } = field(seed);
      triggerEvent(sim, 'manhunters');
      for (const a of sim.animals) {
        if (a.manhunter) {
          kinds.add(a.kind);
        }
      }
    }
    expect(kinds.has('wolf')).toBe(true);
  });

  it('has a pack share its kill', () => {
    const { sim, w, x, y } = field(18);
    for (const c of sim.colonists) {
      c.tile = w.idx(x - 13, y - 13);
      c.schedule.fill('S');
    }
    const hunter = place(sim, 'wolf', w.idx(x + 2, y));
    const packmate = place(sim, 'wolf', w.idx(x + 2, y + 1), { fedUntil: sim.tick + 1e6 });
    const deer = place(sim, 'deer', w.idx(x + 5, y));
    for (let t = 0; t < 2000 && deer.hp > 0; t++) {
      sim.step();
    }
    expect(deer.hp).toBeLessThanOrEqual(0);
    // Hungry again (just now, not for days, or they'd move on): the packmate eats from the next kill.
    packmate.fedUntil = sim.tick;
    hunter.fedUntil = sim.tick;
    hunter.tile = w.idx(x + 2, y);
    hunter.path = [];
    packmate.tile = w.idx(x + 2, y + 1);
    packmate.restUntil = sim.tick + 1e6;
    const second = place(sim, 'deer', w.idx(x + 5, y));
    for (let t = 0; t < 2000 && second.hp > 0; t++) {
      sim.step();
    }
    expect(second.hp).toBeLessThanOrEqual(0);
    expect(packmate.fedUntil).toBeGreaterThan(sim.tick);
  });

  it('sends predators with nothing left to hunt off the map, leaving nothing behind', () => {
    const { sim, w, x, y } = field(19);
    const wolf = place(sim, 'wolf', w.idx(x + 3, y), { fedUntil: 0 });
    sim.tick += 3 * 24 * 200;
    animalsAtDawn(sim);
    expect(wolf.leaving).toBe(true);
    const meat = sim.stockOf(itemId('rawMeat'));
    for (let t = 0; t < 8000 && sim.animals.includes(wolf); t++) {
      sim.step();
    }
    expect(sim.animals.includes(wolf)).toBe(false);
    expect(sim.stockOf(itemId('rawMeat'))).toBe(meat);
  });

  it('sends the longest-staying herd away when the map is crowded, but not animals marked for work', () => {
    const { sim, w, x, y } = field(20);
    const first = [0, 1, 2].map((n) => place(sim, 'deer', w.idx(x + 4 + n, y + 4)));
    first[2].hunted = true;
    while (sim.animals.length < wildCap(sim)) {
      place(sim, 'muskox', w.idx(x - 6 + (sim.animals.length % 5), y - 6));
    }
    animalsAtDawn(sim);
    expect(first[0].leaving && first[1].leaving).toBe(true);
    expect(first[2].leaving).toBeFalsy();
    expect(sim.animals.filter((a) => a.kind === 'muskox').some((a) => a.leaving)).toBe(false);
  });

  it('brings no second pack of predators while one is about', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { sim, w, x, y } = field(seed);
      place(sim, 'wolf', w.idx(x + 3, y));
      herdArrives(sim);
      expect(sim.animals.slice(1).every((a) => !ANIMALS[a.kind].preys)).toBe(true);
    }
  });

  it('keeps a predator’s hunt through a save', () => {
    const { sim, w, x, y } = field(17);
    const wolf = place(sim, 'wolf', w.idx(x + 2, y), { chasing: 99, fedUntil: 1234 });
    const copy = deserialize(structuredClone(serialize(sim)));
    const saved = copy.animals.find((a) => a.id === wolf.id)!;
    expect(saved.chasing).toBe(99);
    expect(saved.fedUntil).toBe(1234);
  });
});

describe('a living valley', () => {
  it('has wild herds raise young in spring and summer, while there is room', () => {
    const { sim, w, x, y } = field(31);
    sim.tick = 3 * 24 * 200;
    sim.syncClock();
    expect(sim.season).toBe('Spring');
    for (let k = 0; k < 4; k++) {
      place(sim, 'deer', w.idx(x + 5 + k, y + 5));
    }
    const deer = () => sim.animals.filter((a) => a.kind === 'deer');
    for (let d = 0; d < 20 && deer().length === 4; d++) {
      animalsAtDawn(sim);
    }
    // (Another kind may wander in meanwhile; it's the deer that matter here.)
    expect(deer().length).toBeGreaterThan(4);
    expect(deer().every((a) => !a.tame)).toBe(true);
    expect(sim.animals.length).toBeLessThanOrEqual(Math.ceil(wildCap(sim) * 0.75) + 1);
  });

  it('grows wary of a colony that hunts it hard', () => {
    const { sim, w, x, y } = field(32);
    expect(herdsWary(sim)).toBe(false);
    for (let k = 0; k < 9; k++) {
      const a = place(sim, 'hare', w.idx(x + 3, y + k - 4), { hunted: true });
      hurtAnimal(sim, a, 100, sim.colonists[0]);
    }
    expect(herdsWary(sim)).toBe(true);
    expect(sim.storyLog.some((s) => s.text.includes('grown wary'))).toBe(true);
    // A save keeps it, and it passes.
    expect(herdsWary(deserialize(structuredClone(serialize(sim))))).toBe(true);
    sim.tick += 11 * 24 * 200;
    expect(herdsWary(sim)).toBe(false);
  });
});
