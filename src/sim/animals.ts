import { MOVE_SPEED, TICKS_PER_HOUR } from './constants';
import { ANIMALS, itemId } from './defs';
import { damage } from './health';
import type { Simulation } from './simulation';
import { Animal, Colonist } from './types';

export const MAX_ANIMALS = 18;
const BITE_COOLDOWN = 50;
const WANDER_RADIUS = 6;
// An enraged animal calms down after this long.
const REVENGE_TICKS = TICKS_PER_HOUR * 2;

const chebyshev = (sim: Simulation, a: number, b: number) =>
  Math.max(Math.abs(sim.world.xOf(a) - sim.world.xOf(b)), Math.abs(sim.world.yOf(a) - sim.world.yOf(b)));

function pickKind(sim: Simulation): string {
  const kinds = Object.values(ANIMALS);
  let roll = sim.rng.next() * kinds.reduce((sum, a) => sum + a.weight, 0);
  for (const a of kinds) {
    roll -= a.weight;
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

// A small herd wanders in from the map edge. Returns how many arrived.
export function herdArrives(sim: Simulation): number {
  const region = sim.outsideRegion();
  if (region === undefined || wildCount(sim) >= MAX_ANIMALS) {
    return 0;
  }
  const w = sim.world;
  const edge = sim.nearest(
    w.idx(sim.rng.int(0, w.width - 1), sim.rng.pick([0, w.height - 1])),
    (i) => {
      const x = w.xOf(i);
      const y = w.yOf(i);
      return (x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1) && sim.regionOf(i) === region;
    },
    1,
  )[0];
  if (edge === undefined) {
    return 0;
  }
  const kind = pickKind(sim);
  const count = Math.min(MAX_ANIMALS - wildCount(sim), sim.rng.int(3, 5));
  for (let n = 0; n < count; n++) {
    addAnimal(sim, edge, kind);
  }
  return count;
}

function pathTo(sim: Simulation, a: Animal, goals: number[]): void {
  a.path = sim.pathfinder.find(a.tile, goals) ?? [];
  a.moveProgress = 0;
}

function move(sim: Simulation, a: Animal): void {
  const w = sim.world;
  const next = a.path[0];
  if (!w.isPassable(next)) {
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
    if (w.inBounds(tx, ty) && sim.regionOf(w.idx(tx, ty)) === region) {
      return w.idx(tx, ty);
    }
  }
  return undefined;
}

// Tame animals keep within this distance of the colony.
const HOME_RANGE = 10;
const MAX_TAME = 14;

export const wildCount = (sim: Simulation) => sim.animals.filter((a) => !a.tame).length;

// Each morning tame pairs may have young, and tame milkers give milk.
export function animalsAtDawn(sim: Simulation): void {
  const tame = sim.animals.filter((a) => a.tame && a.hp > 0);
  const born: string[] = [];
  for (const kind of Object.keys(ANIMALS)) {
    const herd = tame.filter((a) => a.kind === kind);
    for (let pair = 0; pair < Math.floor(herd.length / 2); pair++) {
      if (sim.animals.filter((a) => a.tame).length >= MAX_TAME || !sim.rng.chance(ANIMALS[kind].breedChance)) {
        continue;
      }
      const young = addAnimal(sim, herd[pair * 2].tile, kind);
      young.tame = true;
      born.push(ANIMALS[kind].name.toLowerCase());
    }
  }
  if (born.length > 0) {
    sim.addLog(`New ${born.length > 1 ? 'young' : 'young one'} in the herd: ${born.join(', ')}.`, 'good');
  }
  for (const a of tame) {
    const milk = ANIMALS[a.kind].milk;
    if (milk) {
      sim.world.dropItemNear(a.tile, itemId('milk'), milk);
    }
  }
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
    raider.hp -= def.bite[0] + sim.rng.next() * (def.bite[1] - def.bite[0]);
    if (raider.hp <= 0) {
      sim.addLog(`A tame ${def.name.toLowerCase()} brought down ${raider.name}!`, 'good');
      if (sim.raid) {
        sim.raid.killed++;
      }
    }
  }
  a.cooldown = BITE_COOLDOWN;
  a.path = [];
  return true;
}

export function updateAnimals(sim: Simulation): void {
  const w = sim.world;
  const awake = sim.living().filter((c) => !c.sleeping);
  const home = sim.living()[0]?.tile;
  for (const a of sim.animals) {
    if (a.hp <= 0) {
      continue;
    }
    const def = ANIMALS[a.kind];
    a.cooldown--;

    // Revenge: chase and bite whoever hurt us, until they're down.
    if (a.revengeOn >= 0) {
      const target = sim.colonists[a.revengeOn];
      // Calm down once the target is down, out of reach, or after a while.
      if (
        !target ||
        target.health.dead ||
        target.health.downed ||
        !(a.revengeUntil > sim.tick) ||
        sim.regionOf(target.tile) !== sim.regionOf(a.tile)
      ) {
        a.revengeOn = -1;
        a.path = [];
      } else if (chebyshev(sim, a.tile, target.tile) <= 1) {
        a.path = [];
        if (a.cooldown <= 0 && def.bite) {
          const hit = sim.rng.next() < 0.75;
          sim.shots.push({ from: a.tile, to: target.tile, hit, ranged: false, tick: sim.tick });
          if (hit) {
            damage(sim, target, def.bite[0] + sim.rng.next() * (def.bite[1] - def.bite[0]), 'cut');
            sim.addThought(target, 'mauled');
          }
          a.cooldown = BITE_COOLDOWN;
        }
        continue;
      } else if (a.path.length === 0 || sim.tick % 30 === 0) {
        pathTo(sim, a, [target.tile, ...w.neighbors(target.tile).filter((n) => w.isPassable(n))]);
        if (a.path.length === 0) {
          a.revengeOn = -1;
        }
      }
    } else if (a.tame && guard(sim, a)) {
      continue;
    } else if (def.fleeRange > 0 && !a.tame && !a.taming && a.path.length === 0) {
      // Skittish animals keep their distance from people.
      const near = awake.find((c) => w.distance(c.tile, a.tile) < def.fleeRange);
      if (near) {
        const to = wanderTarget(sim, a, WANDER_RADIUS, near.tile);
        if (to !== undefined) {
          pathTo(sim, a, [to]);
        }
      }
    }
    if (a.path.length === 0 && a.revengeOn < 0 && sim.tick >= a.restUntil) {
      // Tame animals that stray too far head back towards the colony.
      const strayed = a.tame && home !== undefined && w.distance(a.tile, home) > HOME_RANGE;
      const to = strayed ? homeward(sim, a, home) : wanderTarget(sim, a, WANDER_RADIUS);
      if (to !== undefined) {
        pathTo(sim, a, [to]);
      }
      a.restUntil = sim.tick + sim.rng.int(100, 400);
    }
    if (a.path.length > 0) {
      move(sim, a);
    }
  }
  sim.animals = sim.animals.filter((a) => a.hp > 0);
}

// A colonist's attack landed. Kills drop meat and leather; some animals fight back.
export function hurtAnimal(sim: Simulation, a: Animal, amount: number, attacker: Colonist): void {
  if (a.hp <= 0) {
    return;
  }
  const def = ANIMALS[a.kind];
  a.hp -= amount;
  if (a.hp <= 0) {
    sim.world.dropItemNear(a.tile, itemId('rawMeat'), def.meat);
    sim.world.dropItemNear(a.tile, itemId('leather'), def.leather);
    sim.stats.produced.rawMeat = (sim.stats.produced.rawMeat ?? 0) + def.meat;
    sim.stats.produced.leather = (sim.stats.produced.leather ?? 0) + def.leather;
    sim.stats.hunted++;
    sim.addLog(`${attacker.name} brought down a ${def.name.toLowerCase()}.`, 'good');
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
  return ANIMALS[a.kind].name;
}
