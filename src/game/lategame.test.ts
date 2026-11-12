import { describe, expect, it } from 'vitest';
import { FACTIONS, featureId, itemId } from '../sim/defs';
import { spawnRaid } from '../sim/combat';
import { clearAround } from '../sim/test-helpers';
import { ignite, updateFires } from '../sim/weather';
import { Alert, controller } from './controller';

// What a player found in the late game (the tenth pass's playthrough of phases 6-8), each first seen failing.

const alerts = (): Alert[] =>
  (controller as unknown as { buildAlerts(t: unknown): Alert[] }).buildAlerts(controller.sim.resourceTotals());
const goal = (id: string) => controller.getState().objectives.find((o) => o.id === id)!;

function colony(seed: string) {
  controller.newColony(seed);
  const sim = controller.sim;
  const { x, y } = clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  return { sim, w: sim.world, x, y };
}

describe('the late game', () => {
  it("raiders don't take the names of the colony's own people", () => {
    // (Raiders won over keep their names: later raiders of the same side came with them, and "Rook-eye died of
    // their wounds" read as the colonist.)
    const { sim } = colony('raider-names');
    const faction = 1;
    const names = FACTIONS[faction].names;
    sim.colonists[0].name = names[0];
    sim.colonists[1].name = names[1];
    for (let k = 0; k < 4; k++) {
      expect(spawnRaid(sim, faction, 3)).toBe(true);
      for (const e of sim.enemies) {
        expect([names[0], names[1]]).not.toContain(e.name);
      }
      sim.enemies = [];
      sim.raid = null;
    }
  });

  it('the beacon goal points at a generator once the beacon stands without power', () => {
    const { sim, w, x, y } = colony('beacon-power');
    sim.research.done.push('electricity', 'engineering', 'signalBeacon');
    w.setFeature(w.idx(x + 3, y + 3), featureId('signalBeacon'));
    sim.power.powered = false;
    controller.publish();
    expect(goal('beaconBuilt').tool).toBe('woodGenerator');
  });

  it("the ship goal doesn't offer the Ship screen before the ship lands", () => {
    const { sim } = colony('ship-early');
    controller.publish();
    expect(goal('shipChoice').screen).toBeUndefined();
    sim.beacon.landed = true;
    controller.publish();
    expect(goal('shipChoice').screen).toBe('ship');
  });

  it('the winter harvest goal offers sun lamps once they are known', () => {
    const { sim } = colony('winter-lamps');
    controller.publish();
    expect(goal('winterHarvest').screen).toBe('research');
    sim.research.done.push('electricity', 'sunLamps');
    controller.publish();
    expect(goal('winterHarvest').tool).toBe('sunLamp');
  });

  it('thieves running off with the goods stay in the alerts, ahead of everything else', () => {
    const { sim } = colony('thieves-running');
    expect(spawnRaid(sim, 1, 2, false, true)).toBe(true);
    const thief = sim.enemies[0];
    thief.loot = { item: itemId('silver'), count: 150 };
    thief.fleeing = true;
    for (const e of sim.enemies) {
      e.fleeing = true;
    }
    const running = alerts().find((a) => a.text.startsWith('Thieves are running off'));
    expect(running?.threat).toBe(true);
    expect(running?.tile).toBe(thief.tile);
  });

  it('a beacon fallen quiet draws no power', () => {
    const { sim, w, x, y } = colony('quiet-beacon');
    sim.research.done.push('electricity', 'engineering', 'signalBeacon');
    w.setFeature(w.idx(x + 3, y + 3), featureId('signalBeacon'));
    for (let t = 0; t < 40; t++) {
      sim.step();
    }
    expect(sim.power.demand).toBeGreaterThan(0);
    sim.beacon.silent = true;
    for (let t = 0; t < 40; t++) {
      sim.step();
    }
    expect(sim.power.demand).toBe(0);
  });

  it('says "an armchair" when fire takes one', () => {
    const { sim, w, x, y } = colony('fire-armchair');
    const at = w.idx(x + 3, y + 3);
    w.setFeature(at, featureId('armchair'));
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    expect(ignite(sim, at)).toBe(true);
    w.fire[at] = 0.01;
    updateFires(sim, 1);
    expect(sim.log.some((e) => e.text.startsWith('Fire destroyed an armchair.'))).toBe(true);
  });
});

describe('the Research screen', () => {
  it('lists only what a project still needs learned', () => {
    controller.newColony('requires-left');
    const sim = controller.sim;
    sim.research.done.push('electricity', 'engineering');
    controller.publish();
    const beacon = controller.getState().research.find((p) => p.key === 'signalBeacon')!;
    expect(beacon.requires).toEqual([]);
  });
});
