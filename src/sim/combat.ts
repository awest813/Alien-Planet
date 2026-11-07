import { hurtAnimal } from './animals';
import { qualityFactor } from './apparel';
import { MOVE_SPEED, TICKS_PER_HOUR } from './constants';
import { FACTIONS, NONE, NORMAL_QUALITY, WeaponDef, featureDef, itemDef, itemId, weaponDef } from './defs';
import { damage, painOf } from './health';
import { fallWounded } from './prisoners';
import { learn } from './skills';
import { traitValue } from './social';
import type { Simulation } from './simulation';
import { Animal, Colonist, Enemy } from './types';
import { weatherDef } from './weather';
import { Filth, World } from './world';

// Combat. Colonists and raiders share one weapon table (melee: fists, knives, clubs, spears;
// ranged: bows and crossbows), each with its own range, rate, accuracy, drop-off and armor
// piercing. Armor turns aside part of every blow. Archers look for firing positions behind
// cover and are rattled (suppressed) by shots landing close; melee fighters charge.

export interface RaidState {
  faction: number;
  initial: number;
  killed: number;
  startedTick: number;
  // When the first raider came within reach of the colony (undefined while still on the way).
  arrivedTick?: number;
  // How the raid ended, decided the moment it broke rather than when the last raider left the
  // map (which can take hours on a big map): beaten off, gave up, or overran the colony.
  outcome?: 'repelled' | 'withdrew' | 'overrun';
}

// Raiders this close to a colonist have arrived; the raid's time limit runs from then.
const ARRIVAL_RANGE = 30;
// Combat experience per attack.
const COMBAT_XP = 40;
// Undrafted colonists shoot back at raiders this close; drafted ones use their weapon's range.
const SELF_DEFENCE_RANGE = 6;
// Raiders give up after this long at the colony, or once this share of them is out of the fight.
const RAID_TIMEOUT = TICKS_PER_HOUR * 24;
const MORALE_BREAK = 0.6;
const SHOT_LIFETIME = 8;
// Raiders' blows land softer on colonists than colonists' on raiders: colonists bleed and can be
// patched up, raiders just fall.
const RAIDER_HIT = 0.55;
// Raiders are rougher shots than colonists of the same skill (they don't train together).
const RAIDER_AIM = -0.08;
// Suppression from a shot landing on or next to a raider, and how fast it wears off per tick.
const SUPPRESS_MISS = 0.12;
const SUPPRESS_HIT = 0.25;
const SUPPRESS_DECAY = 0.006;
// A raider this badly hurt may break and run on their own.
const WOUNDED_FLEE = 0.35;
// How often (ticks) archers rethink where to shoot from.
const POST_RETHINK = 60;
// How often (ticks) a badly hurt raider weighs running for it.
const NERVE_CHECK = 60;
const FISTS = weaponDef('fists');

const chebyshev = (w: World, a: number, b: number) =>
  Math.max(Math.abs(w.xOf(a) - w.xOf(b)), Math.abs(w.yOf(a) - w.yOf(b)));

// Hit-chance multiplier for a target sheltering behind cover (sandbags, embrasures) on the side
// facing the shooter.
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

const inCover = (w: World, from: number, at: number) => coverFactor(w, from, at) < 1;

// Bresenham line between tile centres; walls, rock, and other solid tiles block it (embrasures
// don't).
export function lineOfSight(w: World, a: number, b: number): boolean {
  // Traced the same way whichever end it starts from, so seeing is always mutual.
  const from = Math.min(a, b);
  const to = Math.max(a, b);
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
    if (i !== from && !w.isPassable(i) && !(w.feature[i] !== NONE && featureDef(w.feature[i]).seeThrough)) {
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

// Chance to hit: the weapon's accuracy, adjusted for skill, distance (ranged only), cover, the
// weather and the shooter's nerve.
function hitChance(
  sim: Simulation,
  weapon: WeaponDef,
  skill: number,
  from: number,
  to: number,
  bonus = 0,
  suppression = 0,
): number {
  const w = sim.world;
  if (weapon.range <= 1) {
    return Math.min(0.95, weapon.accuracy + (skill - 5) * 0.015 + bonus);
  }
  const base = weapon.accuracy + (skill - 5) * 0.03 + bonus - w.distance(from, to) * weapon.falloff;
  return (
    Math.max(0.08, Math.min(0.95, base)) * coverFactor(w, from, to) * weatherDef(sim).aim * (1 - 0.5 * suppression)
  );
}

// Damage after armor: armor turns aside its share, less against piercing weapons.
export const throughArmor = (amount: number, armor: number, weapon: WeaponDef) =>
  amount * (1 - armor * (1 - weapon.pierce));

// The weapon actually used against a target this close: a bow at arm's length is a club.
const weaponAt = (key: string, adjacent: boolean): WeaponDef => {
  const weapon = weaponDef(key);
  return adjacent && weapon.range > 1 ? FISTS : weapon;
};

// ---- Raids ----

// Picks a raider's weapon from the faction's loadout (better kit turns up later in the game).
function raiderWeapon(sim: Simulation, faction: number): string {
  const options = FACTIONS[faction].loadout.filter((o) => (o.minDay ?? 0) <= sim.day);
  if (options.length === 0) {
    return 'shortBow';
  }
  let r = sim.rng.next() * options.reduce((sum, o) => sum + o.weight, 0);
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) {
      return o.weapon;
    }
  }
  return options[0].weapon;
}

// Armor turns up on raiders as the game goes on (sooner on harsh).
function raiderArmor(sim: Simulation): number | undefined {
  const harsh = sim.story.difficulty === 'harsh' ? 0.15 : 0;
  const r = sim.rng.next();
  const scale = Math.max(0, Math.min(0.35, (sim.day - 34) * 0.03 + harsh * 0.5));
  if (r < scale) {
    return itemId('scaleArmor');
  }
  const leather = Math.max(0, Math.min(0.5, (sim.day - 10) * 0.03 + harsh));
  return r < scale + leather ? itemId('leatherArmor') : undefined;
}

export function spawnRaid(sim: Simulation, faction: number, count: number): boolean {
  const w = sim.world;
  const region = sim.outsideRegion();
  if (region === undefined) {
    return false;
  }
  const def = FACTIONS[faction];
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
    const names = [...def.names];
    const skill = def.skill + (sim.story.difficulty === 'harsh' ? 1 : 0) + Math.floor(sim.day / 20);
    for (let n = 0; n < count; n++) {
      const name = names.length > 0 ? names.splice(sim.rng.int(0, names.length - 1), 1)[0] : 'Raider';
      const armorItem = raiderArmor(sim);
      sim.enemies.push({
        id: sim.nextEnemyId++,
        name,
        faction,
        tile: spots[n % spots.length],
        path: [],
        moveProgress: 0,
        hp: 1,
        weapon: raiderWeapon(sim, faction),
        armor: armorItem !== undefined ? itemDef(armorItem).armor!.protection : 0,
        armorItem,
        skill,
        speed: def.speed * (armorItem !== undefined ? itemDef(armorItem).armor!.speed : 1),
        suppression: 0,
        cooldown: 0,
        fleeing: false,
        repathAt: 0,
      });
    }
    sim.raid = { faction, initial: count, killed: 0, startedTick: sim.tick };
    sim.addLog(
      `Raid! ${count} raiders from ${def.name} are coming from the ${side}. Draft your colonists.`,
      'danger',
      true,
    );
    sim.events.push('raid');
    return true;
  }
  return false;
}

// Who a raider goes after: archers pick off the exposed and the wounded, melee fighters whoever
// is nearest.
function targetFor(sim: Simulation, e: Enemy): Colonist | undefined {
  const w = sim.world;
  const region = sim.regionOf(e.tile);
  const ranged = weaponDef(e.weapon).range > 1;
  let best: Colonist | undefined;
  let bestScore = Infinity;
  for (const c of sim.living()) {
    if (c.health.downed || sim.regionOf(c.tile) !== region) {
      continue;
    }
    const d = w.distance(e.tile, c.tile);
    const score = ranged ? d + (inCover(w, e.tile, c.tile) ? 3 : 0) - painOf(c) * 4 : d;
    if (score < bestScore) {
      bestScore = score;
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
  // Stick with one wall until it's down (spreading blows over several walls breaks none), unless
  // the colonists have moved somewhere it no longer leads; then look again now and then.
  const goalRegion = sim.regionOf(goal.tile);
  const stale =
    e.breachTarget !== undefined &&
    !w.neighbors(e.breachTarget, false).some((n) => w.isPassable(n) && sim.regionOf(n) === goalRegion) &&
    e.repathAt <= sim.tick;
  if (e.breachTarget === undefined || !breakable(w, e.breachTarget) || stale) {
    e.breachTarget = breachWall(sim, region, goalRegion, goal.tile);
    e.repathAt = sim.tick + 200;
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
      e.cooldown = weaponDef(e.weapon).cooldown;
      // Clubs and spears are better for battering than bows.
      w.damage[wall] += weaponDef(e.weapon).range > 1 ? 8 : 14;
      const def = featureDef(w.feature[wall]);
      if (w.damage[wall] >= def.build!.work) {
        const feature = w.feature[wall];
        w.setFeature(wall, NONE);
        w.addFilth(wall, Filth.RUBBLE, 2);
        sim.rebuild(wall, feature);
        sim.addLog(`Raiders broke through a ${def.name.toLowerCase()}!`, 'danger');
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
export function plunder(sim: Simulation): string {
  const w = sim.world;
  const loot = ['meal', 'fineMeal', 'herbalMedicine', 'cloth', 'leather', 'potatoes'].map((key) => itemId(key));
  // Take 30% of each kind of loot, counted across all its stacks.
  const quota = new Map<number, number>();
  for (let i = 0; i < w.size; i++) {
    if (loot.includes(w.itemType[i])) {
      quota.set(w.itemType[i], (quota.get(w.itemType[i]) ?? 0) + w.itemCount[i]);
    }
  }
  for (const [item, total] of quota) {
    quota.set(item, Math.floor(total * 0.3));
  }
  const taken = new Map<number, number>();
  for (let i = 0; i < w.size; i++) {
    const item = w.itemType[i];
    const left = (quota.get(item) ?? 0) - (taken.get(item) ?? 0);
    if (left > 0) {
      taken.set(item, (taken.get(item) ?? 0) + w.takeItem(i, left));
    }
  }
  const parts = [...taken].filter(([, n]) => n > 0).map(([item, n]) => `${n} ${itemDef(item).name.toLowerCase()}`);
  return parts.length > 0 ? ` and carried off ${parts.join(', ')}` : '';
}

// A raider takes a wound; at zero they fall, dropping some of their kit. `by` names who (or
// what) did it, for the log.
export function woundEnemy(sim: Simulation, e: Enemy, amount: number, by: string): void {
  if (e.hp <= 0) {
    return;
  }
  e.hp -= amount;
  sim.world.addFilth(e.tile, Filth.BLOOD);
  if (e.hp > 0) {
    return;
  }
  sim.stats.kills++;
  if (sim.raid) {
    sim.raid.killed++;
  }
  const wounded = fallWounded(sim, e);
  sim.addLog(
    wounded
      ? `${by} brought down ${e.name}, who lies wounded: mark them with Capture to take them prisoner.`
      : `${by} brought down ${e.name}.`,
    'good',
  );
  const w = sim.world;
  const weapon = weaponDef(e.weapon);
  // Some of a fallen raider's gear survives the fight.
  if (weapon.item !== undefined && sim.rng.next() < 0.6) {
    w.dropItemNear(e.tile, weapon.item, 1, undefined, sim.rng.int(NORMAL_QUALITY - 4, NORMAL_QUALITY + 2));
  }
  if (e.armorItem !== undefined && sim.rng.next() < 0.5) {
    w.dropItemNear(e.tile, e.armorItem, 1, 0.3 + sim.rng.next() * 0.4, NORMAL_QUALITY - 2);
  }
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
  e.moveProgress += (MOVE_SPEED * e.speed) / (w.moveCost(next) * (diagonal ? Math.SQRT2 : 1));
  if (e.moveProgress >= 1) {
    e.tile = next;
    e.path.shift();
    e.moveProgress = 0;
    springTrap(sim, e);
  }
}

// A spike trap springs on the first raider to step on it, then goes back on the build list.
function springTrap(sim: Simulation, e: Enemy): void {
  const w = sim.world;
  const f = w.feature[e.tile];
  if (f === NONE || !featureDef(f).trap || e.fleeing) {
    return;
  }
  w.setFeature(e.tile, NONE);
  sim.rebuild(e.tile, f);
  sim.addLog(`${e.name} stepped on a spike trap!`, 'good');
  recordShot(sim, e.tile, e.tile, true, false);
  // Spikes find the gaps in armor.
  woundEnemy(sim, e, (0.3 + sim.rng.next() * 0.15) * (1 - e.armor * 0.5), 'A spike trap');
  e.suppression = 1;
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

// How much of a blow gets through a colonist's armor; the armor takes a beating doing its job.
export function armorTakes(sim: Simulation, target: Colonist, amount: number, pierce = 0): number {
  if (!target.armor) {
    return amount;
  }
  const dealt = amount * (1 - itemDef(target.armor.item).armor!.protection * (1 - pierce));
  target.armor.wear -= dealt * 0.6;
  if (target.armor.wear <= 0) {
    sim.addLog(`${target.name}'s ${itemDef(target.armor.item).name.toLowerCase()} has fallen apart.`, 'warn');
    target.armor = null;
  }
  return dealt;
}

function enemyAttack(sim: Simulation, e: Enemy, target: Colonist): void {
  const adjacent = chebyshev(sim.world, e.tile, target.tile) <= 1;
  const weapon = weaponAt(e.weapon, adjacent);
  const ranged = weapon.range > 1;
  const hit = sim.rng.next() < hitChance(sim, weapon, e.skill, e.tile, target.tile, RAIDER_AIM, e.suppression);
  recordShot(sim, e.tile, target.tile, hit, ranged);
  if (hit) {
    const harsh = sim.story.difficulty === 'harsh' ? 1.1 : 1;
    const dealt = armorTakes(sim, target, roll(sim, weapon.damage) * RAIDER_HIT * harsh, weapon.pierce);
    damage(sim, target, dealt, !ranged && weapon.key === 'club' ? 'bruise' : ranged ? 'arrow' : 'cut');
  }
  e.cooldown = weapon.cooldown;
}

// Somewhere for an archer to shoot from: in range of the target with a clear shot, at a
// comfortable distance, behind cover if there's any nearby, and not right next to a colonist.
function choosePost(sim: Simulation, e: Enemy, target: Colonist): number | undefined {
  const w = sim.world;
  const weapon = weaponDef(e.weapon);
  const preferred = weapon.range * 0.7;
  const region = sim.regionOf(e.tile);
  const colonists = sim.living().filter((c) => !c.health.downed);
  let best: number | undefined;
  let bestScore = Infinity;
  // A short breadth-first search over the tiles around the raider.
  const steps = new Map<number, number>([[e.tile, 0]]);
  const queue = [e.tile];
  for (let q = 0; q < queue.length && q < 160; q++) {
    const t = queue[q];
    const s = steps.get(t)!;
    const d = w.distance(t, target.tile);
    if (d <= weapon.range - 0.5 && d >= 2.5 && lineOfSight(w, t, target.tile)) {
      const crowded = colonists.some((c) => chebyshev(w, c.tile, t) <= 1);
      const score = s * 0.7 + Math.abs(d - preferred) * 0.4 + (inCover(w, target.tile, t) ? -5 : 0) + (crowded ? 6 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (s >= 6) {
      continue;
    }
    for (const n of w.neighbors(t)) {
      if (!steps.has(n) && w.isPassable(n) && sim.regionOf(n) === region) {
        steps.set(n, s + 1);
        queue.push(n);
      }
    }
  }
  return best;
}

export function updateEnemies(sim: Simulation): void {
  const w = sim.world;
  for (const e of sim.enemies) {
    if (e.hp <= 0) {
      continue;
    }
    e.cooldown--;
    e.suppression = Math.max(0, e.suppression - SUPPRESS_DECAY);
    if (e.fleeing) {
      flee(sim, e);
      continue;
    }
    // Badly hurt and losing their nerve: some break and run on their own.
    if (e.hp < WOUNDED_FLEE && (e.nerveCheckAt ?? 0) <= sim.tick) {
      e.nerveCheckAt = sim.tick + NERVE_CHECK;
      if (sim.rng.next() < 0.2 + e.suppression * 0.3) {
        e.fleeing = true;
        e.path = [];
        sim.addLog(`${e.name} is badly hurt and running for it.`, 'good');
        continue;
      }
    }
    const target = targetFor(sim, e);
    if (!target && breach(sim, e)) {
      continue;
    }
    if (!target) {
      // Nobody left to fight: leave. Everyone downed is a defeat; nobody reachable, a withdrawal.
      if (sim.raid && !sim.raid.outcome) {
        sim.raid.outcome = sim.living().some((c) => !c.health.downed) ? 'withdrew' : 'overrun';
      }
      e.fleeing = true;
      e.path = [];
      continue;
    }
    const weapon = weaponDef(e.weapon);
    const adjacent = chebyshev(w, e.tile, target.tile) <= 1;
    const ranged = weapon.range > 1;
    const canShoot = ranged && w.distance(e.tile, target.tile) <= weapon.range && lineOfSight(w, e.tile, target.tile);
    if (adjacent || canShoot) {
      // An archer caught in the open, or pinned down, looks for a better spot now and then.
      if (
        ranged &&
        !adjacent &&
        e.repathAt <= sim.tick &&
        (e.suppression > 0.5 || !inCover(w, target.tile, e.tile)) &&
        e.path.length === 0
      ) {
        e.repathAt = sim.tick + POST_RETHINK;
        const post = choosePost(sim, e, target);
        if (post !== undefined && post !== e.tile && inCover(w, target.tile, post)) {
          e.post = post;
          e.path = sim.pathfinder.find(e.tile, [post]) ?? [];
        }
      }
      const toPost = e.post !== undefined && e.path.length > 0 && e.path[e.path.length - 1] === e.post;
      if (toPost && !adjacent) {
        moveEnemy(sim, e);
        continue;
      }
      e.path = [];
      e.moveProgress = 0;
      if (e.cooldown <= 0) {
        enemyAttack(sim, e, target);
      }
      continue;
    }
    if (e.path.length === 0 || e.repathAt <= sim.tick) {
      e.repathAt = sim.tick + (ranged ? POST_RETHINK : 30);
      // Archers close to within reach and pick a firing position; melee fighters charge.
      const post =
        ranged && w.distance(e.tile, target.tile) <= weapon.range + 6 ? choosePost(sim, e, target) : undefined;
      e.post = post;
      const goals =
        post !== undefined ? [post] : [target.tile, ...w.neighbors(target.tile).filter((n) => w.isPassable(n))];
      e.path = sim.pathfinder.find(e.tile, goals) ?? [];
    }
    if (e.path.length > 0) {
      moveEnemy(sim, e);
    }
  }

  const raid = sim.raid;
  if (raid) {
    const fighting = sim.enemies.filter((e) => e.hp > 0 && !e.fleeing);
    if (
      raid.arrivedTick === undefined &&
      fighting.some((e) => sim.living().some((c) => w.distance(e.tile, c.tile) <= ARRIVAL_RANGE))
    ) {
      raid.arrivedTick = sim.tick;
      // On a big map raiders can take hours to walk in; say when they actually get close.
      if (sim.tick - raid.startedTick > TICKS_PER_HOUR / 2) {
        sim.addLog('The raiders are closing in on the colony!', 'danger', true);
        sim.events.push('raidNear');
      }
    }
    // On a big map the walk in doesn't eat into the raid's time; a raid that never gets close
    // gives up after twice the usual time.
    const timedOut =
      raid.arrivedTick !== undefined
        ? sim.tick - raid.arrivedTick > RAID_TIMEOUT
        : sim.tick - raid.startedTick > RAID_TIMEOUT * 2;
    // Broken once most of them are down or running.
    const broken = fighting.length <= raid.initial * (1 - MORALE_BREAK);
    if (fighting.length > 0 && (broken || timedOut)) {
      for (const e of fighting) {
        e.fleeing = true;
        e.path = [];
      }
      raid.outcome ??= broken ? 'repelled' : 'withdrew';
      sim.addLog(
        broken
          ? 'The raiders are fleeing!'
          : raid.arrivedTick === undefined
            ? 'The raiders turned back before reaching the colony.'
            : 'The raiders are giving up and leaving.',
        broken ? 'good' : 'info',
      );
    }
  }
  sim.enemies = sim.enemies.filter((e) => e.hp > 0);
  if (raid && sim.enemies.length === 0) {
    sim.raid = null;
    sim.rebuildAfterRaid();
    const standing = sim.living().filter((c) => !c.health.downed);
    // Every raider fell without the raid breaking first: that's a win too.
    const outcome = raid.outcome ?? (standing.length > 0 ? 'repelled' : 'overrun');
    if (outcome === 'withdrew') {
      sim.addLog('The raiders have gone. Colonists stand down.', 'info', true);
    } else if (outcome === 'repelled') {
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
      if (c.drafted && !sim.story.manhuntersActive) {
        sim.endJob(c);
        c.drafted = false;
      }
      c.focus = -1;
    }
  }
  sim.shots = sim.shots.filter((s) => sim.tick - s.tick < SHOT_LIFETIME);
}

// ---- Colonists fighting back ----

// One colonist attack at `target`; returns the damage dealt before armor (0 on a miss).
function colonistAttack(sim: Simulation, c: Colonist, target: number, weapon: WeaponDef): number {
  const ranged = weapon.range > 1;
  const hit =
    sim.rng.next() <
    hitChance(sim, weapon, c.skills.combat, c.tile, target, ranged ? (traitValue(c, 'accuracy') ?? 0) : 0);
  recordShot(sim, c.tile, target, hit, ranged);
  c.cooldown = weapon.cooldown;
  learn(sim, c, 'combat', COMBAT_XP);
  // A better-made weapon hits harder (0.7× for poor work up to 1.3× for a masterwork); fists are
  // just fists.
  const made = weapon === FISTS ? 1 : qualityFactor(c.weaponQuality);
  return hit ? roll(sim, weapon.damage) * made : 0;
}

function attackEnemy(sim: Simulation, c: Colonist, e: Enemy): void {
  const adjacent = chebyshev(sim.world, c.tile, e.tile) <= 1;
  const weapon = weaponAt(c.weapon, adjacent);
  const dealt = colonistAttack(sim, c, e.tile, weapon);
  // Shots landing close rattle whoever they're aimed at (and anyone beside them).
  if (weapon.range > 1) {
    for (const other of sim.enemies) {
      if (other.hp > 0 && chebyshev(sim.world, other.tile, e.tile) <= 1) {
        other.suppression = Math.min(1, other.suppression + (dealt > 0 && other === e ? SUPPRESS_HIT : SUPPRESS_MISS));
      }
    }
  }
  if (dealt > 0) {
    woundEnemy(sim, e, throughArmor(dealt, e.armor, weapon), c.name);
  }
}

// Hunting, or fending off an angry animal.
export function attackAnimal(sim: Simulation, c: Colonist, a: Animal): void {
  const adjacent = chebyshev(sim.world, c.tile, a.tile) <= 1;
  const dealt = colonistAttack(sim, c, a.tile, weaponAt(c.weapon, adjacent));
  if (dealt > 0) {
    hurtAnimal(sim, a, dealt, c);
  }
}

// Whether a colonist could attack `target` from where they stand.
export function canAttack(sim: Simulation, c: Colonist, target: number, range: number): boolean {
  const w = sim.world;
  return chebyshev(w, c.tile, target) <= 1 || (w.distance(c.tile, target) <= range && lineOfSight(w, c.tile, target));
}

// How far a colonist reaches with what they're carrying: their weapon's range when drafted,
// arm's length or a short bowshot when caught out undrafted.
export function reachOf(c: Colonist): number {
  const range = weaponDef(c.weapon).range;
  return c.drafted ? range : Math.min(range, SELF_DEFENCE_RANGE);
}

// The raider a colonist should shoot at: the one they were told to focus on if they can, else
// the best target in reach, favouring the wounded and the exposed.
export function colonistTarget(sim: Simulation, c: Colonist): Enemy | undefined {
  const w = sim.world;
  const range = reachOf(c);
  if (c.focus >= 0) {
    const focus = sim.enemies.find((e) => e.id === c.focus && e.hp > 0);
    if (focus && canAttack(sim, c, focus.tile, range)) {
      return focus;
    }
  }
  let best: Enemy | undefined;
  let bestScore = Infinity;
  for (const e of sim.enemies) {
    if (e.hp <= 0 || !canAttack(sim, c, e.tile, range)) {
      continue;
    }
    const score =
      w.distance(c.tile, e.tile) - (1 - e.hp) * 3 + (inCover(w, c.tile, e.tile) ? 2 : 0) - (e.fleeing ? -2 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

// Colonists shoot the best raider in reach (drafted ones from further away) and fight back in
// melee. Returns true if the colonist spent this tick fighting (and so shouldn't move or work).
export function colonistCombat(sim: Simulation, c: Colonist): boolean {
  c.cooldown--;
  const w = sim.world;
  const range = reachOf(c);
  // Animals that have turned on someone are fair game for anyone nearby.
  // Enraged animals: always fight back if it's after you or right next to you; otherwise only
  // step in when free (not drafted for a raid, asleep, in bed, or doctoring).
  const busy = c.sleeping || c.job?.type === 'rest' || c.job?.type === 'tend' || (c.drafted && sim.enemies.length > 0);
  const beast = sim.animals.find(
    (a) =>
      a.hp > 0 &&
      a.revengeOn >= 0 &&
      (a.lashOut ? a.revengeOn === c.id : a.revengeOn === c.id || chebyshev(w, c.tile, a.tile) <= 1 || !busy) &&
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
  const target = colonistTarget(sim, c);
  if (!target) {
    return false;
  }
  if (!c.drafted && c.job) {
    // Drop whatever we were doing (waking up if need be) to fight.
    sim.endJob(c);
  }
  if (c.cooldown <= 0) {
    attackEnemy(sim, c, target);
  }
  return true;
}

// Whether a colonist at `tile` is sheltered from the nearest raider who could see them.
export function coveredFrom(sim: Simulation, tile: number): boolean {
  const w = sim.world;
  return sim.enemies
    .filter((e) => e.hp > 0 && !e.fleeing && lineOfSight(w, e.tile, tile))
    .every((e) => inCover(w, e.tile, tile));
}

// A spot within a few steps where a drafted archer has cover from the raiders and still a clear
// shot at one of them; undefined if there's nothing better than where they stand.
export function coverSpot(sim: Simulation, c: Colonist): number | undefined {
  const w = sim.world;
  const range = weaponDef(c.weapon).range;
  const threats = sim.enemies.filter((e) => e.hp > 0 && !e.fleeing);
  const shot = (t: number) => threats.some((e) => w.distance(t, e.tile) <= range && lineOfSight(w, t, e.tile));
  // Already sheltered and with a shot: stay put.
  if (threats.length === 0 || (shot(c.tile) && coveredFrom(sim, c.tile))) {
    return undefined;
  }
  const region = sim.regionOf(c.tile);
  const steps = new Map<number, number>([[c.tile, 0]]);
  const queue = [c.tile];
  let best: number | undefined;
  let bestScore = Infinity;
  for (let q = 0; q < queue.length && q < 80; q++) {
    const t = queue[q];
    const s = steps.get(t)!;
    if (t !== c.tile) {
      if (shot(t) && coveredFrom(sim, t) && !sim.enemies.some((e) => chebyshev(w, e.tile, t) <= 1)) {
        if (s < bestScore) {
          bestScore = s;
          best = t;
        }
      }
    }
    if (s >= 4) {
      continue;
    }
    for (const n of w.neighbors(t)) {
      if (!steps.has(n) && w.isPassable(n) && sim.regionOf(n) === region) {
        steps.set(n, s + 1);
        queue.push(n);
      }
    }
  }
  return best;
}

// The colonist's armor's protection and speed penalty (none without armor).
export function armorOf(c: Colonist): { protection: number; speed: number } {
  return c.armor ? itemDef(c.armor.item).armor! : { protection: 0, speed: 1 };
}

// How well a weapon of this make suits a colonist: rough damage per tick, with reach counting
// for a lot (most of the colony's fighting is done from behind cover).
export function weaponScore(key: string, quality: number): number {
  const w = weaponDef(key);
  const perHit = ((w.damage[0] + w.damage[1]) / 2) * qualityFactor(quality) * w.accuracy * (1 + w.pierce * 0.3);
  return (perHit / w.cooldown) * (w.range > 1 ? 1 + w.range / 8 : 0.9);
}
