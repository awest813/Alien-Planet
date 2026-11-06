import { describe, expect, it } from 'vitest';
import { colonistTarget, coverSpot, lineOfSight, spawnRaid, throughArmor, weaponScore, woundEnemy } from './combat';
import { ITEMS, NONE, STARTING_WEAPON, WEAPONS, featureId, itemId, terrainId, weaponDef } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';
import { Enemy } from './types';
import { World } from './world';

const forever = Number.MAX_SAFE_INTEGER;

// A raider dropped onto the map by hand, with a raid under way.
function raider(sim: Simulation, tile: number, weapon = 'shortBow', extra: Partial<Enemy> = {}): Enemy {
  const e: Enemy = {
    id: sim.nextEnemyId++,
    name: `Raider ${sim.nextEnemyId}`,
    faction: 0,
    tile,
    path: [],
    moveProgress: 0,
    hp: 1,
    weapon,
    armor: 0,
    skill: 4,
    speed: 0.9,
    suppression: 0,
    cooldown: 0,
    fleeing: false,
    repathAt: 0,
    ...extra,
  };
  sim.enemies.push(e);
  sim.raid ??= { faction: 0, initial: 1, killed: 0, startedTick: sim.tick, arrivedTick: sim.tick };
  return e;
}

// A cleared field in clear weather, everyone fed and out of the way unless the test says so.
function field(seed: number) {
  const sim = Simulation.newColony(seed);
  const w = sim.world;
  const { x, y } = clearAround(sim, 14);
  sim.weather = { kind: 'clear', until: forever };
  return { sim, w, x, y };
}

describe('weapons and armor', () => {
  it('are all made from real items, and colonists land with a short bow', () => {
    for (const weapon of WEAPONS) {
      if (weapon.key !== 'fists') {
        expect(weapon.item).toBeDefined();
        expect(ITEMS[weapon.item! - 1].weapon).toBe(weapon.key);
      }
    }
    expect(Simulation.newColony(1).colonists.every((c) => c.weapon === STARTING_WEAPON)).toBe(true);
  });

  it('turns aside blows, less so against piercing weapons', () => {
    const club = weaponDef('club');
    const crossbow = weaponDef('crossbow');
    expect(throughArmor(1, 0.45, club)).toBeCloseTo(0.55);
    expect(throughArmor(1, 0.45, crossbow)).toBeGreaterThan(0.75);
    expect(throughArmor(1, 0, club)).toBe(1);
  });

  it('ranks bows above clubs, and better-made ones above worse', () => {
    expect(weaponScore('recurveBow', 10)).toBeGreaterThan(weaponScore('shortBow', 10));
    expect(weaponScore('shortBow', 10)).toBeGreaterThan(weaponScore('club', 10));
    expect(weaponScore('longbow', 15)).toBeGreaterThan(weaponScore('longbow', 5));
  });

  it('are picked up from storage: a better weapon, armor, and melee for chargers', () => {
    const { sim, w, x, y } = field(2);
    w.dropItemNear(w.idx(x + 2, y), itemId('recurveBow'), 1);
    w.dropItemNear(w.idx(x - 2, y), itemId('leatherArmor'), 1);
    w.dropItemNear(w.idx(x, y + 2), itemId('spear'), 1);
    const [archer] = sim.colonists;
    for (const c of sim.colonists.slice(1)) {
      c.stance = 'charge';
    }
    run(sim, 300);
    expect(sim.colonists.some((c) => c.weapon === 'recurveBow')).toBe(true);
    expect(sim.colonists.some((c) => c.armor?.item === itemId('leatherArmor'))).toBe(true);
    expect(sim.colonists.some((c) => c.weapon === 'spear' && c.stance === 'charge')).toBe(true);
    // Nobody who'd rather shoot swaps their bow for the spear.
    expect(archer.weapon).not.toBe('spear');
  });

  it('slows its wearer when it is heavy', () => {
    const { sim, w, x, y } = field(3);
    const c = sim.colonists[0];
    c.path = [w.idx(x + 1, y)];
    const light = sim.moveRate(c);
    c.armor = { item: itemId('scaleArmor'), quality: 10, wear: 1 };
    expect(sim.moveRate(c)).toBeLessThan(light);
  });
});

describe('raiders', () => {
  it('come armed from their faction loadout, and better armed later on', () => {
    const sim = Simulation.newColony(4);
    const early = new Set<string>();
    for (let k = 0; k < 10; k++) {
      spawnRaid(sim, 1, 6);
      for (const e of sim.enemies) {
        early.add(e.weapon);
      }
      sim.enemies = [];
      sim.raid = null;
    }
    expect([...early].some((key) => weaponDef(key).range <= 1)).toBe(true);
    expect(early.has('longbow')).toBe(false);
    sim.tick += 24 * 30 * HOUR;
    sim.syncClock();
    let armored = 0;
    for (let k = 0; k < 10; k++) {
      spawnRaid(sim, 0, 6);
      armored += sim.enemies.filter((e) => e.armor > 0).length;
      sim.enemies = [];
      sim.raid = null;
    }
    expect(armored).toBeGreaterThan(0);
  });

  it('drop some of their gear when they fall', () => {
    const { sim, w, x, y } = field(5);
    for (let k = 0; k < 8; k++) {
      const e = raider(sim, w.idx(x + 6, y - 6 + k), 'crossbow', { armor: 0.25, armorItem: itemId('leatherArmor') });
      woundEnemy(sim, e, 2, 'Test');
    }
    expect(sim.stockOf(itemId('crossbow')) + sim.stockOf(itemId('leatherArmor'))).toBeGreaterThan(0);
    expect(sim.stats.kills).toBe(8);
  });

  it('archers move to cover when they are caught in the open', () => {
    const { sim, w, x, y } = field(6);
    const c = sim.colonists[0];
    for (const other of sim.colonists.slice(1)) {
      other.tile = w.idx(x - 12, y - 12);
    }
    c.tile = w.idx(x, y);
    // Sandbags a step away from the raider, facing the colonist.
    const bags = w.idx(x + 6, y);
    w.setFeature(bags, featureId('sandbags'));
    const e = raider(sim, w.idx(x + 7, y + 1), 'shortBow');
    e.suppression = 1;
    for (let t = 0; t < 200 && e.tile !== w.idx(x + 7, y); t++) {
      sim.step();
    }
    expect(e.tile).toBe(w.idx(x + 7, y));
  });

  it('are rattled by shots landing close', () => {
    const { sim, w, x, y } = field(7);
    const c = sim.colonists[0];
    sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    sim.apply({ type: 'stance', colonist: c.id, stance: 'hold' });
    const e = raider(sim, w.idx(x + 6, y), 'club', { hp: 50 });
    e.repathAt = forever;
    e.path = [];
    let most = 0;
    for (let t = 0; t < 300; t++) {
      e.path = [];
      sim.step();
      most = Math.max(most, e.suppression);
    }
    expect(most).toBeGreaterThan(0.2);
  });
});

describe('combat review fixes', () => {
  it('has archers coming in from afar stop and shoot rather than walk up and punch', () => {
    const { sim, w, x, y } = field(21);
    for (const c of sim.colonists) {
      c.tile = w.idx(x - 6, y);
      c.priorities = Object.fromEntries(Object.keys(c.priorities).map((k) => [k, 0])) as typeof c.priorities;
      c.schedule.fill('A');
    }
    const e = raider(sim, w.idx(x + 10, y), 'shortBow', { hp: 50 });
    let ranged = 0;
    let melee = 0;
    for (let t = 0; t < 600; t++) {
      for (const c of sim.colonists) {
        c.path = [];
        c.job = null;
        c.tile = w.idx(x - 6, y);
      }
      const before = sim.shots.length;
      sim.step();
      for (const shot of sim.shots.slice(before)) {
        if (shot.from === e.tile) {
          if (shot.ranged) {
            ranged++;
          } else {
            melee++;
          }
        }
      }
    }
    expect(ranged).toBeGreaterThan(0);
    expect(melee).toBe(0);
  });

  it('sees the same both ways', () => {
    const w = new World(24, 24);
    w.terrain.fill(terrainId('grass'));
    for (let i = 0; i < w.size; i += 7) {
      w.feature[i] = featureId('stoneWall');
    }
    for (let a = 0; a < w.size; a += 13) {
      for (let b = 0; b < w.size; b += 17) {
        expect(lineOfSight(w, a, b)).toBe(lineOfSight(w, b, a));
      }
    }
  });

  it('trades a recurve bow for a longbow of the same make', () => {
    const { sim, w, x, y } = field(22);
    for (const c of sim.colonists) {
      c.weapon = 'recurveBow';
      c.weaponQuality = 10;
    }
    w.dropItemNear(w.idx(x + 2, y), itemId('longbow'), 1, undefined, 10);
    run(sim, 300);
    expect(sim.colonists.some((c) => c.weapon === 'longbow')).toBe(true);
  });

  it('keeps colonists in shelter through a sleep slot while raiders are near', () => {
    const { sim, w, x, y } = field(23);
    const hut = { x0: x - 8, y0: y - 3, x1: x - 4, y1: y + 1 };
    for (const i of outline(w, hut.x0, hut.y0, hut.x1, hut.y1)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(hut.x1, y - 1), featureId('door'));
    const c = sim.colonists[0];
    c.tile = w.idx(x, y);
    c.schedule.fill('S');
    c.needs.rest = 0.5;
    raider(sim, w.idx(x + 10, y), 'club', { hp: 50, repathAt: forever });
    let sheltered = false;
    for (let t = 0; t < 400; t++) {
      for (const e of sim.enemies) {
        e.path = [];
      }
      sim.step();
      sheltered ||= c.job?.type === 'shelter';
      if (sheltered && t > 100) {
        break;
      }
    }
    expect(sheltered).toBe(true);
    expect(sim.isIndoors(c.tile) || c.job?.type === 'shelter').toBe(true);
  });

  it("keeps a player's move order when the stance changes", () => {
    const { sim, w, x, y } = field(24);
    const c = sim.colonists[0];
    sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    sim.apply({ type: 'move', colonist: c.id, tile: w.idx(x + 8, y) });
    expect(c.path.length).toBeGreaterThan(0);
    sim.apply({ type: 'stance', colonist: c.id, stance: 'hold' });
    expect(c.path.length).toBeGreaterThan(0);
  });

  it("keeps a player's move order through a save and load", () => {
    const { sim, w, x, y } = field(24);
    const c = sim.colonists[0];
    sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    sim.apply({ type: 'move', colonist: c.id, tile: w.idx(x + 8, y) });
    const copy = deserialize(structuredClone(serialize(sim)));
    copy.apply({ type: 'stance', colonist: c.id, stance: 'hold' });
    expect(copy.colonists[0].path.length).toBeGreaterThan(0);
  });

  it('leaves hunting to those with something that shoots', () => {
    const { sim } = field(25);
    for (const c of sim.colonists) {
      c.weapon = 'spear';
    }
    for (const a of sim.animals) {
      a.hunted = true;
    }
    run(sim, 200);
    expect(sim.colonists.some((c) => c.job?.type === 'hunt')).toBe(false);
  });
});

describe('defenses', () => {
  it('embrasures block movement but not shots, and shelter whoever is behind', () => {
    const w = new World(10, 10);
    w.terrain.fill(terrainId('grass'));
    w.feature[w.idx(5, 5)] = featureId('embrasure');
    expect(w.isPassable(w.idx(5, 5))).toBe(false);
    expect(lineOfSight(w, w.idx(0, 5), w.idx(9, 5))).toBe(true);
    w.feature[w.idx(5, 5)] = featureId('stoneWall');
    expect(lineOfSight(w, w.idx(0, 5), w.idx(9, 5))).toBe(false);
  });

  it('spike traps wound a raider who steps on one, and go back on the build list', () => {
    const { sim, w, x, y } = field(8);
    const trap = w.idx(x + 5, y);
    w.setFeature(trap, featureId('spikeTrap'));
    const e = raider(sim, w.idx(x + 6, y), 'club');
    e.path = [trap];
    e.repathAt = forever;
    for (let t = 0; t < 40 && w.feature[trap] !== NONE; t++) {
      sim.step();
    }
    expect(w.feature[trap]).toBe(NONE);
    expect(e.hp).toBeLessThan(0.75);
    // Rebuilt once the raid is over.
    expect(sim.pendingRebuilds.some(([i]) => i === trap)).toBe(true);
  });
});

describe('colonist tactics', () => {
  it('focus fire on the raider they were told to', () => {
    const { sim, w, x, y } = field(9);
    const c = sim.colonists[0];
    sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    const near = raider(sim, w.idx(x + 3, y));
    const far = raider(sim, w.idx(x + 6, y + 1));
    expect(colonistTarget(sim, c)).toBe(near);
    sim.apply({ type: 'focus', colonist: -1, enemy: far.id });
    expect(c.focus).toBe(far.id);
    expect(colonistTarget(sim, c)).toBe(far);
  });

  it('take cover behind sandbags when drafted in the open', () => {
    const { sim, w, x, y } = field(10);
    const c = sim.colonists[0];
    for (const other of sim.colonists.slice(1)) {
      other.tile = w.idx(x - 12, y - 12);
    }
    c.tile = w.idx(x, y);
    w.setFeature(w.idx(x + 2, y + 1), featureId('sandbags'));
    // A raider who stays put, so the test is about the colonist.
    const e = raider(sim, w.idx(x + 8, y + 1), 'club', { hp: 50, speed: 0 });
    e.repathAt = forever;
    sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    expect(coverSpot(sim, c)).toBe(w.idx(x + 1, y + 1));
    for (let t = 0; t < 200 && c.tile !== w.idx(x + 1, y + 1); t++) {
      e.path = [];
      sim.step();
    }
    expect(c.tile).toBe(w.idx(x + 1, y + 1));
  });

  it('run for shelter indoors when raiders come close and they are not drafted', () => {
    const { sim, w, x, y } = field(11);
    const hut = { x0: x - 8, y0: y - 3, x1: x - 4, y1: y + 1 };
    for (const i of outline(w, hut.x0, hut.y0, hut.x1, hut.y1)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(hut.x1, y - 1), featureId('door'));
    const c = sim.colonists[0];
    c.tile = w.idx(x, y);
    raider(sim, w.idx(x + 10, y), 'club', { hp: 50, repathAt: forever });
    for (let t = 0; t < HOUR && !sim.isIndoors(c.tile); t++) {
      for (const e of sim.enemies) {
        e.path = [];
      }
      sim.step();
    }
    expect(sim.isIndoors(c.tile)).toBe(true);
  });

  it('keep their kit, stance and focus through a save', () => {
    const { sim, w, x, y } = field(12);
    const c = sim.colonists[0];
    c.armor = { item: itemId('scaleArmor'), quality: 12, wear: 0.6 };
    c.weapon = 'longbow';
    c.stance = 'hold';
    const e = raider(sim, w.idx(x + 6, y), 'crossbow', { armor: 0.25, armorItem: itemId('leatherArmor') });
    c.focus = e.id;
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.colonists[0].armor).toEqual(c.armor);
    expect(copy.colonists[0].weapon).toBe('longbow');
    expect(copy.colonists[0].stance).toBe('hold');
    expect(copy.colonists[0].focus).toBe(e.id);
    expect(copy.enemies[0]).toEqual(e);
  });
});
