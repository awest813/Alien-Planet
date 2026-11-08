import { describe, expect, it } from 'vitest';
import { featureId } from './defs';
import { Simulation, START_HOUR } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';

// A cleared patch with an instrument, everyone fed and rested, at `hour` on day one.
function stage(seed: number, instrument = 'lute', hour = 12) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 12);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.tick = (hour - START_HOUR) * HOUR;
  sim.syncClock();
  const spot = w.idx(x + 3, y);
  w.setFeature(spot, featureId(instrument));
  for (const c of sim.colonists) {
    c.needs.food = 1;
    c.needs.rest = 1;
    c.needs.joy = 1;
    c.schedule.fill('W');
    for (const work of Object.keys(c.priorities) as (keyof typeof c.priorities)[]) {
      c.priorities[work] = 0;
    }
  }
  return { sim, w, x, y, spot };
}

describe('instruments', () => {
  it('train the player and give anyone in earshot some music', () => {
    const { sim, w, x, y, spot } = stage(1, 'drum');
    const [player, listener, far] = sim.colonists;
    player.needs.joy = 0.1;
    player.schedule.fill('J');
    player.recentJoy = { gaming: 2, relaxing: 2, outdoor: 2, social: 2 };
    listener.tile = w.idx(x + 5, y + 1);
    far.tile = w.idx(x - 10, y - 10);
    const xp = player.skillXp.artistic;
    let played = false;
    for (let t = 0; t < HOUR * 2; t++) {
      sim.step();
      for (const c of [listener, far]) {
        c.path = [];
        c.job = null;
      }
      listener.tile = w.idx(x + 5, y + 1);
      far.tile = w.idx(x - 10, y - 10);
      played ||= player.job?.target === spot;
    }
    expect(played).toBe(true);
    expect(player.skillXp.artistic + player.skills.artistic * 1000).toBeGreaterThan(xp);
    expect(listener.recentJoy.music ?? 0).toBeGreaterThan(0);
    expect(listener.thoughts.some((t) => t.key === 'heardMusic' || t.key === 'heardFineMusic')).toBe(true);
    expect(far.recentJoy.music ?? 0).toBe(0);
  });

  it("don't carry through the walls of another room", () => {
    const { sim, w, x, y, spot } = stage(2, 'drum');
    // Wall the instrument in.
    for (const i of outline(w, x + 1, y - 2, x + 5, y + 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 1, y), featureId('door'));
    const [player, outside] = sim.colonists;
    player.tile = w.idx(x + 3, y + 1);
    player.needs.joy = 0.1;
    player.schedule.fill('J');
    player.recentJoy = { gaming: 2, relaxing: 2, outdoor: 2 };
    for (let t = 0; t < HOUR * 2; t++) {
      sim.step();
      outside.path = [];
      outside.job = null;
      outside.tile = w.idx(x + 7, y);
    }
    expect(player.job?.target === spot || (player.recentJoy.music ?? 0) > 0).toBe(true);
    expect(outside.recentJoy.music ?? 0).toBe(0);
  });
});

describe('concerts', () => {
  it('draw off-duty colonists to a skilled player in the evening', () => {
    const { sim, spot } = stage(3, 'lute', 18);
    // A mild evening, so nobody stays in out of the cold, and no party to draw them off instead.
    sim.temperatureAt = () => 18;
    (sim as unknown as { nextPartyTick: number }).nextPartyTick = Number.MAX_SAFE_INTEGER;
    const [player, ...audience] = sim.colonists;
    player.skills.artistic = 12;
    player.needs.joy = 0.1;
    player.recentJoy = { gaming: 2, relaxing: 2, outdoor: 2, social: 2 };
    for (const c of sim.colonists) {
      c.schedule.fill('J');
    }
    for (const c of audience) {
      c.needs.joy = 0.5;
    }
    let began = false;
    let listening = 0;
    for (let t = 0; t < HOUR * 4 && !(began && !sim.concert); t++) {
      sim.step();
      // (A concert starts at some point while they play: keep them wanting to, until it does.)
      if (!began) {
        player.needs.joy = Math.min(player.needs.joy, 0.2);
      }
      began ||= sim.concert?.player === player.id && sim.concert.tile === spot;
      listening = Math.max(listening, audience.filter((c) => c.job?.listening).length);
    }
    expect(began).toBe(true);
    expect(listening).toBeGreaterThan(0);
    expect(sim.stats.concerts).toBe(1);
    expect(player.thoughts.some((t) => t.key === 'gaveConcert')).toBe(true);
    expect(audience.some((c) => c.thoughts.some((t) => t.key === 'attendedConcert'))).toBe(true);
    expect(sim.objectivesDone.concert ?? false).toBe(false); // checked on the hour
    run(sim, HOUR);
    expect(sim.objectivesDone.concert).toBe(true);
  });

  it('stop if the player is called away', () => {
    const { sim } = stage(4, 'lute', 18);
    const [player, ...audience] = sim.colonists;
    player.skills.artistic = 12;
    player.needs.joy = 0.1;
    player.recentJoy = { gaming: 2, relaxing: 2, outdoor: 2, social: 2 };
    for (const c of sim.colonists) {
      c.schedule.fill('J');
    }
    for (const c of audience) {
      c.needs.joy = 0.5;
    }
    for (let t = 0; t < HOUR * 3 && !sim.concert; t++) {
      sim.step();
    }
    expect(sim.concert).not.toBeNull();
    sim.apply({ type: 'draft', colonist: player.id, drafted: true });
    run(sim, 40);
    expect(sim.concert).toBeNull();
    expect(sim.stats.concerts ?? 0).toBe(0);
  });

  it("won't start in the morning", () => {
    const { sim } = stage(5, 'lute', 9);
    const [player] = sim.colonists;
    player.skills.artistic = 15;
    player.needs.joy = 0.1;
    for (const c of sim.colonists) {
      c.schedule.fill('J');
    }
    for (let t = 0; t < HOUR * 3; t++) {
      sim.step();
      expect(sim.concert).toBeNull();
    }
  });
});
