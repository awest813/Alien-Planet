import { describe, expect, it } from 'vitest';
import { clearAround } from '../sim/test-helpers';
import { spawnRaid } from '../sim/combat';
import { controller } from './controller';

// Buttons offered when what they do will be refused (found by the sixth audit).

describe('controls that would be refused', () => {
  it('Prisoners: the Ransom button tells the screen when the captive’s people are attacking', () => {
    controller.newColony('audit6-ransom');
    const sim = controller.sim;
    clearAround(sim, 12);
    const home = sim.homeTile()!;
    sim.captives.push({
      id: 900,
      name: 'Grax',
      faction: 0,
      tile: home,
      state: 'prisoner',
      capture: false,
      since: sim.tick,
      food: 1,
      resistance: 3,
      skill: 2,
      lastVisit: sim.tick,
      hungryHours: 0,
    });
    // Their own people raid the colony.
    let tries = 0;
    while (!spawnRaid(sim, 0, 3) && tries++ < 3);
    expect(sim.enemies.some((e) => e.faction === 0 && e.hp > 0 && !e.fleeing)).toBe(true);
    controller.publish();
    // The Prisoners screen offered "Ransom: N silver" for every prisoner, with nothing in its state to say it couldn't
    // be done now.
    const shown = controller.getState().captives.find((p) => p.id === 900)!;
    expect(shown.ransom).toBeGreaterThan(0);
    // Pressed (and confirmed), it's refused.
    controller.command({ type: 'world', action: { kind: 'ransom', captive: 900 } });
    expect(sim.captives.some((p) => p.id === 900)).toBe(true);
    expect(controller.getState().toast).toMatch(/^Not while .* attacking/);
    // The screen can tell, and disables the button with the reason.
    expect(shown.ransomBlocked).toMatch(/^Not while .* attacking/);
  });
});
