import { MAP_SIZE, MOVE_SPEED, TICKS_PER_HOUR } from './constants';
import { ANIMALS, itemDef, itemId } from './defs';
import { armorTakes, woundEnemy } from './combat';
import { damage } from './health';
import type { Season } from './seasons';
import type { Simulation } from './simulation';
import { Animal, Colonist } from './types';
import { Filth } from './world';
import { MUSTER_ALERT, animalTilesPerTick, musterTicks, walkTicks } from './arrivals';
import { beastLeaves, beastSlain } from './beast';
import { animalWeight } from './biomes';
import { changeGoodwill, friendly, onGoodTerms } from './diplomacy';
import { animalMayEnter, feedPenned, gateFilter, penAt, penFor, penTarget } from './pens';

// Wild animals on the standard 64×64 map; bigger maps hold proportionally more.
export const MAX_ANIMALS = 14;

export const wildCap = (sim: Simulation) => Math.round((MAX_ANIMALS * sim.world.size) / (MAP_SIZE * MAP_SIZE));
const BITE_COOLDOWN = 50;
const WANDER_RADIUS = 6;
// An enraged animal calms down after this long.
const REVENGE_TICKS = TICKS_PER_HOUR * 2;

const onEdge = (sim: Simulation, i: number) => {
  const w = sim.world;
  return w.xOf(i) === 0 || w.yOf(i) === 0 || w.xOf(i) === w.width - 1 || w.yOf(i) === w.height - 1;
};

const chebyshev = (sim: Simulation, a: number, b: number) =>
  Math.max(Math.abs(sim.world.xOf(a) - sim.world.xOf(b)), Math.abs(sim.world.yOf(a) - sim.world.yOf(b)));

function pickKind(sim: Simulation, allow: (key: string) => boolean = () => true): string {
  // Creatures of the deep (weight 0) never wander in from outside, and each land has its own mix.
  const weight = (key: string) => animalWeight(sim.biome, key, ANIMALS[key].weight);
  const kinds = Object.values(ANIMALS).filter((a) => weight(a.key) > 0 && allow(a.key));
  if (kinds.length === 0) {
    return 'hare';
  }
  let roll = sim.rng.next() * kinds.reduce((sum, a) => sum + weight(a.key), 0);
  for (const a of kinds) {
    roll -= weight(a.key);
    if (roll <= 0) {
      return a.key;
    }
  }
  return kinds[0].key;
}

function addAnimal(sim: Simulation, tile: number, kind = pickKind(sim)): Animal {
  const animal: Animal = {
    id: sim.nextAnimalId++,
    kind,
    tile,
    path: [],
    moveProgress: 0,
    hp: ANIMALS[kind].hp,
    hunted: false,
    taming: false,
    tame: false,
    revengeOn: -1,
    cooldown: 0,
    restUntil: 0,
    revengeUntil: 0,
  };
  if (ANIMALS[kind].preys) {
    animal.fedUntil = sim.tick;
  }
  sim.animals.push(animal);
  return animal;
}

// Scatters wildlife over walkable ground away from `avoid` (the landing site).
export function populateWildlife(sim: Simulation, count: number, avoid: number): void {
  const w = sim.world;
  for (let attempt = 0; attempt < count * 20 && sim.animals.length < count; attempt++) {
    const tile = sim.rng.int(0, w.size - 1);
    if (w.isPassable(tile) && w.distance(tile, avoid) > 12 && sim.regionOf(tile) === sim.regionOf(avoid)) {
      addAnimal(sim, tile);
    }
  }
}

// A small herd wanders in from the map edge (only grazers, if asked). Returns how many arrived.
export function herdArrives(sim: Simulation, grazersOnly = false): number {
  const region = sim.outsideRegion();
  if (region === undefined || wildCount(sim) >= wildCap(sim)) {
    return 0;
  }
  const w = sim.world;
  const edge = sim.nearest(
    w.idx(sim.rng.int(0, w.width - 1), sim.rng.pick([0, w.height - 1])),
    (i) => onEdge(sim, i) && sim.regionOf(i) === region,
    1,
  )[0];
  if (edge === undefined) {
    return 0;
  }
  // One pack of predators at a time is plenty.
  const predatorsAbout = sim.animals.some((a) => !a.tame && a.hp > 0 && ANIMALS[a.kind].preys);
  const kind = pickKind(sim, (key) => !ANIMALS[key].preys || (!grazersOnly && !predatorsAbout));
  const [least, most] = ANIMALS[kind].group;
  const count = Math.min(wildCap(sim) - wildCount(sim), sim.rng.int(least, most));
  for (let n = 0; n < count; n++) {
    addAnimal(sim, edge, kind);
  }
  return count;
}

// When the last of a manhunter pack is down or has calmed, colonists drafted to fight it stand
// down (unless raiders are about too).
function standDownAfterPack(sim: Simulation): void {
  if (!sim.story.manhuntersActive || sim.animals.some((a) => a.manhunter && a.hp > 0 && a.revengeOn >= 0)) {
    return;
  }
  sim.story.manhuntersActive = false;
  if (sim.story.beastHunt) {
    sim.story.beastHunt = false;
    sim.addLog('Colonists stand down.', 'info');
  } else {
    sim.addLog('The maddened animals are dealt with. Colonists stand down.', 'good', true);
  }
  if (!sim.raid) {
    for (const c of sim.living()) {
      if (c.drafted) {
        sim.endJob(c);
        c.drafted = false;
      }
    }
  }
}

// How long a predator that has eaten leaves other animals alone, and how far it looks for prey.
const FED_TICKS = TICKS_PER_HOUR * 48;
const HUNT_RANGE = 18;
const PREY_BITE = 2.5;

// A hungry wild predator looks for prey now and then, runs it down and eats; the carcass leaves
// raw meat behind for anyone who wants it. Returns true while it's busy hunting.
function stalk(sim: Simulation, a: Animal): boolean {
  const w = sim.world;
  const def = ANIMALS[a.kind];
  if ((a.fedUntil ?? 0) > sim.tick || (a.huntAgainAt ?? 0) > sim.tick || !def.preys || !def.bite) {
    return false;
  }
  let prey = a.chasing !== undefined ? sim.animals.find((p) => p.id === a.chasing && p.hp > 0 && !p.tame) : undefined;
  if (!prey) {
    a.chasing = undefined;
    // Looking around is occasional, not every tick.
    if ((sim.tick + a.id * 7) % 30 !== 0) {
      return false;
    }
    const region = sim.regionOf(a.tile);
    prey = sim.animals
      .filter(
        (p) =>
          p.hp > 0 &&
          !p.tame &&
          def.preys!.includes(p.kind) &&
          w.distance(p.tile, a.tile) <= HUNT_RANGE &&
          sim.regionOf(p.tile) === region &&
          penAt(sim, p.tile) < 0,
      )
      .sort((x, y) => w.distance(x.tile, a.tile) - w.distance(y.tile, a.tile))[0];
    if (!prey) {
      return false;
    }
    a.chasing = prey.id;
    chasedThisTick?.add(prey.id);
  }
  if (chebyshev(sim, a.tile, prey.tile) <= 1) {
    a.path = [];
    if (a.cooldown <= 0) {
      a.cooldown = BITE_COOLDOWN;
      const hit = sim.rng.next() < 0.7;
      sim.shots.push({ from: a.tile, to: prey.tile, hit, ranged: false, tick: sim.tick });
      if (hit) {
        // Hunting animals go for the throat: far harder than a bite in a scuffle.
        prey.hp -= (def.bite[0] + sim.rng.next() * (def.bite[1] - def.bite[0])) * PREY_BITE;
        if (prey.hp <= 0) {
          // What the predator doesn't eat is left for the taking.
          const left = Math.floor(ANIMALS[prey.kind].meat / 2);
          if (left > 0) {
            w.dropItemNear(prey.tile, itemId('rawMeat'), left);
          }
          // The whole pack shares the kill.
          for (const p of sim.animals) {
            if (p === a || (p.kind === a.kind && !p.tame && p.revengeOn < 0 && w.distance(p.tile, a.tile) <= 10)) {
              p.chasing = undefined;
              p.fedUntil = sim.tick + FED_TICKS;
              p.restUntil = sim.tick + TICKS_PER_HOUR * 2;
              p.path = [];
            }
          }
        }
      }
    }
    return true;
  }
  if (a.path.length === 0 || sim.tick % 30 === 0) {
    pathTo(sim, a, [prey.tile, ...w.neighbors(prey.tile).filter((n) => w.isPassable(n))]);
    if (a.path.length === 0 || w.distance(prey.tile, a.tile) > HUNT_RANGE * 2) {
      // Lost it: try again later, no less hungry.
      a.chasing = undefined;
      a.huntAgainAt = sim.tick + TICKS_PER_HOUR * 6;
      return false;
    }
  }
  move(sim, a);
  return true;
}

// The nearest colonist a raging animal can reach and still has to bring down.
function nearestPrey(sim: Simulation, a: Animal): Colonist | undefined {
  const region = sim.regionOf(a.tile);
  return sim
    .living()
    .filter((c) => !c.health.downed && sim.regionOf(c.tile) === region)
    .sort((x, y) => sim.world.distance(a.tile, x.tile) - sim.world.distance(a.tile, y.tile))[0];
}

// A beast a neighbour wants dealt with: a great boar, far tougher than most, that roams the valley
// (and never leaves) until it's hunted down or the request lapses.
export const QUARRY_TOUGHNESS = 2.5;
export const maxHp = (a: Animal): number => ANIMALS[a.kind].hp * (a.toughness ?? (a.quarry ? QUARRY_TOUGHNESS : 1));
export function addQuarry(sim: Simulation): Animal | null {
  const region = sim.outsideRegion();
  const w = sim.world;
  if (region === undefined) {
    return null;
  }
  const edge = sim.nearest(
    w.idx(sim.rng.int(0, w.width - 1), sim.rng.pick([0, w.height - 1])),
    (i) => onEdge(sim, i) && sim.regionOf(i) === region,
    1,
  )[0];
  if (edge === undefined) {
    return null;
  }
  const a = addAnimal(sim, edge, 'boar');
  a.hp *= QUARRY_TOUGHNESS;
  a.quarry = true;
  return a;
}

// Creatures come up out of the ground at `tile` (a breached mine shaft) and go for the nearest colonist.
// Returns how many came.
export function creaturesEmerge(sim: Simulation, tile: number, kind: string, count: number): number {
  const w = sim.world;
  // They come up on the side of the shaft where someone is (not shut away behind a wall from everyone).
  const reachable = new Set(
    sim
      .living()
      .filter((c) => !c.health.downed)
      .map((c) => sim.regionOf(c.tile)),
  );
  const around = w.neighbors(tile, true).filter((i) => w.isPassable(i) && reachable.has(sim.regionOf(i)));
  if (around.length === 0) {
    return 0;
  }
  for (let n = 0; n < count; n++) {
    const a = addAnimal(sim, around[n % around.length], kind);
    a.manhunter = true;
    a.revengeOn = nearestPrey(sim, a)?.id ?? -1;
    a.revengeUntil = sim.tick + TICKS_PER_HOUR * 16;
  }
  return count;
}

// A pack of animals driven mad (by hunger, disease or something stranger) comes for the colony.
// Returns how many arrived.
export function manhuntersArrive(sim: Simulation, kind: string, count: number): number {
  const region = sim.outsideRegion();
  const w = sim.world;
  if (region === undefined) {
    return 0;
  }
  const edge = sim.nearest(
    w.idx(sim.rng.int(0, w.width - 1), sim.rng.pick([0, w.height - 1])),
    (i) => onEdge(sim, i) && sim.regionOf(i) === region,
    1,
  )[0];
  // Nobody they could reach (everyone down, or the colony cut off): they don't come at all.
  if (edge === undefined || !sim.living().some((c) => !c.health.downed && sim.regionOf(c.tile) === region)) {
    return 0;
  }
  // On a small map they gather at the edge before they charge, so there's time to get ready.
  const home = sim.homeTile() ?? sim.living()[0].tile;
  const walk = walkTicks(w, edge, home, animalTilesPerTick(ANIMALS[kind].speed), 0);
  const muster = musterTicks(walk);
  for (let n = 0; n < count; n++) {
    const a = addAnimal(sim, edge, kind);
    a.manhunter = true;
    a.revengeOn = nearestPrey(sim, a)!.id;
    // Their fury lasts most of a day (from when they set off).
    a.revengeUntil = sim.tick + muster + TICKS_PER_HOUR * 16;
    if (muster > 0) {
      a.musterUntil = sim.tick + muster;
    }
  }
  return count;
}

// Roughly how long until a pack just arrived (the last `count` animals) reaches the colony.
export function packDueIn(sim: Simulation, count: number): number {
  const lead = sim.animals[sim.animals.length - 1];
  const home = sim.homeTile() ?? sim.living()[0]?.tile;
  if (!lead || count === 0 || home === undefined) {
    return 0;
  }
  const walk = walkTicks(sim.world, lead.tile, home, animalTilesPerTick(ANIMALS[lead.kind].speed), 0);
  return walk + Math.max(0, (lead.musterUntil ?? sim.tick) - sim.tick);
}

function pathTo(sim: Simulation, a: Animal, goals: number[]): void {
  // Animals don't pass gates (but a tame one may, on its way into a pen).
  a.path = sim.pathfinder.find(a.tile, goals, gateFilter(sim, a)) ?? [];
  a.moveProgress = 0;
}

function move(sim: Simulation, a: Animal): void {
  const w = sim.world;
  const next = a.path[0];
  if (!w.isPassable(next) || !animalMayEnter(sim, a, next)) {
    a.path = [];
    a.moveProgress = 0;
    return;
  }
  const diagonal = w.xOf(next) !== w.xOf(a.tile) && w.yOf(next) !== w.yOf(a.tile);
  a.moveProgress += (MOVE_SPEED * 0.8 * ANIMALS[a.kind].speed) / (w.moveCost(next) * (diagonal ? Math.SQRT2 : 1));
  if (a.moveProgress >= 1) {
    a.tile = next;
    a.path.shift();
    a.moveProgress = 0;
  }
}

// Picks a walkable tile roughly `distance` away, in the direction away from `from` if given.
function wanderTarget(sim: Simulation, a: Animal, distance: number, from?: number): number | undefined {
  const w = sim.world;
  const x = w.xOf(a.tile);
  const y = w.yOf(a.tile);
  const region = sim.regionOf(a.tile);
  for (let attempt = 0; attempt < 8; attempt++) {
    let tx = x + sim.rng.int(-distance, distance);
    let ty = y + sim.rng.int(-distance, distance);
    if (from !== undefined) {
      tx = x + Math.sign(x - w.xOf(from) || 1) * sim.rng.int(2, distance);
      ty = y + Math.sign(y - w.yOf(from) || 1) * sim.rng.int(0, distance);
    }
    if (w.inBounds(tx, ty) && sim.regionOf(w.idx(tx, ty)) === region && penAt(sim, w.idx(tx, ty)) < 0) {
      return w.idx(tx, ty);
    }
  }
  return undefined;
}

// Tame animals keep within this distance of the colony.
const HOME_RANGE = 10;
const MAX_TAME = 14;

export const wildCount = (sim: Simulation) => sim.animals.filter((a) => !a.tame).length;

// Tame animals left to graze for themselves breed only in spring and summer, this much as often as fed
// ones in a pen.
const GRAZING_BREED = 0.5;

// Each morning penned animals eat from their troughs, tame pairs may have young, and tame animals give
// their produce (milk, wool, eggs).
export function animalsAtDawn(sim: Simulation): void {
  const tame = sim.animals.filter((a) => a.tame && a.hp > 0);
  const fed = feedPenned(sim, tame);
  const grazing = sim.season === 'Spring' || sim.season === 'Summer' ? GRAZING_BREED : 0;
  const born: string[] = [];
  for (const kind of Object.keys(ANIMALS)) {
    // Fed animals pair up with others fed in the same pen; the rest with each other.
    const herds = new Map<number, Animal[]>();
    for (const a of tame.filter((t) => t.kind === kind)) {
      const key = fed.has(a) ? penAt(sim, a.tile) : -1;
      herds.set(key, [...(herds.get(key) ?? []), a]);
    }
    for (const [pen, herd] of herds) {
      const chance = ANIMALS[kind].breedChance * (sim.isResearched('husbandry') ? 2 : 1) * (pen >= 0 ? 1 : grazing);
      for (let pair = 0; pair < Math.floor(herd.length / 2); pair++) {
        if (sim.animals.filter((a) => a.tame).length >= MAX_TAME || !sim.rng.chance(chance)) {
          continue;
        }
        const young = addAnimal(sim, herd[pair * 2].tile, kind);
        young.tame = true;
        born.push(ANIMALS[kind].name.toLowerCase());
      }
    }
  }
  if (born.length > 0) {
    sim.addLog(`New ${born.length > 1 ? 'young' : 'young one'} in the herd: ${born.join(', ')}.`, 'good');
  }
  wildYoung(sim);
  moveOn(sim);
  migrate(sim);
  // Wounds mend, a quarter of an animal's health a day.
  for (const a of sim.animals) {
    if (a.hp > 0) {
      a.hp = Math.min(maxHp(a), a.hp + ANIMALS[a.kind].hp * 0.25);
    }
  }
  for (const a of tame) {
    const produce = ANIMALS[a.kind].produce;
    if (produce) {
      sim.world.dropItemNear(a.tile, produce.item, produce.count);
      const key = itemDef(produce.item).key;
      sim.stats.produced[key] = (sim.stats.produced[key] ?? 0) + produce.count;
    }
  }
}

// In spring and summer wild herds have young too, while the valley has room (three quarters of what it
// holds), so a valley that isn't hunted out keeps its wildlife. Half as often as tame animals breed.
function wildYoung(sim: Simulation): void {
  if ((sim.season !== 'Spring' && sim.season !== 'Summer') || wildCount(sim) >= wildCap(sim) * 0.75) {
    return;
  }
  const settled = sim.animals.filter(
    (a) => !a.tame && a.hp > 0 && !a.leaving && !a.manhunter && !a.quarry && ANIMALS[a.kind].weight > 0,
  );
  for (const kind of new Set(settled.map((a) => a.kind))) {
    const herd = settled.filter((a) => a.kind === kind);
    for (let pair = 0; pair < Math.floor(herd.length / 2); pair++) {
      if (wildCount(sim) >= wildCap(sim) * 0.75 || !sim.rng.chance(ANIMALS[kind].breedChance * 0.5)) {
        continue;
      }
      addAnimal(sim, herd[pair * 2].tile, kind);
    }
  }
}

// Hunt too hard and the herds grow wary of the valley: more than this many kills in five days, and for ten
// days after, half as many wander in.
const WARY_KILLS = 8;
const WARY_WINDOW = TICKS_PER_HOUR * 24 * 5;
const WARY_DAYS = 10;
export const herdsWary = (sim: Simulation): boolean => (sim.story.waryUntil ?? 0) > sim.tick;

// The Meadow Kin live off the same valley and mind how it's hunted: emptying it of game costs the colony
// their goodwill, the last of a kind more than a busy few days.
const WARY_GOODWILL = -5;
const LAST_OF_KIND_GOODWILL = -4;
const KIN_PATIENCE = TICKS_PER_HOUR * 24 * 3;

function huntedOne(sim: Simulation, a: Animal): void {
  const recent = (sim.story.recentHunts ?? []).filter((t) => t > sim.tick - WARY_WINDOW);
  recent.push(sim.tick);
  sim.story.recentHunts = recent;
  const kin = friendly().filter((f) => onGoodTerms(sim, f.id));
  const kinName = kin[0]?.name;
  if (recent.length > WARY_KILLS && !herdsWary(sim)) {
    sim.story.waryUntil = sim.tick + WARY_DAYS * TICKS_PER_HOUR * 24;
    sim.addLog(
      'The colony has hunted the valley hard: the herds have grown wary, and fewer will wander in for a while.',
      'warn',
      true,
    );
    if (kinName) {
      sim.story.kinMindedAt = sim.tick;
      kin.forEach((f) => changeGoodwill(sim, f.id, WARY_GOODWILL));
      sim.addLog(`${kinName} are displeased: "You hunt the valley as if nothing will be left for anyone."`, 'warn');
    }
  }
  // (Once in a while: a lone hare wandering in and shot isn't a fresh grievance each time.)
  const lastComplaint = sim.story.kinMindedAt;
  if (
    !a.quarry &&
    ANIMALS[a.kind].weight > 0 &&
    wildOfKind(sim, a.kind) === 0 &&
    kinName &&
    (lastComplaint === undefined || sim.tick - lastComplaint >= KIN_PATIENCE)
  ) {
    sim.story.kinMindedAt = sim.tick;
    kin.forEach((f) => changeGoodwill(sim, f.id, LAST_OF_KIND_GOODWILL));
    sim.addLog(
      `${kinName} are troubled: "That was the last ${ANIMALS[a.kind].name.toLowerCase()} in the valley. Leave a pair next time, and the herds come back."`,
      'warn',
    );
  }
}

// Under the "surplus only" hunting policy, hunters leave this many of each kind in the valley.
export const BREEDING_PAIR = 2;

// Wild animals of a kind that live in the valley (not just passing through or maddened).
function wildOfKind(sim: Simulation, kind: string): number {
  return sim.animals.filter((a) => a.kind === kind && a.hp > 0 && !a.tame && !a.leaving && !a.manhunter && !a.quarry)
    .length;
}

// Whether hunters leave this animal be, as one of the last breeding pair of its kind. Only under the
// "surplus only" policy, and never for the great boar the neighbours asked for or a maddened beast.
export function spareForBreeding(sim: Simulation, a: Animal): boolean {
  return (
    sim.village.hunting === 'surplus' &&
    !a.tame &&
    !a.quarry &&
    !a.manhunter &&
    a.revengeOn < 0 &&
    ANIMALS[a.kind].weight > 0 &&
    wildOfKind(sim, a.kind) <= BREEDING_PAIR
  );
}

// Under the "surplus only" policy, takes the hunting mark off enough animals of each kind that a
// breeding pair is left unmarked (the ones furthest from the colony, which are the hardest to reach).
export function keepBreedingPairs(sim: Simulation): void {
  if (sim.village.hunting !== 'surplus') {
    return;
  }
  const home = sim.homeTile() ?? sim.living()[0]?.tile ?? 0;
  for (const kind of new Set(sim.animals.map((a) => a.kind))) {
    const herd = sim.animals.filter(
      (a) => a.kind === kind && a.hp > 0 && !a.tame && !a.leaving && !a.manhunter && !a.quarry,
    );
    if (ANIMALS[kind].weight === 0) {
      continue;
    }
    let unmarked = herd.filter((a) => !a.hunted).length;
    const marked = herd
      .filter((a) => a.hunted && a.revengeOn < 0)
      .sort((x, y) => sim.world.distance(y.tile, home) - sim.world.distance(x.tile, home));
    for (const a of marked) {
      if (unmarked >= BREEDING_PAIR) {
        break;
      }
      a.hunted = false;
      unmarked++;
    }
  }
}

// A hunted-out valley fills back up slowly: while the wild population is under half the room there
// is, a few grazers sometimes wander in on their own, most often in spring and rarely in winter. The
// storyteller's herds are the bigger, announced arrivals.
const MIGRATION_CHANCE: Record<Season, number> = { Spring: 0.4, Summer: 0.3, Autumn: 0.25, Winter: 0.1 };
function migrate(sim: Simulation): void {
  if (
    wildCount(sim) >= wildCap(sim) / 2 ||
    !sim.rng.chance(MIGRATION_CHANCE[sim.season] * (herdsWary(sim) ? 0.5 : 1))
  ) {
    return;
  }
  const count = herdArrives(sim, true);
  if (count > 0) {
    const kind = sim.animals[sim.animals.length - 1].kind;
    sim.addLog(
      `${count === 1 ? `A ${ANIMALS[kind].name.toLowerCase()} has` : `${count} ${ANIMALS[kind].plural} have`} wandered into the valley.`,
      'info',
    );
  }
}

// Wild animals don't stay for good. Predators with nothing left to hunt move on, and when the map is
// crowded the herd that has been around longest wanders off, making room for newcomers.
function moveOn(sim: Simulation): void {
  // Animals shut in somewhere (a pen, an island) can't leave, and don't hold up the rest.
  const outside = sim.outsideRegion();
  const free = (a: Animal) =>
    a.hp > 0 &&
    !a.tame &&
    !a.taming &&
    !a.hunted &&
    !a.leaving &&
    !a.manhunter &&
    !a.quarry &&
    a.revengeOn < 0 &&
    (outside === undefined || sim.regionOf(a.tile) === outside);
  for (const a of sim.animals) {
    if (free(a) && ANIMALS[a.kind].preys && (a.fedUntil ?? 0) < sim.tick - TICKS_PER_HOUR * 48) {
      a.leaving = true;
    }
  }
  if (wildCount(sim) < wildCap(sim) * 0.75) {
    return;
  }
  const oldest = sim.animals.filter(free).sort((x, y) => x.id - y.id)[0];
  for (const a of sim.animals) {
    if (oldest && free(a) && a.kind === oldest.kind && sim.world.distance(a.tile, oldest.tile) <= 12) {
      a.leaving = true;
    }
  }
}

// A wild animal moving on heads for the nearest edge of the map and leaves it.
function leave(sim: Simulation, a: Animal): void {
  if (onEdge(sim, a.tile)) {
    // Gone: removed with the fallen at the end of the update, but leaving nothing behind.
    if (a.kind === 'greatBeast') {
      beastLeaves(sim, a);
    }
    a.hp = 0;
    return;
  }
  if (a.path.length === 0 || !onEdge(sim, a.path[a.path.length - 1])) {
    const region = sim.regionOf(a.tile);
    pathTo(
      sim,
      a,
      sim.nearest(a.tile, (i) => onEdge(sim, i) && sim.regionOf(i) === region, 3),
    );
    if (a.path.length === 0) {
      // Hemmed in: it stays after all.
      a.leaving = false;
      return;
    }
  }
  move(sim, a);
}

// Tame boars bite raiders who come within reach.
function guard(sim: Simulation, a: Animal): boolean {
  const def = ANIMALS[a.kind];
  if (!def.guard || !def.bite || a.cooldown > 0) {
    return false;
  }
  const raider = sim.enemies.find((e) => e.hp > 0 && chebyshev(sim, a.tile, e.tile) <= 1);
  if (!raider) {
    return false;
  }
  const hit = sim.rng.next() < 0.7;
  sim.shots.push({ from: a.tile, to: raider.tile, hit, ranged: false, tick: sim.tick });
  if (hit) {
    // Teeth don't get through armor any better than a club.
    const bite = (def.bite[0] + sim.rng.next() * (def.bite[1] - def.bite[0])) * (1 - raider.armor);
    woundEnemy(sim, raider, bite, `A tame ${def.name.toLowerCase()}`);
  }
  // The raider fights back.
  if (raider.hp > 0 && sim.rng.next() < 0.6) {
    sim.shots.push({ from: raider.tile, to: a.tile, hit: true, ranged: false, tick: sim.tick });
    a.hp -= 0.1 + sim.rng.next() * 0.12;
    if (a.hp <= 0) {
      sim.world.dropItemNear(a.tile, itemId('rawMeat'), Math.floor(def.meat / 2));
      sim.world.dropItemNear(a.tile, itemId('leather'), def.leather);
      sim.addLog(`${raider.name} killed a tame ${def.name.toLowerCase()}.`, 'warn');
    }
  }
  a.cooldown = BITE_COOLDOWN;
  a.path = [];
  return true;
}

// Animals some predator is after this tick (or was, earlier in it): only these need the full look round
// for a hunter on their heels. Never misses one, so the answer is the same as checking every animal.
let chasedThisTick: Set<number> | null = null;

export function updateAnimals(sim: Simulation): void {
  standDownAfterPack(sim);
  chasedThisTick = new Set();
  for (const p of sim.animals) {
    if (p.chasing !== undefined) {
      chasedThisTick.add(p.chasing);
    }
  }
  const w = sim.world;
  const awake = sim.living().filter((c) => !c.sleeping);
  const home = sim.homeTile() ?? sim.living()[0]?.tile;
  for (const a of sim.animals) {
    if (a.hp <= 0) {
      continue;
    }
    const def = ANIMALS[a.kind];
    a.cooldown--;
    // A maddened pack gathering at the edge holds until it's time, or until someone comes close or one is hurt.
    if (a.musterUntil !== undefined) {
      if (
        sim.tick < a.musterUntil &&
        a.hp >= maxHp(a) &&
        !sim.living().some((c) => !c.health.downed && w.distance(c.tile, a.tile) <= MUSTER_ALERT)
      ) {
        continue;
      }
      a.musterUntil = undefined;
    }
    // A maddened animal with nobody it can reach goes back where it came from.
    if (a.manhunter && a.revengeOn < 0) {
      const next = a.revengeUntil > sim.tick ? nearestPrey(sim, a) : undefined;
      if (next) {
        a.revengeOn = next.id;
      } else {
        a.manhunter = false;
        a.leaving = true;
      }
    }

    // Revenge: chase and bite whoever hurt us, until they're down.
    if (a.revengeOn >= 0) {
      const target = sim.colonists[a.revengeOn];
      // Calm down once the target is down, out of reach, or after a while.
      if (
        !target ||
        target.health.dead ||
        target.health.downed ||
        // (Off on an expedition: out of reach.)
        !!target.away ||
        !(a.revengeUntil > sim.tick) ||
        sim.regionOf(target.tile) !== sim.regionOf(a.tile)
      ) {
        a.revengeOn = -1;
        a.lashOut = false;
        a.path = [];
        // A manhunter turns on the next colonist it can reach, until its fury runs out.
        if (a.manhunter) {
          const next = a.revengeUntil > sim.tick ? nearestPrey(sim, a) : undefined;
          if (next) {
            a.revengeOn = next.id;
          } else {
            // Its fury spent, it goes back where it came from.
            a.manhunter = false;
            a.leaving = true;
          }
        }
      } else if (chebyshev(sim, a.tile, target.tile) <= 1) {
        a.path = [];
        if (a.cooldown <= 0 && def.bite) {
          const hit = sim.rng.next() < 0.75;
          sim.shots.push({ from: a.tile, to: target.tile, hit, ranged: false, tick: sim.tick });
          if (hit) {
            damage(
              sim,
              target,
              armorTakes(sim, target, def.bite[0] + sim.rng.next() * (def.bite[1] - def.bite[0])),
              'cut',
            );
            sim.addThought(target, 'mauled');
          }
          a.cooldown = BITE_COOLDOWN;
        }
        continue;
      } else if (a.path.length === 0 || sim.tick % 30 === 0) {
        pathTo(sim, a, [target.tile, ...w.neighbors(target.tile).filter((n) => w.isPassable(n))]);
        if (a.path.length === 0) {
          a.revengeOn = -1;
          a.leaving ||= !!a.manhunter;
          a.manhunter = false;
        }
      }
    } else if (a.tame && guard(sim, a)) {
      continue;
    } else if (a.leaving && !a.tame && !a.taming && !a.hunted) {
      leave(sim, a);
      continue;
    } else if (def.preys && !a.tame && !a.taming && stalk(sim, a)) {
      continue;
    } else if (
      def.fleeRange > 0 &&
      !a.tame &&
      !a.taming &&
      a.path.length === 0 &&
      // Looking about every few ticks is plenty (and spares checking every animal against everyone).
      (sim.tick + a.id) % 4 === 0
    ) {
      // Skittish animals keep their distance from people, and from anything hunting them.
      let near: number | undefined;
      const ax = w.xOf(a.tile);
      const ay = w.yOf(a.tile);
      for (const c of awake) {
        // (Distance is never less than the larger of dx and dy: a quick check before the real one.)
        const dx = Math.abs(w.xOf(c.tile) - ax);
        const dy = Math.abs(w.yOf(c.tile) - ay);
        if (dx < def.fleeRange && dy < def.fleeRange && w.distance(c.tile, a.tile) < def.fleeRange) {
          near = c.tile;
          break;
        }
      }
      if (near === undefined && chasedThisTick.has(a.id)) {
        for (const p of sim.animals) {
          if (p.chasing === a.id && p.hp > 0 && w.distance(p.tile, a.tile) < 6) {
            near = p.tile;
            break;
          }
        }
      }
      if (near !== undefined) {
        const to = wanderTarget(sim, a, WANDER_RADIUS, near);
        if (to !== undefined) {
          pathTo(sim, a, [to]);
        }
      }
    }
    if (a.path.length === 0 && a.revengeOn < 0 && sim.tick >= a.restUntil) {
      // Tame animals keep to their pen if there is one; otherwise those that stray too far head back
      // towards the colony.
      const pen = penFor(sim, a);
      const strayed = a.tame && home !== undefined && w.distance(a.tile, home) > HOME_RANGE;
      const to = pen ? penTarget(sim, a, pen) : strayed ? homeward(sim, a, home) : wanderTarget(sim, a, WANDER_RADIUS);
      if (to !== undefined) {
        pathTo(sim, a, [to]);
      }
      a.restUntil = sim.tick + sim.rng.int(100, 400);
    }
    if (a.path.length > 0) {
      move(sim, a);
    }
  }
  if (sim.animals.some((a) => a.hp <= 0)) {
    sim.animals = sim.animals.filter((a) => a.hp > 0);
  }
}

// A colonist's attack landed. Kills drop meat and leather; some animals fight back.
export function hurtAnimal(sim: Simulation, a: Animal, amount: number, attacker: Colonist): void {
  if (a.hp <= 0) {
    return;
  }
  const def = ANIMALS[a.kind];
  a.hp -= amount;
  sim.world.addFilth(a.tile, Filth.BLOOD);
  if (a.hp <= 0) {
    sim.world.dropItemNear(a.tile, itemId('rawMeat'), def.meat);
    if (def.leather > 0) {
      sim.world.dropItemNear(a.tile, itemId('leather'), def.leather);
    }
    sim.stats.produced.rawMeat = (sim.stats.produced.rawMeat ?? 0) + def.meat;
    sim.stats.produced.leather = (sim.stats.produced.leather ?? 0) + def.leather;
    // Slaughtering livestock, or fending off an angry animal, isn't hunting.
    if (!a.tame && a.hunted) {
      sim.stats.hunted++;
      huntedOne(sim, a);
    }
    if (a.kind === 'greatBeast') {
      beastSlain(sim, a, attacker);
      return;
    }
    sim.addLog(`${attacker.name} brought down a ${animalName(a).toLowerCase()}.`, 'good');
    return;
  }
  if (a.revengeOn < 0 && def.revengeChance && sim.rng.next() < def.revengeChance) {
    a.revengeOn = attacker.id;
    a.revengeUntil = sim.tick + REVENGE_TICKS;
    a.path = [];
    sim.addLog(`The ${def.name.toLowerCase()} turned on ${attacker.name}!`, 'warn');
  } else if (def.fleeRange > 0) {
    const to = wanderTarget(sim, a, WANDER_RADIUS + 3, attacker.tile);
    if (to !== undefined) {
      pathTo(sim, a, [to]);
    }
  }
}

function homeward(sim: Simulation, a: Animal, home: number): number | undefined {
  const w = sim.world;
  const region = sim.regionOf(a.tile);
  for (let attempt = 0; attempt < 8; attempt++) {
    const tx = w.xOf(home) + sim.rng.int(-4, 4);
    const ty = w.yOf(home) + sim.rng.int(-4, 4);
    if (w.inBounds(tx, ty) && w.isPassable(w.idx(tx, ty)) && sim.regionOf(w.idx(tx, ty)) === region) {
      return w.idx(tx, ty);
    }
  }
  return undefined;
}

export function animalName(a: Animal): string {
  return a.name ? a.name[0].toUpperCase() + a.name.slice(1) : a.quarry ? 'Great boar' : ANIMALS[a.kind].name;
}
