import { describe, expect, it } from 'vitest';
import { FAR_RANGE, FAR_TURN, animalsAtDawn, herdArrives, herdsWary, hurtAnimal, wildCap, wildScale } from './animals';
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

describe('hunters return', () => {
  it('a valley full of game and no predators draws a pack back now and then; a bare one does not', () => {
    // (Predators that ate the valley bare moved on and never came again: ten years of grazers alone.)
    const predators = (sim: Simulation) => sim.animals.filter((a) => !a.tame && a.hp > 0 && ANIMALS[a.kind].preys);
    const sim = Simulation.newColony(21, 'standard', 96);
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.animals = sim.animals.filter((a) => !ANIMALS[a.kind].preys);
    let dawns = 0;
    while (predators(sim).length === 0 && dawns < 400) {
      animalsAtDawn(sim);
      dawns++;
    }
    expect(predators(sim).length).toBeGreaterThan(0);
    expect(sim.storyLog.some((s) => /has come into the valley to hunt/.test(s.text))).toBe(true);
    // No game, no pack.
    const bare = Simulation.newColony(22, 'standard', 96);
    bare.animals = [];
    for (let k = 0; k < 400; k++) {
      animalsAtDawn(bare);
      bare.animals = bare.animals.filter((a) => ANIMALS[a.kind].preys);
    }
    expect(predators(bare)).toHaveLength(0);
  });
});

describe('far-off wildlife', () => {
  // A Medium map with the wildlife cleared, and a walkable tile in the far corner from the colonists.
  function farField(seed: number) {
    const sim = Simulation.newColony(seed, 'standard', 128);
    sim.animals = [];
    const w = sim.world;
    const cx = Math.round(sim.living().reduce((s, c) => s + w.xOf(c.tile), 0) / sim.living().length);
    const cy = Math.round(sim.living().reduce((s, c) => s + w.yOf(c.tile), 0) / sim.living().length);
    const fx = cx < 64 ? 120 : 8;
    const fy = cy < 64 ? 120 : 8;
    let far = -1;
    for (let r = 0; far < 0 && r < 8; r++) {
      for (let dy = -r; far < 0 && dy <= r; dy++) {
        for (let dx = -r; far < 0 && dx <= r; dx++) {
          const t = w.idx(fx + dx, fy + dy);
          if (w.isPassable(t) && sim.regionOf(t) !== undefined) {
            far = t;
          }
        }
      }
    }
    expect(far).toBeGreaterThanOrEqual(0);
    for (const c of sim.living()) {
      expect(Math.max(Math.abs(w.xOf(c.tile) - w.xOf(far)), Math.abs(w.yOf(c.tile) - w.yOf(far)))).toBeGreaterThan(
        FAR_RANGE,
      );
    }
    return { sim, w, far };
  }

  it('lets an idle animal far from everyone take a turn only now and then, at the same walking pace', () => {
    const { sim, far } = farField(41);
    const deer = place(sim, 'deer', far);
    for (let t = 0; t < FAR_TURN; t++) {
      sim.step();
    }
    expect(deer.dozing).toBe(true);
    // Between its turns nothing about it changes; on its turn it walks the ticks it missed.
    let moved = 0;
    let changedOffTurn = 0;
    for (let t = 0; t < 400; t++) {
      const before = deer.moveProgress + deer.tile;
      // (The clock moves on before the animals do.)
      const turn = (sim.tick + 1 + deer.id) % FAR_TURN === 0;
      sim.step();
      if (deer.moveProgress + deer.tile !== before) {
        moved++;
        if (!turn) {
          changedOffTurn++;
        }
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(changedOffTurn).toBe(0);
  });

  it('keeps an animal awake that is chased or near someone, but lets one marked for the hunt doze till a hunter comes', () => {
    const { sim, w, far } = farField(42);
    const marked = place(sim, 'deer', far, { hunted: true });
    const prey = place(sim, 'hare', far);
    const wolf = place(sim, 'wolf', far, { chasing: prey.id, fedUntil: 0 });
    const c = sim.living()[0];
    const near = place(sim, 'deer', w.neighbors(c.tile).find((n) => w.isPassable(n))!);
    for (let t = 0; t < FAR_TURN * 2; t++) {
      sim.step();
    }
    // Nobody near it yet: a hunter coming for it wakes it once within reach.
    expect(marked.dozing).toBe(true);
    expect(wolf.dozing).toBe(false);
    expect(near.dozing).toBe(false);
    // The hare stays awake while the wolf is after it.
    expect(wolf.chasing === prey.id ? prey.dozing : false).toBe(false);
  });

  it('plays the same for a seed, and keeps dozing through a save', () => {
    const play = () => {
      const { sim, far } = farField(43);
      place(sim, 'deer', far);
      place(sim, 'boar', far);
      for (let t = 0; t < 600; t++) {
        sim.step();
      }
      return sim;
    };
    const a = play();
    const b = play();
    expect(a.animals.map((x) => [x.tile, x.moveProgress, x.dozing])).toEqual(
      b.animals.map((x) => [x.tile, x.moveProgress, x.dozing]),
    );
    const copy = deserialize(structuredClone(serialize(a)));
    expect(copy.animals.map((x) => x.dozing)).toEqual(a.animals.map((x) => x.dozing));
  });
});

describe('wildlife on big maps', () => {
  it('grows with the area up to a Large map, and with the side past it', () => {
    expect(wildScale(64)).toBe(1);
    expect(wildScale(128)).toBe(4);
    expect(wildScale(192)).toBe(9);
    expect(wildScale(256)).toBe(12);
  });
});
