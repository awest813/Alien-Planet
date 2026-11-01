import { describe, expect, it } from 'vitest';
import { animalsAtDawn, herdArrives } from './animals';
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

  it('keeps a predator’s hunt through a save', () => {
    const { sim, w, x, y } = field(17);
    const wolf = place(sim, 'wolf', w.idx(x + 2, y), { chasing: 99, fedUntil: 1234 });
    const copy = deserialize(structuredClone(serialize(sim)));
    const saved = copy.animals.find((a) => a.id === wolf.id)!;
    expect(saved.chasing).toBe(99);
    expect(saved.fedUntil).toBe(1234);
  });
});
