import { describe, expect, it } from 'vitest';
import { animalsAtDawn } from './animals';
import { ANIMALS, featureId, itemId } from './defs';
import { penAt, penMap } from './pens';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { Animal } from './types';
import { STOCKPILE_ZONE } from './world';

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

// A cleared colony with a 7×7 fenced pen east of the landing: a gate on its west side and a trough
// set in its east side.
function withPen(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 16);
  sim.animals = [];
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  const [x0, y0, x1, y1] = [x + 4, y - 3, x + 10, y + 3];
  const gate = w.idx(x0, y);
  const trough = w.idx(x1, y);
  w.setFeature(gate, featureId('gate'));
  w.setFeature(trough, featureId('trough'));
  for (const t of outline(w, x0, y0, x1, y1)) {
    if (t !== gate && t !== trough) {
      w.setFeature(t, featureId('fence'));
    }
  }
  const inside = (dx: number, dy: number) => w.idx(x0 + 3 + dx, y + dy);
  return { sim, w, x, y, gate, trough, inside };
}

describe('pens', () => {
  it('are found inside a fence with a gate, with their troughs', () => {
    const { sim, trough, inside } = withPen(51);
    const { pens } = penMap(sim);
    expect(pens.length).toBe(1);
    expect(pens[0].tiles.length).toBe(25);
    expect(pens[0].troughs).toEqual([trough]);
    expect(penAt(sim, inside(0, 0))).toBe(0);
    expect(penAt(sim, sim.colonists[0].tile)).toBe(-1);
  });

  it('keep tame animals in and wild ones out, while colonists come and go through the gate', () => {
    const { sim, w, x, y, gate, inside } = withPen(52);
    const penned = [
      place(sim, 'deer', inside(0, 0), { tame: true }),
      place(sim, 'grouse', inside(1, 1), { tame: true }),
    ];
    const wild = place(sim, 'deer', w.idx(x - 6, y));
    // A colonist sent into the pen gets there through the gate.
    const c = sim.colonists[0];
    sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    sim.apply({ type: 'move', colonist: c.id, tile: inside(-1, -1) });
    for (let hour = 0; hour < 16; hour++) {
      run(sim, HOUR);
      for (const a of penned) {
        expect(penAt(sim, a.tile)).toBe(0);
      }
      expect(penAt(sim, wild.tile)).toBe(-1);
      expect(wild.tile).not.toBe(gate);
    }
    expect(c.tile).toBe(inside(-1, -1));
  });

  it('draw tame animals in from outside', () => {
    const { sim, w, x, y } = withPen(53);
    const stray = place(sim, 'deer', w.idx(x - 3, y + 2), { tame: true });
    for (let hour = 0; hour < 8 && penAt(sim, stray.tile) < 0; hour++) {
      run(sim, HOUR);
    }
    expect(penAt(sim, stray.tile)).toBe(0);
  });
});

describe('troughs', () => {
  it('feed the animals in the pen each morning', () => {
    const { sim, w, trough, inside } = withPen(54);
    place(sim, 'deer', inside(0, 0), { tame: true });
    place(sim, 'muskox', inside(1, 0), { tame: true });
    w.fuel[trough] = 40;
    animalsAtDawn(sim);
    // A deer eats 2, a muskox 4.
    expect(w.fuel[trough]).toBe(34);
  });

  it('let a fed pair in a pen breed even in winter, when grazing animals do not', () => {
    const { sim, w, trough, inside } = withPen(55);
    sim.tick = 17 * 24 * HOUR;
    sim.syncClock();
    expect(sim.season).toBe('Winter');
    // A pair loose outside the pen, and a pair in it with a full trough.
    place(sim, 'deer', w.idx(w.xOf(trough) + 6, w.yOf(trough)), { tame: true });
    place(sim, 'deer', w.idx(w.xOf(trough) + 6, w.yOf(trough) + 1), { tame: true });
    place(sim, 'grouse', inside(0, 0), { tame: true });
    place(sim, 'grouse', inside(1, 0), { tame: true });
    for (let day = 0; day < 6; day++) {
      w.fuel[trough] = 40;
      animalsAtDawn(sim);
    }
    expect(sim.animals.filter((a) => a.kind === 'grouse').length).toBeGreaterThan(2);
    expect(sim.animals.filter((a) => a.kind === 'deer').length).toBe(2);
    // Young are born in the pen.
    expect(sim.animals.filter((a) => a.kind === 'grouse').every((a) => penAt(sim, a.tile) === 0)).toBe(true);
  });

  it('leave a pair unfed (and so out of season) once the trough runs dry', () => {
    const { sim, trough, inside, w } = withPen(56);
    sim.tick = 17 * 24 * HOUR;
    sim.syncClock();
    place(sim, 'grouse', inside(0, 0), { tame: true });
    place(sim, 'grouse', inside(1, 0), { tame: true });
    w.fuel[trough] = 0;
    for (let day = 0; day < 6; day++) {
      animalsAtDawn(sim);
    }
    expect(sim.animals.length).toBe(2);
  });

  it('are filled with potatoes by haulers', () => {
    const { sim, w, x, y, trough } = withPen(57);
    sim.apply({ type: 'zone', rect: { x0: x - 6, y0: y - 6, x1: x - 3, y1: y - 3 }, zone: STOCKPILE_ZONE });
    w.addItem(w.idx(x - 5, y - 5), itemId('potatoes'), 50);
    for (const c of sim.colonists) {
      c.priorities.hauling = 1;
      c.needs.food = 1;
    }
    for (let hour = 0; hour < 6 && w.fuel[trough] === 0; hour++) {
      run(sim, HOUR);
    }
    expect(w.fuel[trough]).toBeGreaterThan(0);
  });

  it('take berries or grain when there are no potatoes', () => {
    const { sim, w, x, y, trough } = withPen(58);
    sim.apply({ type: 'zone', rect: { x0: x - 6, y0: y - 6, x1: x - 3, y1: y - 3 }, zone: STOCKPILE_ZONE });
    w.addItem(w.idx(x - 5, y - 5), itemId('berries'), 40);
    w.addItem(w.idx(x - 4, y - 5), itemId('grain'), 40);
    for (const c of sim.colonists) {
      c.priorities.hauling = 1;
      c.needs.food = 1;
    }
    for (let hour = 0; hour < 6 && w.fuel[trough] === 0; hour++) {
      run(sim, HOUR);
    }
    expect(w.fuel[trough]).toBeGreaterThan(0);
  });

  it('take hay first, and only hay while the colony is short of food', () => {
    const { sim, w, x, y, trough } = withPen(59);
    sim.apply({ type: 'zone', rect: { x0: x - 6, y0: y - 6, x1: x - 3, y1: y - 3 }, zone: STOCKPILE_ZONE });
    // Little to eat: a few potatoes, nearer than the hay.
    w.addItem(w.idx(x - 3, y - 3), itemId('potatoes'), 6);
    w.addItem(w.idx(x - 6, y - 6), itemId('hay'), 30);
    for (const c of sim.colonists) {
      c.priorities.hauling = 1;
      c.needs.food = 1;
    }
    for (let hour = 0; hour < 6 && w.fuel[trough] === 0; hour++) {
      run(sim, HOUR);
    }
    expect(w.fuel[trough]).toBeGreaterThan(0);
    expect(sim.stockOf(itemId('potatoes'))).toBe(6);
  });

  it('a field too big to be a pen is no pen, however many gates it has', () => {
    const sim = Simulation.newColony(31, 'standard', 96);
    const w = sim.world;
    const { x, y } = clearAround(sim, 24);
    // 30 by 23 inside: about 690 tiles, over the limit.
    for (const i of outline(w, x - 16, y - 12, x + 15, y + 12)) {
      w.setFeature(i, featureId('fence'));
    }
    w.setFeature(w.idx(x - 16, y), featureId('gate'));
    w.setFeature(w.idx(x + 15, y), featureId('gate'));
    expect(penMap(sim).pens).toHaveLength(0);
  });
});
