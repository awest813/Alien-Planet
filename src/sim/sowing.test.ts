import { describe, expect, it } from 'vitest';
import { featureId } from './defs';
import { Simulation } from './simulation';
import { HOUR, clearAround } from './test-helpers';
import { GROW_ZONE } from './world';

// Sowing only what can ripen before a frost: not in a cold snap, not into an autumn's frosts, not into an
// unheated greenhouse's winter nights; poplars, frost-proof, any time. And the reasons, said.

type Inner = { trySow(c: unknown): boolean };

// A field of `crop` beside the colonists, on a day and hour of the year.
function field(crop: string, day: number, hour = 12, biome: 'temperate' | 'tundra' = 'temperate') {
  const sim = Simulation.newColony(9, 'standard', 64, { biome });
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  const w = sim.world;
  const { x, y } = clearAround(sim, 10);
  const tiles: number[] = [];
  for (let dy = 2; dy <= 4; dy++) {
    for (let dx = 2; dx <= 4; dx++) {
      const i = w.idx(x + dx, y + dy);
      w.zone[i] = GROW_ZONE + featureId(crop);
      tiles.push(i);
    }
  }
  sim.tick = (day * 24 + hour) * HOUR;
  sim.syncClock();
  const c = sim.colonists[0];
  c.tile = w.idx(x + 3, y + 3);
  return { sim, w, tile: tiles[4], sow: () => (sim as unknown as Inner).trySow(c) };
}

describe('sowing before a frost', () => {
  it('not while a cold snap is on, though the afternoon is mild; again once it has passed', () => {
    // A mild spring or summer noon whose nights a cold snap takes below a hard frost.
    let checked = 0;
    for (let day = 3; day < 12; day++) {
      const { sim, tile, sow } = field('potatoPlant', day);
      if (sim.whyNotSow(tile) !== null) {
        continue;
      }
      sim.story.coldSnapUntil = sim.tick + 48 * HOUR;
      if (sim.frostFreeHours() >= 48) {
        // (Its nights stay above a hard frost even so: sowing goes on, rightly.)
        continue;
      }
      expect(sim.whyNotSow(tile)).toMatch(/cold snap|Too cold/);
      expect(sow()).toBe(false);
      sim.story.coldSnapUntil = sim.tick;
      expect(sim.whyNotSow(tile)).toBeNull();
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('not into the tundra’s autumn frosts, which come before the calendar says winter', () => {
    // Early autumn on the tundra, a mild noon: frost comes within days, before potatoes would ripen.
    let found = false;
    for (let day = 12; day < 18 && !found; day++) {
      const { sim, tile } = field('potatoPlant', day, 12, 'tundra');
      const why = sim.whyNotSow(tile);
      if (why && /A frost is coming/.test(why)) {
        found = true;
        expect(sim.frostFreeHours()).toBeLessThan(24 * 4);
      }
    }
    expect(found).toBe(true);
  });

  it('poplars, frost-proof, are sown late in the year when potatoes are too late', () => {
    // Late autumn: too late for potatoes; poplars wait out the winter.
    const potatoes = field('potatoPlant', 16, 13);
    expect(potatoes.sim.whyNotSow(potatoes.tile) ?? '').toMatch(/Too late to ripen before winter|frost/i);
    const poplars = field('poplarPlant', 16, 13);
    // (Unless it's simply too cold to sow at all this hour.)
    if (poplars.sim.temperatureAt(poplars.tile) >= 5) {
      expect(poplars.sim.whyNotSow(poplars.tile)).toBeNull();
    }
  });

  it('a growing crop says when it will be ripe, and what holds it back', async () => {
    const { controller } = await import('../game/controller');
    controller.newColony('crop-card');
    const sim = controller.sim;
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    const crop = w.idx(x + 3, y + 3);
    w.setFeature(crop, featureId('potatoPlant'));
    w.growth[crop] = 0.5;
    // Night.
    sim.tick += Math.round(((23 - sim.hour + 24) % 24) * HOUR);
    sim.syncClock();
    controller.selectTile(crop);
    controller.publish();
    const card = controller.getState().selectedTile!.details.join(' | ');
    expect(card).toMatch(
      /50% grown, (ripe in (about \d+ days?|under a day)|a frost may take it first.*) · Grows by day/,
    );
    // Bare ground in a field says why it isn't sown, when it isn't.
    const bare = w.idx(x + 5, y + 3);
    w.zone[bare] = GROW_ZONE + featureId('potatoPlant');
    sim.story.coldSnapUntil = sim.tick + 48 * HOUR;
    controller.selectTile(bare);
    controller.publish();
    expect(controller.getState().selectedTile!.orders.join(' | ')).toMatch(/Not sown: (a cold snap|too cold)/);
  });
});
