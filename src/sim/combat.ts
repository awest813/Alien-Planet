import { hurtAnimal } from './animals';
import { MOVE_SPEED, TICKS_PER_HOUR } from './constants';
import { FACTIONS, NONE, featureDef, itemDef, itemId } from './defs';
import { damage } from './health';
import { learn } from './skills';
import { traitValue } from './social';
import type { Simulation } from './simulation';
import { Animal, Colonist, ColonistWeapon, Enemy, Weapon } from './types';
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
export const COLONIST_WEAPONS: Record<
  ColonistWeapon,
  { name: string; range: number; cooldown: number; damage: [number, number] }
> = {
  bow: { name: 'Short bow', range: 8, cooldown: 60, damage: [0.17, 0.26] },
  recurveBow: { name: 'Recurve bow', range: 9, cooldown: 55, damage: [0.24, 0.34] },
};
// Combat experience per attack.
const COMBAT_XP = 40;
const COLONIST_MELEE = { cooldown: 45, damage: [0.08, 0.14] as [number, number] };
// Undrafted colonists shoot back at raiders this close; drafted ones use the full bow range.
const SELF_DEFENCE_RANGE = 6;
// Raiders give up after this long, or once this share of them has fallen.
const RAID_TIMEOUT = TICKS_PER_HOUR * 36;
const MORALE_BREAK = 0.6;
const SHOT_LIFETIME = 8;

const chebyshev = (w: World, a: number, b: number) =>
  Math.max(Math.abs(w.xOf(a) - w.xOf(b)), Math.abs(w.yOf(a) - w.yOf(b)));

// Hit-chance multiplier for a target sheltering behind cover (sandbags) on the side facing the shooter.
export function coverFactor(w: World, shooter: number, target: number): number {
  const ddx = w.xOf(shooter) - w.xOf(target);
  const ddy = w.yOf(shooter) - w.yOf(target);
  // Only the sides the shot actually comes past: the main axis, plus the diagonal and the
  // other axis when the angle is close to diagonal.
  const dx = Math.abs(ddx) * 2 >= Math.abs(ddy) ? Math.sign(ddx) : 0;
  const dy = Math.abs(ddy) * 2 >= Math.abs(ddx) ? Math.sign(ddy) : 0;
  const tx = w.xOf(target);
  const ty = w.yOf(target);
  let factor = 1;
  for (const [ox, oy] of [
    [dx, dy],
    [dx, 0],
    [0, dy],
  ]) {
    if ((ox === 0 && oy === 0) || !w.inBounds(tx + ox, ty + oy) || w.idx(tx + ox, ty + oy) === shooter) {
      continue;
    }
    const f = w.feature[w.idx(tx + ox, ty + oy)];
    if (f !== NONE) {
      factor = Math.min(factor, featureDef(f).cover);
    }
  }
  return factor;
}

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
  const region = sim.outsideRegion();
  if (region === undefined) {
    return false;
  }
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
        weapon: sim.rng.next() < 0.7 ? 'bow' : 'knife',
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

// Raiders who can't reach anyone head for the colonist nearest them and smash through whatever
// wall or door is in the way. Returns false if there's nobody to go after.
function breach(sim: Simulation, e: Enemy): boolean {
  const w = sim.world;
  const goal = sim
    .living()
    .filter((c) => !c.health.downed)
    .sort((a, b) => w.distance(e.tile, a.tile) - w.distance(e.tile, b.tile))[0];
  if (!goal) {
    return false;
  }
  const region = sim.regionOf(e.tile);
  // Stick with one wall until it's down (spreading blows over several walls breaks none).
  if (e.breachTarget === undefined || !breakable(w, e.breachTarget)) {
    e.breachTarget = breachWall(sim, region, sim.regionOf(goal.tile), goal.tile);
    e.path = [];
  }
  const wall = e.breachTarget;
  if (wall === undefined) {
    return false;
  }
  if (w.neighbors(wall, false).includes(e.tile)) {
    e.path = [];
    e.moveProgress = 0;
    if (e.cooldown <= 0) {
      e.cooldown = WEAPONS[e.weapon].cooldown;
      const damage = (sim.wallDamage.get(wall) ?? 0) + 10;
      const def = featureDef(w.feature[wall]);
      if (damage >= def.build!.work) {
        sim.wallDamage.delete(wall);
        w.setFeature(wall, NONE);
        sim.addLog(`Raiders broke through a ${def.name.toLowerCase()}!`, 'danger');
      } else {
        sim.wallDamage.set(wall, damage);
      }
    }
    return true;
  }
  if (e.path.length === 0) {
    const spots = w.neighbors(wall, false).filter((n) => w.isPassable(n) && sim.regionOf(n) === region);
    e.path = sim.pathfinder.find(e.tile, spots) ?? [];
    if (e.path.length === 0) {
      e.breachTarget = undefined;
      return false;
    }
  }
  moveEnemy(sim, e);
  return true;
}

const breakable = (w: World, i: number) => w.feature[i] !== NONE && !!featureDef(w.feature[i]).build && w.blocksRoom(i);

// The wall to break: one the raider can stand next to that opens straight into the colonists'
// side, nearest them; failing that (thick or doubled walls), the wall on this side nearest them.
function breachWall(sim: Simulation, region: number, goalRegion: number, goalTile: number): number | undefined {
  const w = sim.world;
  let best: number | undefined;
  let bestScore = Infinity;
  for (let i = 0; i < w.size; i++) {
    if (!breakable(w, i)) {
      continue;
    }
    const sides = w.neighbors(i, false);
    if (!sides.some((n) => w.isPassable(n) && sim.regionOf(n) === region)) {
      continue;
    }
    const opens = sides.some((n) => w.isPassable(n) && sim.regionOf(n) === goalRegion);
    const score = w.distance(i, goalTile) + (opens ? 0 : 1000);
    if (score < bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

// Raiders who beat the whole colony carry off part of its food, medicine and goods.
function plunder(sim: Simulation): string {
  const w = sim.world;
  const loot = ['meal', 'fineMeal', 'herbalMedicine', 'cloth', 'leather', 'potatoes'].map((key) => itemId(key));
  const taken = new Map<number, number>();
  for (let i = 0; i < w.size; i++) {
    const item = w.itemType[i];
    if (loot.includes(item)) {
      const n = w.takeItem(i, Math.ceil(w.itemCount[i] * 0.3));
      taken.set(item, (taken.get(item) ?? 0) + n);
    }
  }
  const parts = [...taken].filter(([, n]) => n > 0).map(([item, n]) => `${n} ${itemDef(item).name.toLowerCase()}`);
  return parts.length > 0 ? ` and carried off ${parts.join(', ')}` : '';
}

function moveEnemy(sim: Simulation, e: Enemy): void {
  const w = sim.world;
  const next = e.path[0];
  if (!w.isPassable(next)) {
    e.path = [];
    e.moveProgress = 0;
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
  const ranged = weapon.range > 1;
  const accuracy = ranged
    ? Math.max(0.15, weapon.accuracy - dist * 0.03) * coverFactor(sim.world, e.tile, target.tile)
    : weapon.accuracy;
  const hit = sim.rng.next() < accuracy;
  recordShot(sim, e.tile, target.tile, hit, ranged);
  if (hit) {
    const harsh = sim.story.difficulty === 'harsh' ? 1.1 : 1;
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
    if (!target && breach(sim, e)) {
      continue;
    }
    if (!target) {
      // Nobody left to fight: leave.
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
      sim.addLog(`The raiders left the colony for dead${plunder(sim)}.`, 'danger', true);
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

// One colonist attack at `target`; returns the damage dealt (0 on a miss).
function colonistAttack(sim: Simulation, c: Colonist, target: number, ranged: boolean): number {
  const weapon = COLONIST_WEAPONS[c.weapon];
  const dist = sim.world.distance(c.tile, target);
  const accuracy = ranged
    ? Math.max(0.1, Math.min(0.95, 0.4 + c.skills.combat * 0.03 + (traitValue(c, 'accuracy') ?? 0) - dist * 0.025)) *
      coverFactor(sim.world, c.tile, target)
    : 0.7 + c.skills.combat * 0.015;
  const hit = sim.rng.next() < accuracy;
  recordShot(sim, c.tile, target, hit, ranged);
  c.cooldown = ranged ? weapon.cooldown : COLONIST_MELEE.cooldown;
  learn(sim, c, 'combat', COMBAT_XP);
  return hit ? roll(sim, ranged ? weapon.damage : COLONIST_MELEE.damage) : 0;
}

function attackEnemy(sim: Simulation, c: Colonist, e: Enemy, ranged: boolean): void {
  const dealt = colonistAttack(sim, c, e.tile, ranged);
  if (dealt > 0) {
    e.hp -= dealt;
    if (e.hp <= 0) {
      sim.stats.kills++;
      if (sim.raid) {
        sim.raid.killed++;
      }
      sim.addLog(`${c.name} brought down ${e.name}.`, 'good');
    }
  }
}

// Hunting, or fending off an angry animal.
export function attackAnimal(sim: Simulation, c: Colonist, a: Animal): void {
  const melee = chebyshev(sim.world, c.tile, a.tile) <= 1;
  const dealt = colonistAttack(sim, c, a.tile, !melee);
  if (dealt > 0) {
    hurtAnimal(sim, a, dealt, c);
  }
}

// Whether a colonist could attack `target` from where they stand.
export function canAttack(sim: Simulation, c: Colonist, target: number, range: number): boolean {
  const w = sim.world;
  return chebyshev(w, c.tile, target) <= 1 || (w.distance(c.tile, target) <= range && lineOfSight(w, c.tile, target));
}

// Colonists shoot the nearest enemy in range (drafted ones from further away) and fight back in
// melee. Returns true if the colonist spent this tick fighting (and so shouldn't move or work).
export function colonistCombat(sim: Simulation, c: Colonist): boolean {
  c.cooldown--;
  const w = sim.world;
  const range = c.drafted ? COLONIST_WEAPONS[c.weapon].range : SELF_DEFENCE_RANGE;
  // Animals that have turned on someone are fair game for anyone nearby.
  // Enraged animals: always fight back if it's after you or right next to you; otherwise only
  // step in when free (not drafted for a raid, asleep, in bed, or doctoring).
  const busy = c.sleeping || c.job?.type === 'rest' || c.job?.type === 'tend' || (c.drafted && sim.enemies.length > 0);
  const beast = sim.animals.find(
    (a) =>
      a.hp > 0 &&
      a.revengeOn >= 0 &&
      (a.revengeOn === c.id || chebyshev(w, c.tile, a.tile) <= 1 || !busy) &&
      canAttack(sim, c, a.tile, range),
  );
  if (beast) {
    if (!c.drafted && c.job) {
      sim.endJob(c);
    }
    if (c.cooldown <= 0) {
      attackAnimal(sim, c, beast);
    }
    return true;
  }
  if (sim.enemies.length === 0) {
    return false;
  }
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
