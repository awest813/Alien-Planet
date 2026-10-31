import { MOVE_SPEED, TICKS_PER_HOUR } from './constants';
import { FACTIONS } from './defs';
import { damage } from './health';
import { traitValue } from './social';
import type { Simulation } from './simulation';
import { Colonist, Enemy, Weapon } from './types';
import { World } from './world';

export interface RaidState {
  faction: number;
  initial: number;
  killed: number;
  startedTick: number;
}

const WEAPONS: Record<Weapon, { range: number; cooldown: number; accuracy: number; damage: [number, number] }> = {
  bow: { range: 7, cooldown: 55, accuracy: 0.55, damage: [0.09, 0.17] },
  knife: { range: 1, cooldown: 40, accuracy: 0.85, damage: [0.12, 0.2] },
};
const COLONIST_BOW = { range: 8, cooldown: 60, damage: [0.17, 0.26] as [number, number] };
const COLONIST_MELEE = { cooldown: 45, damage: [0.08, 0.14] as [number, number] };
// Undrafted colonists shoot back at raiders this close; drafted ones use the full bow range.
const SELF_DEFENCE_RANGE = 6;
// Raiders give up after this long, or once this share of them has fallen.
const RAID_TIMEOUT = TICKS_PER_HOUR * 36;
const MORALE_BREAK = 0.6;
const SHOT_LIFETIME = 8;

const chebyshev = (w: World, a: number, b: number) =>
  Math.max(Math.abs(w.xOf(a) - w.xOf(b)), Math.abs(w.yOf(a) - w.yOf(b)));

// Bresenham line between tile centres; walls, rock, and other solid tiles block it.
export function lineOfSight(w: World, from: number, to: number): boolean {
  let x0 = w.xOf(from);
  let y0 = w.yOf(from);
  const x1 = w.xOf(to);
  const y1 = w.yOf(to);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x0 === x1 && y0 === y1) {
      return true;
    }
    const i = w.idx(x0, y0);
    if (i !== from && !w.isPassable(i)) {
      return false;
    }
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function roll(sim: Simulation, [min, max]: [number, number]): number {
  return min + sim.rng.next() * (max - min);
}

function recordShot(sim: Simulation, from: number, to: number, hit: boolean, ranged: boolean): void {
  sim.shots.push({ from, to, hit, ranged, tick: sim.tick });
}

// ---- Raids ----

export function spawnRaid(sim: Simulation, faction: number, count: number): boolean {
  const w = sim.world;
  const anchor = sim.living()[0];
  if (!anchor) {
    return false;
  }
  const region = sim.regionOf(anchor.tile);
  const sides = ['north', 'south', 'west', 'east'];
  const start = sim.rng.int(0, 3);
  for (let s = 0; s < 4; s++) {
    const side = sides[(start + s) % 4];
    const edge: number[] = [];
    for (let k = 0; k < w.width; k++) {
      const [x, y] =
        side === 'north' ? [k, 0] : side === 'south' ? [k, w.height - 1] : side === 'west' ? [0, k] : [w.width - 1, k];
      const i = w.idx(x, y);
      if (sim.regionOf(i) === region) {
        edge.push(i);
      }
    }
    if (edge.length === 0) {
      continue;
    }
    const centre = sim.rng.pick(edge);
    const spots = edge.sort((a, b) => w.distance(a, centre) - w.distance(b, centre)).slice(0, count);
    const names = [...FACTIONS[faction].names];
    for (let n = 0; n < count; n++) {
      const name = names.length > 0 ? names.splice(sim.rng.int(0, names.length - 1), 1)[0] : 'Raider';
      sim.enemies.push({
        id: sim.nextEnemyId++,
        name,
        faction,
        tile: spots[n % spots.length],
        path: [],
        moveProgress: 0,
        hp: 1,
        weapon: sim.rng.next() < 0.6 ? 'bow' : 'knife',
        cooldown: 0,
        fleeing: false,
        repathAt: 0,
      });
    }
    sim.raid = { faction, initial: count, killed: 0, startedTick: sim.tick };
    sim.addLog(
      `Raid! ${count} raiders from ${FACTIONS[faction].name} are coming from the ${side}. Draft your colonists.`,
      'danger',
      true,
    );
    sim.events.push('raid');
    return true;
  }
  return false;
}

function targetFor(sim: Simulation, e: Enemy): Colonist | undefined {
  const region = sim.regionOf(e.tile);
  let best: Colonist | undefined;
  let bestDist = Infinity;
  for (const c of sim.living()) {
    if (c.health.downed || sim.regionOf(c.tile) !== region) {
      continue;
    }
    const d = sim.world.distance(e.tile, c.tile);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function moveEnemy(sim: Simulation, e: Enemy): void {
  const w = sim.world;
  const next = e.path[0];
  if (!w.isPassable(next)) {
    e.path = [];
    return;
  }
  const diagonal = w.xOf(next) !== w.xOf(e.tile) && w.yOf(next) !== w.yOf(e.tile);
  e.moveProgress += (MOVE_SPEED * 0.9) / (w.moveCost(next) * (diagonal ? Math.SQRT2 : 1));
  if (e.moveProgress >= 1) {
    e.tile = next;
    e.path.shift();
    e.moveProgress = 0;
  }
}

function flee(sim: Simulation, e: Enemy): void {
  const w = sim.world;
  const x = w.xOf(e.tile);
  const y = w.yOf(e.tile);
  if (x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1) {
    e.hp = 0;
    e.fleeing = true;
    return;
  }
  if (e.path.length === 0) {
    const region = sim.regionOf(e.tile);
    const exits = sim.nearest(
      e.tile,
      (i) => {
        const ix = w.xOf(i);
        const iy = w.yOf(i);
        return (ix === 0 || iy === 0 || ix === w.width - 1 || iy === w.height - 1) && sim.regionOf(i) === region;
      },
      3,
    );
    e.path = sim.pathfinder.find(e.tile, exits) ?? [];
    if (e.path.length === 0) {
      // Nowhere to run: vanish rather than linger forever.
      e.hp = 0;
      return;
    }
  }
  moveEnemy(sim, e);
}

function enemyAttack(sim: Simulation, e: Enemy, target: Colonist): void {
  const weapon = WEAPONS[e.weapon];
  const dist = sim.world.distance(e.tile, target.tile);
  const accuracy = weapon.range > 1 ? Math.max(0.15, weapon.accuracy - dist * 0.03) : weapon.accuracy;
  const hit = sim.rng.next() < accuracy;
  recordShot(sim, e.tile, target.tile, hit, weapon.range > 1);
  if (hit) {
    const harsh = sim.story.difficulty === 'harsh' ? 1.2 : 1;
    damage(sim, target, roll(sim, weapon.damage) * harsh, e.weapon === 'bow' ? 'arrow' : 'cut');
  }
  e.cooldown = weapon.cooldown;
}

export function updateEnemies(sim: Simulation): void {
  const w = sim.world;
  for (const e of sim.enemies) {
    if (e.hp <= 0) {
      continue;
    }
    e.cooldown--;
    if (e.fleeing) {
      flee(sim, e);
      continue;
    }
    const target = targetFor(sim, e);
    if (!target) {
      // Nobody left to fight (or nobody reachable): leave.
      e.fleeing = true;
      e.path = [];
      continue;
    }
    const weapon = WEAPONS[e.weapon];
    const inRange =
      weapon.range > 1
        ? w.distance(e.tile, target.tile) <= weapon.range && lineOfSight(w, e.tile, target.tile)
        : chebyshev(w, e.tile, target.tile) <= 1;
    if (inRange) {
      e.path = [];
      e.moveProgress = 0;
      if (e.cooldown <= 0) {
        enemyAttack(sim, e, target);
      }
      continue;
    }
    if (e.path.length === 0 || e.repathAt <= sim.tick) {
      const goals = [target.tile, ...w.neighbors(target.tile).filter((n) => w.isPassable(n))];
      e.path = sim.pathfinder.find(e.tile, goals) ?? [];
      e.repathAt = sim.tick + 30;
    }
    if (e.path.length > 0) {
      moveEnemy(sim, e);
    }
  }

  const raid = sim.raid;
  if (raid) {
    const fighting = sim.enemies.filter((e) => e.hp > 0 && !e.fleeing);
    if (
      fighting.length > 0 &&
      (raid.killed >= raid.initial * MORALE_BREAK || sim.tick - raid.startedTick > RAID_TIMEOUT)
    ) {
      for (const e of fighting) {
        e.fleeing = true;
        e.path = [];
      }
      sim.addLog('The raiders are fleeing!', 'good');
    }
  }
  sim.enemies = sim.enemies.filter((e) => e.hp > 0);
  if (raid && sim.enemies.length === 0) {
    sim.raid = null;
    const standing = sim.living().filter((c) => !c.health.downed);
    if (standing.length > 0) {
      sim.stats.raidsRepelled++;
      sim.addLog(
        `The raid is over. ${raid.killed} raider${raid.killed === 1 ? '' : 's'} fell. Colonists stand down.`,
        'good',
        true,
      );
      for (const c of standing) {
        sim.addThought(c, 'repelledRaid');
      }
    } else if (sim.living().length > 0) {
      sim.addLog('The raiders left the colony for dead.', 'danger', true);
    }
    for (const c of sim.living()) {
      if (c.drafted) {
        sim.endJob(c);
        c.drafted = false;
      }
    }
  }
  sim.shots = sim.shots.filter((s) => sim.tick - s.tick < SHOT_LIFETIME);
}

// ---- Colonists fighting back ----

function attackEnemy(sim: Simulation, c: Colonist, e: Enemy, ranged: boolean): void {
  const dist = sim.world.distance(c.tile, e.tile);
  const accuracy = ranged
    ? Math.max(0.1, Math.min(0.95, 0.45 + c.skills.combat * 0.05 + (traitValue(c, 'accuracy') ?? 0) - dist * 0.025))
    : 0.75 + c.skills.combat * 0.02;
  const hit = sim.rng.next() < accuracy;
  recordShot(sim, c.tile, e.tile, hit, ranged);
  if (hit) {
    e.hp -= roll(sim, ranged ? COLONIST_BOW.damage : COLONIST_MELEE.damage);
    if (e.hp <= 0) {
      sim.stats.kills++;
      if (sim.raid) {
        sim.raid.killed++;
      }
      sim.addLog(`${c.name} brought down ${e.name}.`, 'good');
    }
  }
  c.cooldown = ranged ? COLONIST_BOW.cooldown : COLONIST_MELEE.cooldown;
}

// Colonists shoot the nearest enemy in range (drafted ones from further away) and fight back in
// melee. Returns true if the colonist spent this tick fighting (and so shouldn't move or work).
export function colonistCombat(sim: Simulation, c: Colonist): boolean {
  c.cooldown--;
  if (sim.enemies.length === 0) {
    return false;
  }
  const w = sim.world;
  const range = c.drafted ? COLONIST_BOW.range : SELF_DEFENCE_RANGE;
  // The nearest enemy we can actually hit: adjacent, or in range with a clear shot.
  let nearest: Enemy | undefined;
  let nearestDist = Infinity;
  for (const e of sim.enemies) {
    const d = w.distance(c.tile, e.tile);
    if (e.hp <= 0 || d >= nearestDist) {
      continue;
    }
    if (chebyshev(w, c.tile, e.tile) <= 1 || (d <= range && lineOfSight(w, c.tile, e.tile))) {
      nearest = e;
      nearestDist = d;
    }
  }
  if (!nearest) {
    return false;
  }
  const melee = chebyshev(w, c.tile, nearest.tile) <= 1;
  if (!c.drafted && c.job) {
    // Drop whatever we were doing (waking up if need be) to fight.
    sim.endJob(c);
  }
  if (c.cooldown <= 0) {
    attackEnemy(sim, c, nearest, !melee);
  }
  return true;
}
