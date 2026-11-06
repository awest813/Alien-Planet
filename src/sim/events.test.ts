import { describe, expect, it } from 'vitest';
import { featureId, itemDef, itemId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation, START_HOUR } from './simulation';
import {
  EVENT_KEYS,
  THREAT_EVENTS,
  auroraOn,
  eclipseOn,
  heatWaveOn,
  readyForThreat,
  triggerEvent,
  updateStoryteller,
} from './storyteller';
import { HOUR, clearAround, run } from './test-helpers';

const forever = Number.MAX_SAFE_INTEGER;

function colony(seed: number) {
  const sim = Simulation.newColony(seed);
  const { x, y } = clearAround(sim, 12);
  sim.weather = { kind: 'clear', until: forever };
  return { sim, w: sim.world, x, y };
}

describe('storyteller', () => {
  it('counts raids and illness as threats, but not traders, gifts or good fortune', () => {
    for (const key of ['raid', 'disease', 'coldSnap', 'blight', 'heatWave', 'eclipse', 'manhunters']) {
      expect(THREAT_EVENTS).toContain(key);
    }
    for (const key of ['caravan', 'supplies', 'wanderer', 'herd', 'aurora', 'inspiration', 'bumperCrop', 'meteorite']) {
      expect(EVENT_KEYS).toContain(key);
      expect(THREAT_EVENTS).not.toContain(key);
    }
  });
});

describe('storyteller pacing', () => {
  it('holds threats back while half the colony is down or a pack is loose', () => {
    const { sim } = colony(2);
    sim.tick = 6 * 24 * HOUR;
    expect(readyForThreat(sim)).toBe(true);
    const living = sim.living();
    for (const c of living.slice(0, Math.ceil(living.length / 2))) {
      c.health.downed = true;
    }
    expect(readyForThreat(sim)).toBe(false);
    for (const c of living) {
      c.health.downed = false;
    }
    sim.story.manhuntersActive = true;
    expect(readyForThreat(sim)).toBe(false);
  });

  it('leaves a breather after a threat before the next one', () => {
    const { sim } = colony(3);
    sim.tick = 6 * 24 * HOUR;
    sim.syncClock();
    let threats = 0;
    let lastThreat = -Infinity;
    let closest = Infinity;
    for (let t = 0; t < 40 * 24 * HOUR; t += HOUR) {
      sim.tick += HOUR;
      const before = sim.story.nextThreatTick ?? 0;
      updateStoryteller(sim);
      if ((sim.story.nextThreatTick ?? 0) !== before) {
        threats++;
        closest = Math.min(closest, sim.tick - lastThreat);
        lastThreat = sim.tick;
      }
      // Keep the colony fit and the raid over, so only the pacing holds threats back.
      sim.raid = null;
      sim.enemies = [];
      sim.story.manhuntersActive = false;
      sim.animals = sim.animals.filter((a) => !a.manhunter);
    }
    expect(threats).toBeGreaterThan(3);
    expect(closest).toBeGreaterThanOrEqual(24 * HOUR);
  });

  it('sends food as a gift when the stores are low', () => {
    let meals = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { sim } = colony(seed);
      // Nothing to eat anywhere.
      const w = sim.world;
      for (const i of [...w.tilesWith('items')]) {
        if (itemDef(w.itemType[i]).nutrition > 0) {
          w.takeItem(i, w.itemCount[i]);
        }
      }
      // A home for the gift to arrive at, and plenty of wood, so only food is short.
      sim.world.setFeature(sim.colonists[0].tile + 2, featureId('woodWall'));
      sim.world.dropItemNear(sim.colonists[0].tile, itemId('wood'), 100);
      const before = sim.stockOf(itemId('meal'));
      expect(triggerEvent(sim, 'supplies')).toBe(true);
      meals += sim.stockOf(itemId('meal')) > before ? 1 : 0;
    }
    // Four times as likely as each of the others: over half the gifts, against a quarter at random.
    expect(meals).toBeGreaterThanOrEqual(12);
  });
});

describe('new events', () => {
  it('heat waves make it much hotter for two days', () => {
    const { sim } = colony(1);
    const before = sim.outdoorTemperature();
    expect(triggerEvent(sim, 'heatWave')).toBe(true);
    expect(heatWaveOn(sim)).toBe(true);
    expect(sim.outdoorTemperature()).toBeCloseTo(before + 10);
    run(sim, HOUR * 49);
    expect(heatWaveOn(sim)).toBe(false);
  });

  it('eclipses darken solar panels and cool the air', () => {
    const { sim, w, x, y } = colony(2);
    sim.tick = (12 - START_HOUR) * HOUR;
    sim.syncClock();
    w.setFeature(w.idx(x + 3, y), featureId('solarPanel'));
    run(sim, 20);
    expect(sim.power.supply).toBeGreaterThan(0);
    const before = sim.outdoorTemperature();
    expect(triggerEvent(sim, 'eclipse')).toBe(true);
    expect(eclipseOn(sim)).toBe(true);
    expect(sim.outdoorTemperature()).toBeCloseTo(before - 3);
    run(sim, 20);
    expect(sim.power.supply).toBe(0);
  });

  it('manhunters go after one colonist after another', () => {
    const { sim } = colony(3);
    expect(triggerEvent(sim, 'manhunters')).toBe(true);
    const pack = sim.animals.filter((a) => a.manhunter);
    expect(pack.length).toBeGreaterThanOrEqual(2);
    expect(pack.every((a) => a.revengeOn >= 0)).toBe(true);
    expect(sim.events).toContain('manhunters');
    // Once their first target is down, they pick another.
    const first = sim.colonists[pack[0].revengeOn];
    first.health.downed = true;
    run(sim, 2);
    expect(pack[0].revengeOn).not.toBe(first.id);
    expect(pack[0].revengeOn).toBeGreaterThanOrEqual(0);
  });

  it('meteorites leave silver and stone near the colony', () => {
    const { sim } = colony(4);
    const silver = sim.stockOf(itemId('silver'));
    expect(triggerEvent(sim, 'meteorite')).toBe(true);
    expect(sim.stockOf(itemId('silver'))).toBeGreaterThan(silver);
  });

  it('refugees arrive hurt and in need of a doctor', () => {
    const { sim } = colony(5);
    const before = sim.colonists.length;
    expect(triggerEvent(sim, 'refugee')).toBe(true);
    expect(sim.colonists.length).toBe(before + 1);
    expect(sim.colonists[before].health.injuries.length).toBeGreaterThanOrEqual(2);
  });

  it('auroras lift everyone and inspiration speeds one colonist up', () => {
    const { sim } = colony(6);
    expect(triggerEvent(sim, 'aurora')).toBe(true);
    expect(auroraOn(sim)).toBe(true);
    expect(sim.living().every((c) => c.thoughts.some((t) => t.key === 'sawAurora'))).toBe(true);
    const speed = (c: (typeof sim.colonists)[number]) =>
      (sim as unknown as { workSpeed: (c: unknown, type: string) => number }).workSpeed(c, 'chop');
    const before = sim.colonists.map(speed);
    expect(triggerEvent(sim, 'inspiration')).toBe(true);
    const inspired = sim.colonists.findIndex((c) => c.thoughts.some((t) => t.key === 'inspired'));
    expect(inspired).toBeGreaterThanOrEqual(0);
    expect(speed(sim.colonists[inspired])).toBeCloseTo(before[inspired] * 1.4);
  });

  it('bumper crops make fields shoot up', () => {
    const { sim, w, x, y } = colony(7);
    const crops: number[] = [];
    for (let k = 0; k < 10; k++) {
      const i = w.idx(x - 5 + k, y + 4);
      w.setFeature(i, featureId('potatoPlant'));
      crops.push(i);
    }
    expect(triggerEvent(sim, 'bumperCrop')).toBe(true);
    expect(crops.every((i) => w.growth[i] > 0.34)).toBe(true);
  });

  it("don't send manhunters when nobody can be reached, and leave no strays behind", () => {
    const { sim } = colony(9);
    for (const c of sim.colonists) {
      c.health.downed = true;
    }
    const before = sim.animals.length;
    expect(triggerEvent(sim, 'manhunters')).toBe(false);
    expect(sim.animals.length).toBe(before);
  });

  it('leave a raging manhunter alone when it is marked for taming', () => {
    const { sim } = colony(10);
    triggerEvent(sim, 'manhunters');
    for (const a of sim.animals) {
      a.taming = a.manhunter === true;
    }
    for (let t = 0; t < 200; t++) {
      sim.step();
      expect(sim.colonists.some((c) => c.job?.type === 'tame')).toBe(false);
    }
  });

  it('land meteorites on open ground well away from buildings', () => {
    for (let seed = 11; seed < 16; seed++) {
      const { sim, w, x, y } = colony(seed);
      w.setFeature(w.idx(x + 1, y), featureId('bed'));
      const home = sim.homeTile()!;
      const before = new Set([...w.tilesWith('items')]);
      if (!triggerEvent(sim, 'meteorite')) {
        continue;
      }
      const landed = [...w.tilesWith('items')].filter((i) => !before.has(i) && w.itemType[i] === itemId('silver'));
      expect(landed.length).toBeGreaterThan(0);
      const d = w.distance(landed[0], home);
      expect(d).toBeGreaterThanOrEqual(8);
      expect(d).toBeLessThanOrEqual(23);
    }
  });

  it('blight strikes one field and spares the rest', () => {
    const { sim, w, x, y } = colony(16);
    const a: number[] = [];
    const b: number[] = [];
    for (let k = 0; k < 6; k++) {
      const i = w.idx(x - 8 + k, y + 6);
      const j = w.idx(x + 3 + k, y - 6);
      w.setFeature(i, featureId('potatoPlant'));
      w.setFeature(j, featureId('potatoPlant'));
      a.push(i);
      b.push(j);
    }
    expect(triggerEvent(sim, 'blight')).toBe(true);
    const left = (field: number[]) => field.filter((i) => w.feature[i] === featureId('potatoPlant')).length;
    expect([left(a), left(b)]).toContain(6);
    expect(left(a) + left(b)).toBeLessThan(12);
  });

  it('stand colonists down once the pack is dealt with', () => {
    const { sim } = colony(17);
    triggerEvent(sim, 'manhunters');
    for (const c of sim.living()) {
      sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    }
    for (const a of sim.animals.filter((x) => x.manhunter)) {
      a.hp = 0;
    }
    run(sim, 2);
    expect(sim.living().every((c) => !c.drafted)).toBe(true);
    expect(sim.story.manhuntersActive).toBe(false);
  });

  it('keep their timers through a save', () => {
    const { sim } = colony(8);
    triggerEvent(sim, 'heatWave');
    triggerEvent(sim, 'aurora');
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(heatWaveOn(copy)).toBe(true);
    expect(auroraOn(copy)).toBe(true);
  });
});
