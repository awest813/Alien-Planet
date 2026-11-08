import { describe, expect, it } from 'vitest';
import { allyChance, maybeSendAllies, updateAllies, woundEnemy } from './combat';
import { FACTIONS } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { clearAround } from './test-helpers';
import { Enemy } from './types';

const KIN = FACTIONS.findIndex((f) => !f.hostile);

function raider(sim: Simulation, tile: number): Enemy {
  const e: Enemy = {
    id: sim.nextEnemyId++,
    name: 'Raider',
    faction: 0,
    tile,
    path: [],
    moveProgress: 0,
    hp: 1,
    weapon: 'club',
    armor: 0,
    skill: 4,
    speed: 0.9,
    suppression: 0,
    cooldown: 0,
    fleeing: false,
    repathAt: 0,
  };
  sim.enemies.push(e);
  sim.raid ??= { faction: 0, initial: 3, killed: 0, startedTick: sim.tick, arrivedTick: sim.tick };
  return e;
}

describe('raiders in pain', () => {
  it('go down, wounded, once badly hurt, as colonists do', () => {
    const sim = Simulation.newColony(1);
    const e = raider(sim, sim.colonists[0].tile + 5);
    woundEnemy(sim, e, 0.5, 'Ada');
    expect(e.hp).toBeGreaterThan(0);
    woundEnemy(sim, e, 0.25, 'Ada');
    expect(e.hp).toBe(0);
    // Knocked down by pain, they always live to be taken prisoner.
    expect(sim.captives.some((p) => p.id === e.id && p.state === 'downed')).toBe(true);
  });
});

describe('allies', () => {
  it('come more often the better the friendly faction thinks of the colony', () => {
    expect(allyChance(20)).toBe(0);
    expect(allyChance(60)).toBeGreaterThan(0);
    expect(allyChance(100)).toBeGreaterThan(allyChance(60));
    expect(allyChance(100)).toBeLessThanOrEqual(0.5);
  });

  it('arrive during a raid, fight the raiders, save with the colony, and go home after', () => {
    const sim = Simulation.newColony(2);
    const { x, y } = clearAround(sim, 12);
    sim.goodwill[KIN] = 100;
    const e = raider(sim, sim.world.idx(x + 6, y));
    // Sooner or later the dice fall their way.
    for (let k = 0; k < 40 && sim.raid!.allies === undefined; k++) {
      maybeSendAllies(sim);
    }
    expect(sim.raid!.allies).toBeGreaterThanOrEqual(2);
    sim.tick = sim.raid!.alliesAt!;
    updateAllies(sim);
    expect(sim.allies.length).toBe(sim.raid!.allies);
    expect(sim.storyLog.some((s) => s.text.includes('fighters to help'))).toBe(true);
    const loaded = deserialize(structuredClone(serialize(sim)));
    expect(loaded.allies.map((a) => a.name)).toEqual(sim.allies.map((a) => a.name));
    // They go after the raider.
    for (const a of sim.allies) {
      a.tile = sim.world.idx(x + 5, y);
    }
    for (let t = 0; t < 2000 && e.hp > 0; t++) {
      updateAllies(sim);
    }
    expect(e.hp).toBe(0);
    // With nobody left to fight, they head for the edge and leave.
    sim.enemies = [];
    sim.raid = null;
    for (let t = 0; t < 20000 && sim.allies.length > 0; t++) {
      updateAllies(sim);
    }
    expect(sim.allies).toHaveLength(0);
  });

  it("don't come once every raider is already running", () => {
    const sim = Simulation.newColony(3);
    const e = raider(sim, sim.colonists[0].tile + 8);
    e.fleeing = true;
    sim.raid!.allies = 3;
    sim.raid!.alliesAt = sim.tick;
    updateAllies(sim);
    expect(sim.allies).toHaveLength(0);
  });

  it('keep a raider busy: between blows it stands its ground', () => {
    const sim = Simulation.newColony(4);
    const { x, y } = clearAround(sim, 12);
    const e = raider(sim, sim.world.idx(x + 6, y));
    // One raider, hardy enough to last the test, and the raid not about to break.
    sim.raid!.initial = 1;
    e.hp = 50;
    sim.raid!.allies = 2;
    sim.raid!.alliesAt = sim.tick;
    updateAllies(sim);
    const ally = sim.allies[0];
    ally.tile = sim.world.idx(x + 7, y);
    ally.hp = 50;
    ally.weapon = 'fists';
    sim.allies.slice(1).forEach((a) => (a.hp = 0));
    const start = e.tile;
    for (let t = 0; t < 120; t++) {
      sim.step();
    }
    expect(e.tile).toBe(start);
  });
});
