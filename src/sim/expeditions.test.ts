import { describe, expect, it } from 'vitest';
import { FACTIONS, itemId } from './defs';
import { SETTLER_GOODWILL, buySettler, settlerCost } from './diplomacy';
import { RUINS, TRIP_DAYS, cannotGo, expeditions, sendExpedition, supplyCost } from './expeditions';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { colonyStock, goodwillOf } from './trade';

const KIN = FACTIONS.findIndex((f) => f.key === 'meadowKin');
const HILLS = FACTIONS.findIndex((f) => f.key === 'hollowstone');
const SILVER = itemId('silver');
const DAY = HOUR * 24;

// A colony with a stockpile of silver and no events.
function colony(seed: number, silver = 600) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y + 4, x1: x + 4, y1: y + 7 }, zone: 1 });
  for (let k = 0; k * 500 < silver; k++) {
    w.addItem(w.idx(x - 4 + k, y + 7), SILVER, Math.min(500, silver - k * 500));
  }
  for (const c of sim.colonists) {
    c.needs.food = 1;
    c.needs.rest = 1;
  }
  return { sim, w, x, y };
}

const onEdge = (sim: Simulation, i: number) => {
  const w = sim.world;
  return w.xOf(i) === 0 || w.yOf(i) === 0 || w.xOf(i) === w.width - 1 || w.yOf(i) === w.height - 1;
};

describe('expeditions', () => {
  it('a party pays for supplies, walks off the map edge, and is away but not gone', () => {
    const { sim } = colony(1);
    const [a, b] = sim.colonists;
    const silver = colonyStock(sim, SILVER);
    const cost = supplyCost(sim, 'salvage', 2);
    expect(cost).toBeGreaterThan(0);
    expect(sendExpedition(sim, RUINS, 'salvage', [a.id, b.id])).toBeNull();
    expect(colonyStock(sim, SILVER)).toBe(silver - cost);
    expect(a.away).toBe('leaving');
    // Not here, but still the colony's: not dead, and counted against the population cap.
    expect(sim.living()).not.toContain(a);
    expect(sim.headcount()).toBe(sim.colonists.length);
    // They walk to the edge and off it.
    let walked = false;
    for (let t = 0; t < HOUR * 8 && a.away === 'leaving'; t++) {
      sim.step();
      walked ||= a.path.length > 0;
    }
    expect(walked).toBe(true);
    expect(a.away).toBe('gone');
    expect(onEdge(sim, a.tile)).toBe(true);
    // A draft order can't reach them.
    sim.apply({ type: 'draft', colonist: a.id, drafted: true });
    expect(a.drafted).toBe(false);
    expect(a.health.dead).toBe(false);
  });

  it('come back after some days with what they salvaged', () => {
    const { sim } = colony(2);
    const [a, b] = sim.colonists;
    const iron = colonyStock(sim, itemId('iron'));
    expect(sendExpedition(sim, RUINS, 'salvage', [a.id, b.id])).toBeNull();
    run(sim, DAY * (TRIP_DAYS.salvage - 1));
    expect(a.away).toBe('gone');
    run(sim, DAY + HOUR * 2);
    expect(a.away).toBeUndefined();
    expect(b.away).toBeUndefined();
    expect(sim.living()).toContain(a);
    expect(expeditions(sim)).toHaveLength(0);
    expect(sim.log.some((l) => l.text.includes('back from the ruins'))).toBe(true);
    expect(a.thoughts.some((t) => t.key === 'backFromJourney')).toBe(true);
    // The haul is dropped at home, to be hauled in.
    run(sim, HOUR * 12);
    expect(colonyStock(sim, itemId('iron'))).toBeGreaterThan(iron);
  });

  it('a visit to a neighbour wins goodwill and brings their goods home', () => {
    const { sim } = colony(3);
    const c = sim.colonists[2];
    const before = goodwillOf(sim, HILLS);
    expect(sendExpedition(sim, HILLS, 'trade', [c.id])).toBeNull();
    run(sim, DAY * TRIP_DAYS.trade + HOUR * 2);
    expect(c.away).toBeUndefined();
    expect(goodwillOf(sim, HILLS)).toBeGreaterThan(before);
  });

  it('survives a save and load while away', () => {
    const { sim } = colony(4);
    const [a] = sim.colonists;
    expect(sendExpedition(sim, KIN, 'trade', [a.id])).toBeNull();
    run(sim, HOUR * 2);
    const loaded = deserialize(structuredClone(serialize(sim)));
    expect(loaded.colonists[a.id].away).toBe(sim.colonists[a.id].away);
    expect(expeditions(loaded)).toEqual(expeditions(sim));
    run(loaded, DAY * TRIP_DAYS.trade);
    expect(loaded.colonists[a.id].away).toBeUndefined();
    expect(expeditions(loaded)).toHaveLength(0);
  });

  it("won't send the unfit, the young, a carer, or the last grown-up; or go without the silver", () => {
    const { sim } = colony(5, 0);
    expect(sendExpedition(sim, RUINS, 'salvage', [sim.colonists[0].id])).toMatch(/silver/);
    const { sim: rich } = colony(6);
    // Everyone grown and able going leaves nobody to mind the colony.
    expect(
      sendExpedition(
        rich,
        RUINS,
        'salvage',
        rich.colonists.map((o) => o.id),
      ),
    ).toMatch(/stay|Choose/);
    while (rich.colonists.length < 6) {
      rich.addWanderer();
    }
    const [x, y, z, w] = rich.colonists;
    x.age = 12;
    expect(cannotGo(rich, x)).toMatch(/young/);
    y.health.downed = true;
    expect(sendExpedition(rich, RUINS, 'salvage', [y.id])).toMatch(/well enough/);
    rich.infants.push({ id: 0, name: 'Baby', age: 0.2, parents: [z.id], carer: z.id });
    expect(cannotGo(rich, z)).toMatch(/baby/);
    expect(sendExpedition(rich, RUINS, 'salvage', [])).toMatch(/Choose/);
    expect(sendExpedition(rich, RUINS, 'trade', [w.id])).not.toBeNull();
    // A party of more than three is too many.
    expect(
      sendExpedition(
        rich,
        RUINS,
        'salvage',
        rich.colonists.slice(2).map((o) => o.id),
      ),
    ).toMatch(/Choose/);
  });

  it('a whole colony away and back is never counted as lost', () => {
    const { sim } = colony(7);
    const [a, b, c] = sim.colonists;
    for (const o of sim.colonists.slice(3)) {
      sim.dieOf(o, 'test');
    }
    expect(sendExpedition(sim, RUINS, 'salvage', [a.id, b.id])).toBeNull();
    sim.dieOf(c, 'test');
    expect(sim.living()).toHaveLength(0);
    expect(sim.headcount()).toBe(2);
    expect(sim.log.some((l) => l.text.includes('The colony is lost'))).toBe(false);
    run(sim, DAY * TRIP_DAYS.salvage + HOUR * 2);
    expect(sim.living()).toHaveLength(2);
  });
});

describe('a settler from the Meadow Kin', () => {
  it('comes for silver, once they like the colony, while there is room', () => {
    const { sim } = colony(8, 1200);
    expect(buySettler(sim, KIN)).toMatch(/goodwill/);
    expect(buySettler(sim, HILLS)).not.toBeNull();
    sim.goodwill[KIN] = SETTLER_GOODWILL;
    const cost = settlerCost(sim);
    const before = sim.colonists.length;
    expect(buySettler(sim, KIN)).toBeNull();
    expect(sim.colonists.length).toBe(before + 1);
    expect(colonyStock(sim, SILVER)).toBe(1200 - cost);
    // Not another one straight away.
    expect(buySettler(sim, KIN)).toMatch(/while/);
  });
});
