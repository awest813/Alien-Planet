import { describe, expect, it } from 'vitest';
import { featureId } from './defs';
import { Simulation, TICKS_PER_HOUR } from './simulation';
import { clearAround } from './test-helpers';
import { Enemy } from './types';

describe('sappers', () => {
  it('dig through rock to get at a colony with no other way in', () => {
    const sim = Simulation.newColony(21);
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    // Everyone inside a ring of rock two tiles thick: no walls or doors to break.
    for (const c of sim.colonists) {
      c.tile = w.idx(x, y);
      c.path = [];
    }
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        if (ring === 4 || ring === 5) {
          w.setFeature(w.idx(x + dx, y + dy), featureId('rock'));
        }
      }
    }
    const raider: Enemy = {
      id: sim.nextEnemyId++,
      name: 'Sapper',
      faction: 0,
      tile: w.idx(x + 9, y),
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
    sim.enemies.push(raider);
    sim.raid = { faction: 0, initial: 1, killed: 0, startedTick: sim.tick, arrivedTick: sim.tick };
    const inside = () => sim.regionOf(raider.tile) === sim.regionOf(sim.colonists[0].tile);
    for (let t = 0; t < 12 * TICKS_PER_HOUR && !inside(); t++) {
      for (const c of sim.colonists) {
        c.needs.food = c.needs.rest = c.needs.joy = 1;
      }
      raider.hp = 1;
      sim.step();
    }
    expect(inside()).toBe(true);
    expect(sim.raid?.sapped).toBe(true);
    expect(sim.log.some((l) => l.text.startsWith('Raiders are digging through the rock'))).toBe(true);
    // Rock isn't rebuilt like a wall would be.
    expect([...w.tilesWith('blueprints')].some((i) => w.blueprint[i] === featureId('rock'))).toBe(false);
  });
});
