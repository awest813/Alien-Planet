import { describe, expect, it } from 'vitest';
import { animalsAtDawn, hurtAnimal, wildCap } from './animals';
import { colonistCombat } from './combat';
import { ANIMALS, featureId, itemId } from './defs';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { dealBalance } from './trade';
import { Animal, Job } from './types';

function cleared(seed: number) {
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

describe('audit fixes', () => {
  it('sets down a half-gathered mix of ingredients part by part', () => {
    const { sim, w, x, y } = cleared(1);
    const c = sim.colonists[0];
    c.tile = w.idx(x + 4, y + 4);
    const berries = itemId('berries');
    const potatoes = itemId('potatoes');
    const before = [sim.stockOf(berries), sim.stockOf(potatoes)];
    c.job = { ...({} as Job), type: 'craft' };
    c.carrying = {
      item: berries,
      count: 6,
      mix: [
        { item: berries, count: 3 },
        { item: potatoes, count: 3 },
      ],
    };
    sim.endJob(c);
    expect(c.carrying).toBeNull();
    expect([sim.stockOf(berries), sim.stockOf(potatoes)]).toEqual([before[0] + 3, before[1] + 3]);
  });

  it('takes the roof off a greenhouse without waiting for the harvest', () => {
    const { sim, w, x, y } = cleared(2);
    const tile = w.idx(x + 3, y + 3);
    w.setFeature(tile, featureId('potatoPlant'));
    w.setLayer('roof', tile, featureId('roof'));
    sim.apply({ type: 'designate', kind: 'deconstruct', rect: { x0: x + 3, y0: y + 3, x1: x + 3, y1: y + 3 } });
    expect(w.designation[tile]).not.toBe(0);
  });

  it('rounds trades in the traders’ favour', () => {
    // Selling a single cheap item doesn't fetch double its price, and buying one isn't free.
    expect(dealBalance(0, 0.54)).toBe(0);
    expect(dealBalance(1.44, 0)).toBe(2);
    expect(dealBalance(10, 4)).toBe(6);
  });

  it('keeps a doorway as warm as the room it opens into', () => {
    const { sim, w, x, y } = cleared(3);
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    for (const i of outline(w, x + 2, y + 2, x + 7, y + 6)) {
      w.setFeature(i, featureId('woodWall'));
    }
    const door = w.idx(x + 2, y + 4);
    w.setFeature(door, featureId('door'));
    w.setFeature(w.idx(x + 5, y + 4), featureId('campfire'));
    run(sim, HOUR * 3);
    const inside = w.idx(x + 3, y + 4);
    expect(sim.isIndoors(inside)).toBe(true);
    expect(sim.temperatureAt(door)).toBe(sim.temperatureAt(inside));
    expect(sim.isRoofed(door)).toBe(true);
  });

  it('leaves an animal that snapped at its handler to the handler', () => {
    const { sim, w, x, y } = cleared(4);
    const [handler, other] = sim.colonists;
    handler.tile = w.idx(x + 3, y);
    other.tile = w.idx(x + 5, y);
    place(sim, 'boar', w.idx(x + 4, y), {
      revengeOn: handler.id,
      lashOut: true,
      revengeUntil: sim.tick + HOUR,
    });
    expect(colonistCombat(sim, other)).toBe(false);
  });

  it("doesn't count fending off a maddened animal as hunting", () => {
    const { sim, w, x, y } = cleared(5);
    const boar = place(sim, 'boar', w.idx(x + 3, y), { manhunter: true, revengeOn: 0 });
    hurtAnimal(sim, boar, 10, sim.colonists[0]);
    expect(boar.hp).toBeLessThanOrEqual(0);
    expect(sim.stats.hunted).toBe(0);
  });

  it("won't draft a colonist out of a mental break", () => {
    const { sim } = cleared(6);
    const c = sim.colonists[0];
    c.breakUntil = sim.tick + HOUR * 4;
    sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    expect(c.drafted).toBe(false);
  });

  it("doesn't let one penned-in animal stop the herds moving on", () => {
    const { sim, w, x, y } = cleared(7);
    // The oldest animal is shut in a pen with no door.
    for (const i of outline(w, x + 2, y + 2, x + 4, y + 4)) {
      w.setFeature(i, featureId('woodWall'));
    }
    place(sim, 'deer', w.idx(x + 3, y + 3));
    while (sim.animals.length < wildCap(sim)) {
      place(sim, 'muskox', w.idx(x - 8 + (sim.animals.length % 5), y - 8));
    }
    animalsAtDawn(sim);
    expect(sim.animals.some((a) => a.kind === 'muskox' && a.leaving)).toBe(true);
  });

  it('lets wounded animals mend', () => {
    const { sim, w, x, y } = cleared(8);
    const deer = place(sim, 'deer', w.idx(x + 3, y), { hp: 0.2 });
    animalsAtDawn(sim);
    expect(deer.hp).toBeGreaterThan(0.2);
    expect(deer.hp).toBeLessThanOrEqual(ANIMALS.deer.hp);
  });
});
