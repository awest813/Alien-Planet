import { hurtAnimal } from './animals';
import { scarAim } from './body';
import { beaconTile, transmitting } from './beacon';
import { qualityFactor } from './apparel';
import { MOVE_SPEED, TICKS_PER_HOUR } from './constants';
import { FACTIONS, NONE, NORMAL_QUALITY, WeaponDef, featureDef, featureId, itemDef, itemId, weaponDef } from './defs';
import { damage, painOf } from './health';
import { fallWounded } from './prisoners';
import { burnTime, ignite } from './weather';
import { learn } from './skills';
import { traitValue } from './social';
import type { Simulation } from './simulation';
import { Animal, Colonist, Enemy } from './types';
import { fightersHired } from './diplomacy';
import { ALLY_HELP, alliedWith, helperFaction } from './alliances';
import { goodwillOf } from './trade';
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
  // Fighters a friendly faction is sending to help, and when they'll come.
  alliesAt?: number;
  allies?: number;
  // A siege: the raiders make camp out of reach, dig in, and attack when they're ready.
  siege?: SiegeState;
  // They've had to tunnel through rock to get in (said once).
  sapped?: boolean;
  // Who was standing when it began (to tell a raid seen off with nobody lost or down).
  standing?: number[];
  // Thieves after the stores rather than a fight; what they got away with.
  thieves?: boolean;
  stolen?: number;
}

export interface SiegeState {
  // The camp's centre, and where each raider takes up their post around it.
  camp: number;
  posts: number[];
  // When they stop waiting and attack.
  attackAt: number;
  dugIn?: boolean;
  attacking?: boolean;
  // What they put up (taken down when the siege is over, so it never counts as the colony's).
  built?: number[];
}

// Raiders this close to a colonist have arrived; the raid's time limit runs from then.
const ARRIVAL_RANGE = 30;
// Combat experience per attack.
const COMBAT_XP = 40;
// Undrafted colonists shoot back at raiders this close; drafted ones use their weapon's range.
const SELF_DEFENCE_RANGE = 6;
// Raiders give up after this long at the colony, or once this share of them is out of the fight.
const RAID_TIMEOUT = TICKS_PER_HOUR * 24;
const MORALE_BREAK = 0.45;
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
const WOUNDED_FLEE = 0.6;
// Pain puts a raider down this badly hurt, as it does a colonist: they fall wounded rather than fight on.
const PAIN_DOWN = 0.3;
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

// Standing on something that gives cover (sandbags are passable).
const coverAt = (w: World, i: number) => w.feature[i] !== NONE && featureDef(w.feature[i]).cover < 1;
// How much less often a blow lands across (or from on top of) a barricade.
const MELEE_OVER_COVER = 0.6;

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
    // Fighting across a barricade, or clambering over one, is awkward going.
    const over = coverFactor(w, from, to) < 1 || coverAt(w, from) ? MELEE_OVER_COVER : 1;
    return Math.min(0.95, weapon.accuracy + (skill - 5) * 0.015 + bonus) * over;
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

export function spawnRaid(sim: Simulation, faction: number, count: number, siege = false, thieves = false): boolean {
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
      // Thieves travel light: a knife, no armour, quick on their feet.
      const armorItem = thieves ? undefined : raiderArmor(sim);
      sim.enemies.push({
        id: sim.nextEnemyId++,
        name,
        faction,
        tile: spots[n % spots.length],
        path: [],
        moveProgress: 0,
        hp: 1,
        weapon: thieves ? 'knife' : raiderWeapon(sim, faction),
        armor: armorItem !== undefined ? itemDef(armorItem).armor!.protection : 0,
        armorItem,
        skill,
        speed: def.speed * (thieves ? 1.2 : armorItem !== undefined ? itemDef(armorItem).armor!.speed : 1),
        suppression: 0,
        cooldown: 0,
        fleeing: false,
        repathAt: 0,
        ...(thieves ? { thief: true } : {}),
      });
    }
    sim.raid = {
      faction,
      initial: count,
      killed: 0,
      startedTick: sim.tick,
      standing: sim
        .living()
        .filter((c) => !c.health.downed)
        .map((c) => c.id),
      ...(thieves ? { thieves: true } : {}),
    };
    // The signal draws them; while it's on the air a third of them go straight for the beacon.
    const wreckers = !siege && !thieves && transmitting(sim) ? Math.ceil(count / 3) : 0;
    for (const e of sim.enemies.slice(-count).slice(0, wreckers)) {
      e.wrecker = true;
    }
    // From the second year, against a colony behind wooden walls, some bring fire.
    const firebrands =
      !thieves && sim.day >= FIREBRANDS_FROM_DAY && woodenDefences(sim) ? Math.min(2, Math.floor(count / 4)) : 0;
    for (const e of sim.enemies.slice(-count).slice(wreckers, wreckers + firebrands)) {
      e.firebrand = true;
    }
    if (thieves) {
      sim.addLog(
        `Thieves! ${count} from ${def.name} are slipping in from the ${side} to rob the stores. Draft colonists to catch them.`,
        'danger',
        true,
      );
      sim.events.push('raid');
      return true;
    }
    if (siege && setupSiege(sim, centre)) {
      const hours = Math.round((sim.raid.siege!.attackAt - sim.tick) / TICKS_PER_HOUR);
      sim.addLog(
        `Siege! ${count} raiders from ${def.name} are coming from the ${side} to make camp. They'll dig in and attack in about ${hours} hours: break the camp first, or fortify and wait.`,
        'danger',
        true,
      );
      sim.events.push('raid');
      return true;
    }
    sim.addLog(
      `Raid! ${count} raiders from ${def.name} are coming from the ${side}. ${wreckers > 0 ? `${wreckers === 1 ? 'One is' : `${wreckers} are`} making for the beacon. ` : ''}${firebrands > 0 ? `${firebrands === 1 ? 'One carries' : 'Two carry'} fire for the wooden walls. ` : ''}Draft your colonists.`,
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
    e.breachTarget = breachWall(sim, region, goalRegion, goal.tile, e.breachTarget);
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
      if (w.damage[wall] >= toughness(sim, wall)) {
        const feature = w.feature[wall];
        w.setFeature(wall, NONE);
        w.addFilth(wall, Filth.RUBBLE, 2);
        if (def.natural) {
          // Sappers: once a raid, word that they're tunnelling in.
          if (sim.raid && !sim.raid.sapped) {
            sim.raid.sapped = true;
            sim.addLog('Raiders are digging through the rock to get at the colony!', 'danger');
          }
        } else {
          sim.rebuild(wall, feature);
          sim.addLog(`Raiders broke through a ${def.name.toLowerCase()}!`, 'danger');
        }
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

// Walls and doors; and, for raiders with no other way in, the rock itself (sappers dig, slowly: rock takes as
// many blows as it takes a miner's work).
// (Built: walls and doors, and the fences and troughs that pen ground in; not stoves, benches or sculptures.)
const breakable = (w: World, i: number) => {
  if (w.feature[i] === NONE) {
    return false;
  }
  const def = featureDef(w.feature[i]);
  return def.build ? w.blocksRoom(i) || def.key === 'fence' || !!def.feeds : diggable(w, i);
};
const diggable = (w: World, i: number) => {
  const def = featureDef(w.feature[i]);
  return !!def.natural && def.harvest?.work === 'mine' && w.blocksRoom(i);
};
const toughness = (sim: Simulation, i: number) => {
  const def = featureDef(sim.world.feature[i]);
  // Reinforced (research): built walls and doors take twice the blows.
  return def.build ? def.build.work * (sim.isResearched('reinforcedWalls') ? 2 : 1) : (def.harvest?.amount ?? 100);
};
// Digging is the last resort: a wall a little further off is still the better way in.
const ROCK_DETOUR = 12;
const SAP_REACH = 24;

// The wall to break: one the raider can stand next to that opens straight into the colonists'
// side, nearest them; failing that (thick or doubled walls), the wall on this side nearest them.
function breachWall(
  sim: Simulation,
  region: number,
  goalRegion: number,
  goalTile: number,
  current?: number,
): number | undefined {
  const w = sim.world;
  let best: number | undefined;
  let bestScore = Infinity;
  // Rock worth digging: joined to the colonists' side through rock, near them. (Digging a face that only
  // leads into more of the hillside wastes the whole raid.)
  const leadsIn = new Uint8Array(w.size);
  const queue = [goalTile];
  leadsIn[goalTile] = 1;
  for (let q = 0; q < queue.length; q++) {
    for (const n of w.neighbors(queue[q], false)) {
      if (
        !leadsIn[n] &&
        w.distance(n, goalTile) <= SAP_REACH &&
        ((w.isPassable(n) && sim.regionOf(n) === goalRegion) || breakable(w, n))
      ) {
        leadsIn[n] = 1;
        queue.push(n);
      }
    }
  }
  for (let i = 0; i < w.size; i++) {
    if (!breakable(w, i) || (featureDef(w.feature[i]).natural && !leadsIn[i])) {
      continue;
    }
    const sides = w.neighbors(i, false);
    if (!sides.some((n) => w.isPassable(n) && sim.regionOf(n) === region)) {
      continue;
    }
    const opens = sides.some((n) => w.isPassable(n) && sim.regionOf(n) === goalRegion);
    // Half-broken already: keep at it unless another is clearly better (thick rock or doubled walls have
    // many equally good faces, and wandering between them breaks none).
    const score =
      w.distance(i, goalTile) +
      (opens ? 0 : 1000) +
      (featureDef(w.feature[i]).natural ? ROCK_DETOUR : 0) -
      (i === current ? 3 : 0);
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
  if (e.hp > PAIN_DOWN) {
    return;
  }
  // Too hurt to stand: down in pain (and lying wounded), or, struck hard enough, dead or near it.
  const inPain = e.hp > 0;
  e.hp = 0;
  sim.stats.kills++;
  if (sim.raid) {
    sim.raid.killed++;
  }
  const wounded = fallWounded(sim, e, inPain);
  sim.addLog(
    wounded
      ? `${by} brought down ${e.name}, who lies wounded: mark them with Capture to take them prisoner.`
      : `${by} brought down ${e.name}.`,
    'good',
  );
  const w = sim.world;
  if (e.thief) {
    sim.stats.thievesCaught = (sim.stats.thievesCaught ?? 0) + 1;
  }
  // A thief brought down drops what they took.
  if (e.loot) {
    w.dropItemNear(e.tile, e.loot.item, e.loot.count);
    e.loot = undefined;
  }
  const weapon = weaponDef(e.weapon);
  // Some of a fallen raider's gear survives the fight.
  if (weapon.item !== undefined && sim.rng.next() < 0.6) {
    w.dropItemNear(e.tile, weapon.item, 1, undefined, sim.rng.int(NORMAL_QUALITY - 4, NORMAL_QUALITY + 2));
  }
  if (e.armorItem !== undefined && sim.rng.next() < 0.5) {
    w.dropItemNear(e.tile, e.armorItem, 1, 0.3 + sim.rng.next() * 0.4, NORMAL_QUALITY - 2);
  }
}

function moveEnemy(sim: Simulation, e: Enemy, ally = false): void {
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
    // (The colony's allies know where its traps are.)
    if (!ally) {
      springTrap(sim, e);
    }
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
  const barbs = sim.isResearched('barbedTraps') ? 1.5 : 1;
  woundEnemy(sim, e, (0.3 + sim.rng.next() * 0.15) * (1 - e.armor * 0.5) * barbs, 'A spike trap');
  e.suppression = 1;
}

function flee(sim: Simulation, e: Enemy, ally = false): void {
  const w = sim.world;
  const x = w.xOf(e.tile);
  const y = w.yOf(e.tile);
  if (x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1) {
    e.hp = 0;
    e.fleeing = true;
    if (e.loot) {
      const value = itemDef(e.loot.item).value * e.loot.count;
      if (sim.raid) {
        sim.raid.stolen = (sim.raid.stolen ?? 0) + value;
      }
      sim.stats.stolen = (sim.stats.stolen ?? 0) + value;
      sim.addLog(`${e.name} got away with ${e.loot.count} ${itemDef(e.loot.item).name.toLowerCase()}.`, 'danger');
      e.loot = undefined;
    }
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
      // Nowhere to run: vanish rather than linger forever (a thief leaving what they took).
      if (e.loot) {
        sim.world.dropItemNear(e.tile, e.loot.item, e.loot.count);
        e.loot = undefined;
      }
      e.hp = 0;
      return;
    }
  }
  moveEnemy(sim, e, ally);
}

const BEACON_FRAGILE = 4;

const FIREBRANDS_FROM_DAY = 40;
const THROW_RANGE = 4;
// Whether the colony has wooden walls or doors a firebrand could set alight.
function woodenDefences(sim: Simulation): boolean {
  const w = sim.world;
  for (const i of w.tilesWith('features')) {
    const def = featureDef(w.feature[i]);
    if (def.build && w.blocksRoom(i) && burnTime(sim, i) > 0) {
      return true;
    }
  }
  return false;
}

// A firebrand within throwing range of a wooden building sets it alight (then waits a while before the next).
// It's their own turn otherwise: they still fight.
function throwFire(sim: Simulation, e: Enemy): void {
  if ((e.throwAt ?? 0) > sim.tick) {
    return;
  }
  const w = sim.world;
  const x0 = w.xOf(e.tile);
  const y0 = w.yOf(e.tile);
  for (let dy = -THROW_RANGE; dy <= THROW_RANGE; dy++) {
    for (let dx = -THROW_RANGE; dx <= THROW_RANGE; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (!w.inBounds(x, y)) {
        continue;
      }
      const i = w.idx(x, y);
      // (Only what they can see to throw at: not through a wall into the room behind it.)
      // (At the walls and doors: what keeps the colony out, and warm.)
      if (
        w.feature[i] !== NONE &&
        featureDef(w.feature[i]).build &&
        w.blocksRoom(i) &&
        burnTime(sim, i) > 0 &&
        lineOfSight(w, e.tile, i) &&
        ignite(sim, i)
      ) {
        // One firebrand each: a whole hut burning down in midwinter while everyone fights froze colonies.
        e.throwAt = Number.MAX_SAFE_INTEGER;
        sim.addLog(`${e.name} set the ${featureDef(w.feature[i]).name.toLowerCase()} alight!`, 'danger');
        sim.events.push('fire');
        return;
      }
    }
  }
  // Nothing in reach: look again in a little while.
  e.throwAt = sim.tick + 20;
}

// A wrecker makes for the signal beacon and batters it down (it goes back on the build list). Returns false
// once there's no beacon to get at; then they fight like any raider.
function wreckBeacon(sim: Simulation, e: Enemy): boolean {
  const w = sim.world;
  const beacon = beaconTile(sim);
  if (beacon === undefined) {
    e.wrecker = false;
    return false;
  }
  const region = sim.regionOf(e.tile);
  if (chebyshev(w, e.tile, beacon) <= 1) {
    e.path = [];
    e.moveProgress = 0;
    if (e.cooldown <= 0) {
      e.cooldown = weaponDef(e.weapon).cooldown;
      // Delicate work, quickly undone.
      w.damage[beacon] += (weaponDef(e.weapon).range > 1 ? 8 : 14) * BEACON_FRAGILE;
      if (w.damage[beacon] >= toughness(sim, beacon)) {
        const feature = w.feature[beacon];
        w.setFeature(beacon, NONE);
        w.addFilth(beacon, Filth.RUBBLE, 2);
        sim.rebuild(beacon, feature);
        sim.addLog(
          'Raiders wrecked the signal beacon! It has to be built again before it can transmit.',
          'danger',
          true,
        );
      }
    }
    return true;
  }
  if (e.path.length === 0 || e.repathAt <= sim.tick) {
    e.repathAt = sim.tick + 200;
    const spots = w.neighbors(beacon).filter((n) => w.isPassable(n) && sim.regionOf(n) === region);
    e.path = spots.length > 0 ? (sim.pathfinder.find(e.tile, spots) ?? []) : [];
    if (e.path.length === 0) {
      // Walled off from it: get at the colony instead.
      e.wrecker = false;
      return false;
    }
  }
  moveEnemy(sim, e);
  return true;
}

// A thief makes for the richest stack in the stores they can reach, grabs what they can carry and runs. Returns
// false when there's nothing to steal (they then fight their way out like any raider).
const THIEF_CARRIES = 150;
function thiefTurn(sim: Simulation, e: Enemy): boolean {
  const w = sim.world;
  if (e.loot) {
    e.fleeing = true;
    e.path = [];
    return true;
  }
  if (e.stealFrom !== undefined && e.tile === e.stealFrom && w.itemType[e.tile] !== NONE) {
    const item = w.itemType[e.tile];
    const count = w.takeItem(e.tile, Math.max(1, Math.floor(THIEF_CARRIES / itemDef(item).value)));
    e.loot = { item, count };
    e.fleeing = true;
    e.path = [];
    sim.addLog(`${e.name} grabbed ${count} ${itemDef(item).name.toLowerCase()} and is running for it!`, 'danger');
    return true;
  }
  if (e.stealFrom === undefined || w.itemType[e.stealFrom] === NONE || e.path.length === 0) {
    const region = sim.regionOf(e.tile);
    let best: number | undefined;
    let bestScore = 0;
    for (const i of w.tilesWith('items')) {
      if (!sim.isStockpile(i) || sim.regionOf(i) !== region) {
        continue;
      }
      const def = itemDef(w.itemType[i]);
      const score =
        (def.value * Math.min(w.itemCount[i], THIEF_CARRIES / def.value)) / (1 + w.distance(e.tile, i) / 40);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    e.stealFrom = best;
    e.path = best !== undefined ? (sim.pathfinder.find(e.tile, [best]) ?? []) : [];
    if (best === undefined || (e.path.length === 0 && e.tile !== best)) {
      e.stealFrom = undefined;
      return false;
    }
  }
  if (e.path.length > 0) {
    moveEnemy(sim, e);
  }
  return true;
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
    if (strikeAlly(sim, e)) {
      continue;
    }
    // A siege party keeps to its camp until it's ready.
    const siege = besieging(sim);
    if (siege && siegeTurn(sim, e, siege)) {
      continue;
    }
    if (e.thief && thiefTurn(sim, e)) {
      continue;
    }
    if (e.wrecker && wreckBeacon(sim, e)) {
      continue;
    }
    if (e.firebrand && !e.fleeing) {
      throwFire(sim, e);
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

  updateAllies(sim);
  const raid = sim.raid;
  if (raid) {
    updateSiege(sim, raid);
    const fighting = sim.enemies.filter((e) => e.hp > 0 && !e.fleeing);
    if (
      raid.arrivedTick === undefined &&
      // (A siege party waiting in its camp hasn't arrived yet, however close the camp.)
      !besieging(sim) &&
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
    // Broken once most of them are down or running. (A thief running off with the goods hasn't been beaten:
    // they count as still in it, or one getting away would send the rest home empty-handed.)
    const away = raid.thieves ? sim.enemies.filter((e) => e.hp > 0 && e.loot).length : 0;
    const broken = fighting.length + away <= raid.initial * (1 - MORALE_BREAK);
    if (fighting.length > 0 && (broken || timedOut)) {
      for (const e of fighting) {
        e.fleeing = true;
        e.path = [];
      }
      raid.outcome ??= broken ? 'repelled' : 'withdrew';
      sim.addLog(
        broken
          ? raid.thieves
            ? 'The thieves are running for it!'
            : 'The raiders are fleeing!'
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
    takeDownCamp(sim, raid);
    sim.rebuildAfterRaid();
    const standing = sim.living().filter((c) => !c.health.downed);
    // Every raider fell without the raid breaking first: that's a win too.
    const outcome = raid.outcome ?? (standing.length > 0 ? 'repelled' : 'overrun');
    if (raid.siege && outcome !== 'overrun') {
      sim.stats.siegesSeenOff = (sim.stats.siegesSeenOff ?? 0) + 1;
    }
    if (raid.thieves) {
      sim.addLog(
        raid.stolen
          ? `The thieves have gone, with about ${raid.stolen} silver's worth from the stores. Colonists stand down.`
          : 'The thieves have gone empty-handed. Colonists stand down.',
        raid.stolen ? 'warn' : 'good',
        true,
      );
    } else if (outcome === 'withdrew') {
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
      // (Everyone who was here still on their feet: nobody downed, and nobody killed outright.)
      if (
        raid.standing !== undefined &&
        raid.standing.every((id) => !sim.colonists[id]?.health.dead && !sim.colonists[id]?.health.downed)
      ) {
        sim.stats.cleanDefences = (sim.stats.cleanDefences ?? 0) + 1;
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

// Tactics (research): a little better aim for every colonist.
const TACTICS_AIM = 0.08;

// One colonist attack at `target`; returns the damage dealt before armor (0 on a miss).
function colonistAttack(sim: Simulation, c: Colonist, target: number, weapon: WeaponDef): number {
  const ranged = weapon.range > 1;
  const hit =
    sim.rng.next() <
    hitChance(
      sim,
      weapon,
      c.skills.combat,
      c.tile,
      target,
      ranged
        ? (traitValue(c, 'accuracy') ?? 0) +
            scarAim(c, sim.isResearched('prosthetics')) +
            (sim.isResearched('tactics') ? TACTICS_AIM : 0)
        : 0,
    );
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

// ---- Allies ----
// Now and then, when raiders come, the friendly faction sends a few fighters to help: the better they
// think of the colony, the likelier. They come in from the edge nearest the colony an hour or few into the
// raid, go after the raiders, and head home once the raiders are beaten or gone.

// Chance of help with each raid: none below 30 goodwill, rising to one in two at 100.
export const allyChance = (goodwill: number): number => Math.max(0, Math.min(0.5, (goodwill - 30) / 140));
const ALLY_WEAPONS = ['recurveBow', 'recurveBow', 'shortBow', 'spear'];
// "The Meadow Kin" in the middle of a sentence.
const kinName = (faction: number) => FACTIONS[faction].name.replace(/^The /, 'the ');
const ALLY_SKILL = 5;

// Called as a raid starts: whether help is on its way (decided now, so a save mid-raid keeps it).
export function maybeSendAllies(sim: Simulation): void {
  const raid = sim.raid;
  // (An ally's fighters, if the colony has one and hasn't hired the Meadow Kin's.)
  const friend = helperFaction(sim);
  if (!raid || friend < 0) {
    return;
  }
  // Against a siege they come for the attack, not to storm the camp alone.
  const from = raid.siege && !raid.siege.attacking ? Math.max(sim.tick, raid.siege.attackAt) : sim.tick;
  // Hired, they come for sure, within the hour, and in strength.
  if (fightersHired(sim)) {
    raid.allies = Math.max(3, Math.min(5, Math.round(raid.initial / 2)));
    raid.alliesAt = from + TICKS_PER_HOUR;
    return;
  }
  if (sim.rng.next() >= allyChance(goodwillOf(sim, friend)) + (alliedWith(sim, friend) ? ALLY_HELP : 0)) {
    return;
  }
  raid.allies = Math.max(2, Math.min(4, Math.round(raid.initial / 3)));
  raid.alliesAt = from + sim.rng.int(1, 3) * TICKS_PER_HOUR;
}

function alliesArrive(sim: Simulation, count: number): void {
  const w = sim.world;
  const friend = helperFaction(sim);
  const region = sim.outsideRegion();
  const home = sim.homeTile() ?? sim.living()[0]?.tile;
  if (region === undefined || home === undefined) {
    return;
  }
  // From the edge nearest the colony.
  const onEdge = (i: number) => {
    const x = w.xOf(i);
    const y = w.yOf(i);
    return (x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1) && sim.regionOf(i) === region;
  };
  const spots = sim.nearest(home, onEdge, count);
  if (spots.length === 0) {
    return;
  }
  const names = [...FACTIONS[friend].names];
  for (let n = 0; n < count; n++) {
    const name = names.length > 0 ? names.splice(sim.rng.int(0, names.length - 1), 1)[0] : 'Kin fighter';
    sim.allies.push({
      id: sim.nextEnemyId++,
      name,
      faction: friend,
      tile: spots[n % spots.length],
      path: [],
      moveProgress: 0,
      hp: 1,
      weapon: sim.rng.pick(ALLY_WEAPONS),
      armor: 0,
      skill: ALLY_SKILL,
      speed: 1,
      suppression: 0,
      cooldown: 0,
      fleeing: false,
      repathAt: 0,
    });
  }
  sim.stats.alliesCame = (sim.stats.alliesCame ?? 0) + 1;
  sim.addLog(`${FACTIONS[friend].name} have sent ${count} fighters to help drive off the raiders!`, 'good', true);
}

// The nearest raider still fighting, in reach of this ally's region.
function allyTarget(sim: Simulation, a: Enemy): Enemy | undefined {
  const w = sim.world;
  const region = sim.regionOf(a.tile);
  let best: Enemy | undefined;
  let bestDistance = Infinity;
  for (const e of sim.enemies) {
    if (e.hp <= 0 || e.fleeing || sim.regionOf(e.tile) !== region) {
      continue;
    }
    const d = w.distance(a.tile, e.tile);
    if (d < bestDistance) {
      bestDistance = d;
      best = e;
    }
  }
  return best;
}

// Called every tick, alongside the raiders.
export function updateAllies(sim: Simulation): void {
  const w = sim.world;
  const raid = sim.raid;
  if (raid?.alliesAt !== undefined && sim.tick >= raid.alliesAt) {
    const count = raid.allies ?? 0;
    raid.alliesAt = undefined;
    // Not if the raid is already over, or every raider's already running.
    if (count > 0 && !raid.outcome && sim.enemies.some((e) => e.hp > 0 && !e.fleeing)) {
      alliesArrive(sim, count);
    }
  }
  if (sim.allies.length === 0) {
    return;
  }
  for (const a of sim.allies) {
    if (a.hp <= 0) {
      continue;
    }
    a.cooldown--;
    a.suppression = Math.max(0, a.suppression - SUPPRESS_DECAY);
    const target = a.fleeing ? undefined : allyTarget(sim, a);
    if (!target) {
      // The fight's over (or out of reach): home they go, by the nearest way out.
      if (!a.fleeing) {
        a.fleeing = true;
        a.path = [];
        a.moveProgress = 0;
      }
      flee(sim, a, true);
      continue;
    }
    const adjacent = chebyshev(w, a.tile, target.tile) <= 1;
    const weapon = weaponAt(a.weapon, adjacent);
    const canShoot =
      weapon.range > 1 && w.distance(a.tile, target.tile) <= weapon.range && lineOfSight(w, a.tile, target.tile);
    if (adjacent || canShoot) {
      a.path = [];
      a.moveProgress = 0;
      if (a.cooldown <= 0) {
        const hit = sim.rng.next() < hitChance(sim, weapon, a.skill, a.tile, target.tile, 0, a.suppression);
        recordShot(sim, a.tile, target.tile, hit, weapon.range > 1);
        if (hit) {
          woundEnemy(sim, target, throughArmor(roll(sim, weapon.damage), target.armor, weapon), a.name);
        } else if (weapon.range > 1) {
          target.suppression = Math.min(1, target.suppression + SUPPRESS_MISS);
        }
        a.cooldown = weapon.cooldown;
      }
      continue;
    }
    if (a.path.length === 0 || a.repathAt <= sim.tick) {
      a.repathAt = sim.tick + 30;
      a.path =
        sim.pathfinder.find(a.tile, [target.tile, ...w.neighbors(target.tile).filter((n) => w.isPassable(n))]) ?? [];
    }
    if (a.path.length > 0) {
      moveEnemy(sim, a, true);
    }
  }
  // (Those who walked off the map left fleeing; those struck down didn't.)
  const walkedHome = sim.allies.find((a) => a.hp <= 0 && a.fleeing);
  sim.allies = sim.allies.filter((a) => a.hp > 0);
  if (walkedHome && sim.allies.length === 0) {
    sim.addLog(`The fighters from ${kinName(walkedHome.faction)} have gone home.`, 'info');
  }
}

// A raider with an ally within reach (beside them, or in a bow's range and sight when no colonist is
// closer) fights them rather than walking past. Returns whether they did.
function strikeAlly(sim: Simulation, e: Enemy): boolean {
  if (sim.allies.length === 0) {
    return false;
  }
  const w = sim.world;
  const weapon = weaponDef(e.weapon);
  let ally: Enemy | undefined;
  let near = Infinity;
  for (const a of sim.allies) {
    if (a.hp <= 0 || a.fleeing) {
      continue;
    }
    const d = w.distance(e.tile, a.tile);
    const reach =
      chebyshev(w, e.tile, a.tile) <= 1 || (weapon.range > 1 && d <= weapon.range && lineOfSight(w, e.tile, a.tile));
    if (reach && d < near) {
      near = d;
      ally = a;
    }
  }
  if (!ally) {
    return false;
  }
  const colonistCloser = sim
    .living()
    .some((c) => !c.health.downed && w.distance(e.tile, c.tile) < near && lineOfSight(w, e.tile, c.tile));
  if (colonistCloser && chebyshev(w, e.tile, ally.tile) > 1) {
    return false;
  }
  // Between blows they stand their ground rather than wander off after a colonist.
  if (e.cooldown > 0) {
    e.path = [];
    e.moveProgress = 0;
    return true;
  }
  const used = weaponAt(e.weapon, chebyshev(w, e.tile, ally.tile) <= 1);
  e.path = [];
  e.moveProgress = 0;
  const hit = sim.rng.next() < hitChance(sim, used, e.skill, e.tile, ally.tile, RAIDER_AIM, e.suppression);
  recordShot(sim, e.tile, ally.tile, hit, used.range > 1);
  if (hit) {
    ally.hp -= roll(sim, used.damage) * RAIDER_HIT;
    if (ally.hp <= PAIN_DOWN) {
      // Their own carry them home; they're out of this fight.
      ally.hp = 0;
      sim.addLog(`${ally.name} of ${kinName(ally.faction)} has been struck down fighting for the colony.`, 'warn');
    }
  }
  e.cooldown = used.cooldown;
  return true;
}

// ---- Sieges ----
// Instead of walking straight in, a siege party makes camp a little way from the colony, digs in behind
// sandbags round a fire, and shoots at anyone who comes within reach. Half a day or so later they attack as
// a raid would. Going out to break the camp means attacking raiders behind cover; waiting means facing all of
// them at once.

// How far from the colony they camp, and how long they wait.
const CAMP_DISTANCE: [number, number] = [20, 28];
const SIEGE_HOURS: [number, number] = [10, 20];
// Sandbags they put up round the camp, on the side facing the colony.
const CAMP_SANDBAGS = 6;
// A melee raider at camp charges anyone who comes this close.
const CAMP_CHARGE = 4;

// Picks the camp (between the raiders' edge and the colony) and their posts. False if there's nowhere.
function setupSiege(sim: Simulation, from: number): boolean {
  const w = sim.world;
  const raid = sim.raid!;
  const home = sim.homeTile() ?? sim.living()[0]?.tile;
  const region = sim.regionOf(from);
  if (home === undefined) {
    return false;
  }
  // Clear of anything the colony has built (six tiles round each building), its zones, floors and rooms.
  const near = new Uint8Array(w.size);
  for (const f of w.tilesWith('features')) {
    if (featureDef(w.feature[f]).natural || featureDef(w.feature[f]).crop) {
      continue;
    }
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const x = w.xOf(f) + dx;
        const y = w.yOf(f) + dy;
        if (w.inBounds(x, y)) {
          near[w.idx(x, y)] = 1;
        }
      }
    }
  }
  const open = (i: number) =>
    w.isPassable(i) &&
    w.feature[i] === NONE &&
    w.blueprint[i] === NONE &&
    w.zone[i] === 0 &&
    w.floor[i] === NONE &&
    near[i] === 0 &&
    !w.tilesWith('items').has(i) &&
    !sim.isIndoors(i) &&
    sim.regionOf(i) === region;
  const pick = ([lo, hi]: [number, number]) =>
    sim.nearest(from, (i) => open(i) && w.distance(i, home) >= lo && w.distance(i, home) <= hi, 1)[0];
  const camp = pick(CAMP_DISTANCE) ?? pick([14, 34]);
  if (camp === undefined) {
    return false;
  }
  // Round the fire (the camp's centre is the fire itself).
  const posts = sim.nearest(camp, (i) => i !== camp && open(i) && chebyshev(w, i, camp) <= 1, raid.initial);
  if (posts.length === 0) {
    return false;
  }
  raid.siege = {
    camp,
    posts,
    attackAt: sim.tick + sim.rng.int(SIEGE_HOURS[0], SIEGE_HOURS[1]) * TICKS_PER_HOUR,
  };
  return true;
}

// The first to reach camp sets it up: a fire in the middle, sandbags on the side facing the colony.
function digIn(sim: Simulation, siege: SiegeState): void {
  const w = sim.world;
  siege.dugIn = true;
  const home = sim.homeTile() ?? siege.camp;
  const ring = sim
    .nearest(
      siege.camp,
      (i) =>
        chebyshev(w, i, siege.camp) === 2 &&
        w.isPassable(i) &&
        w.feature[i] === NONE &&
        w.blueprint[i] === NONE &&
        !w.tilesWith('items').has(i) &&
        w.distance(i, home) < w.distance(siege.camp, home),
      16,
    )
    .sort((a, b) => w.distance(a, home) - w.distance(b, home))
    .slice(0, CAMP_SANDBAGS);
  siege.built = [];
  for (const i of ring) {
    w.setFeature(i, featureId('sandbags'));
    siege.built.push(i);
  }
  // (Not on anything dropped there since, or anyone standing in it.)
  const occupied =
    w.tilesWith('items').has(siege.camp) ||
    sim.enemies.some((e) => e.hp > 0 && e.tile === siege.camp) ||
    sim.living().some((c) => c.tile === siege.camp);
  if (w.feature[siege.camp] === NONE && !occupied) {
    w.setFeature(siege.camp, featureId('campfire'));
    w.fuel[siege.camp] = 10;
    sim.fuelVersion++;
    siege.built.push(siege.camp);
  }
  sim.addLog('The siege party has made camp and dug in behind sandbags.', 'warn');
}

// A raider's turn while the siege waits: to their post, dig in, and shoot anyone in reach. Returns false to
// fight as usual (a melee raider with a colonist close by).
function siegeTurn(sim: Simulation, e: Enemy, siege: SiegeState): boolean {
  const w = sim.world;
  const weapon = weaponDef(e.weapon);
  const colonists = sim.living().filter((c) => !c.health.downed && sim.regionOf(c.tile) === sim.regionOf(e.tile));
  if (weapon.range <= 1 && colonists.some((c) => chebyshev(w, c.tile, e.tile) <= CAMP_CHARGE)) {
    return false;
  }
  // At camp once within two tiles of the fire (or as close as they can get).
  const post = siege.posts[e.id % siege.posts.length];
  if (chebyshev(w, e.tile, siege.camp) > 2) {
    if (e.path.length === 0 || e.repathAt <= sim.tick) {
      e.repathAt = sim.tick + 60;
      e.path = sim.pathfinder.find(e.tile, [post, ...w.neighbors(post).filter((n) => w.isPassable(n))]) ?? [];
    }
    if (e.path.length > 0) {
      moveEnemy(sim, e);
      return true;
    }
  }
  e.path = [];
  e.moveProgress = 0;
  if (!siege.dugIn) {
    digIn(sim, siege);
  }
  if (weapon.range > 1 && e.cooldown <= 0) {
    const target = colonists
      .filter((c) => w.distance(e.tile, c.tile) <= weapon.range && lineOfSight(w, e.tile, c.tile))
      .sort((a, b) => w.distance(e.tile, a.tile) - w.distance(e.tile, b.tile))[0];
    if (target) {
      enemyAttack(sim, e, target);
    }
  }
  return true;
}

// Called every tick with a raid on: once the wait is over, the siege becomes an attack.
function updateSiege(sim: Simulation, raid: RaidState): void {
  const siege = raid.siege;
  if (!siege || siege.attacking || sim.tick < siege.attackAt) {
    return;
  }
  siege.attacking = true;
  if (sim.enemies.some((e) => e.hp > 0 && !e.fleeing)) {
    raid.arrivedTick = sim.tick;
    sim.addLog('The siege party is breaking camp and attacking! Draft your colonists.', 'danger', true);
    sim.events.push('raidNear');
  }
}

// When the siege is over, its camp goes with it (it was never the colony's).
function takeDownCamp(sim: Simulation, raid: RaidState): void {
  const w = sim.world;
  for (const i of raid.siege?.built ?? []) {
    const f = w.feature[i];
    if (f === featureId('sandbags') || f === featureId('campfire')) {
      w.setFeature(i, NONE);
      w.fuel[i] = 0;
    }
  }
  if (raid.siege?.built?.length) {
    sim.fuelVersion++;
  }
}

// Whether the raiders are still waiting in their camp.
export const besieging = (sim: Simulation): SiegeState | undefined =>
  sim.raid?.siege && !sim.raid.siege.attacking ? sim.raid.siege : undefined;
