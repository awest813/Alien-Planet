import { MOVE_SPEED, TICKS_PER_HOUR } from './constants';
import { FACTIONS, ITEMS, NORMAL_QUALITY, itemDef, itemId } from './defs';
import type { Simulation } from './simulation';

// Friendly factions send caravans. Traders walk in from the map edge, set up near the colony for
// most of a day, and leave. While they're there the player can buy and sell; goods change hands
// at once and are settled in silver. Trading builds goodwill, which brings better prices and
// more frequent visits.

export interface Visitor {
  id: number;
  name: string;
  tile: number;
  path: number[];
  moveProgress: number;
  // Tick when they next pick somewhere to stand.
  restUntil: number;
}

export interface Caravan {
  faction: number;
  visitors: Visitor[];
  stock: { item: number; count: number }[];
  silver: number;
  // When they reached the colony (undefined while on the way).
  arrivedTick?: number;
  // When they pack up and leave.
  leaveAt: number;
  leaving: boolean;
}

export const STARTING_GOODWILL = 20;

// Silver changing hands for a deal, rounded in the traders' favour (so a single cheap item can't be
// sold for double its price).
export const dealBalance = (cost: number, income: number) => Math.ceil(cost) - Math.floor(income);
// How long a caravan stays, counted from when it sets out.
const VISIT_HOURS = 30;
// Traders this close to home have arrived and are open for business.
const ARRIVED = 10;
const SILVER = () => itemId('silver');

// What a farming caravan might bring: [item, min, max].
const WARES: [string, number, number][] = [
  ['potatoes', 20, 60],
  ['berries', 0, 30],
  ['meal', 5, 15],
  ['herbalMedicine', 3, 8],
  ['cloth', 10, 40],
  ['leather', 5, 20],
  ['wood', 50, 150],
  ['stoneBlocks', 0, 40],
  ['tunic', 0, 2],
  ['parka', 0, 2],
  ['recurveBow', 0, 1],
];

export const goodwillOf = (sim: Simulation, faction: number): number => sim.goodwill[faction] ?? STARTING_GOODWILL;

export function standingLabel(goodwill: number, hostile: boolean): string {
  if (hostile) {
    return 'Hostile';
  }
  return goodwill >= 75 ? 'Ally' : goodwill >= 40 ? 'Friendly' : goodwill >= 0 ? 'Neutral' : 'Wary';
}

// Silver per unit: what the traders charge, and what they pay. Better goodwill narrows the gap.
export function prices(
  sim: Simulation,
  faction: number,
): { buy: (item: number) => number; sell: (item: number) => number } {
  const g = Math.max(-50, Math.min(100, goodwillOf(sim, faction)));
  return {
    buy: (item) => itemDef(item).value * (1.5 - g * 0.003),
    sell: (item) => itemDef(item).value * (0.5 + g * 0.002),
  };
}

export const tradeOpen = (sim: Simulation): boolean =>
  !!sim.caravan && sim.caravan.arrivedTick !== undefined && !sim.caravan.leaving;

// A caravan from a friendly faction sets out for the colony. Returns whether one could come.
export function caravanArrives(sim: Simulation): boolean {
  const w = sim.world;
  const faction = FACTIONS.find((f) => !f.hostile);
  const home = sim.homeTile();
  const region = sim.outsideRegion();
  if (!faction || home === undefined || region === undefined || sim.caravan) {
    return false;
  }
  const onEdge = (i: number) => {
    const x = w.xOf(i);
    const y = w.yOf(i);
    return (x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1) && sim.regionOf(i) === region;
  };
  const edge = sim.nearest(home, onEdge, 1)[0];
  if (edge === undefined) {
    return false;
  }
  const names = [...faction.names];
  const visitors: Visitor[] = [];
  for (let n = 0; n < 3; n++) {
    const name = names.splice(sim.rng.int(0, names.length - 1), 1)[0] ?? 'Trader';
    visitors.push({ id: sim.nextVisitorId++, name, tile: edge, path: [], moveProgress: 0, restUntil: 0 });
  }
  const stock = WARES.map(([key, lo, hi]) => ({ item: itemId(key), count: sim.rng.int(lo, hi) })).filter(
    (s) => s.count > 0,
  );
  sim.caravan = {
    faction: faction.id,
    visitors,
    stock,
    silver: sim.rng.int(200, 400),
    leaveAt: sim.tick + VISIT_HOURS * TICKS_PER_HOUR,
    leaving: false,
  };
  // Just a log line: the card comes when they arrive and trade opens.
  sim.addLog(`Traders from ${faction.name} are on their way to the colony.`, 'good');
  return true;
}

// Walks the traders in, lets them mill about near the colony, and sees them off.
export function updateCaravan(sim: Simulation): void {
  const caravan = sim.caravan;
  if (!caravan) {
    return;
  }
  const w = sim.world;
  const home = sim.homeTile() ?? caravan.visitors[0]?.tile;
  if (!caravan.leaving && sim.tick >= caravan.leaveAt) {
    caravan.leaving = true;
    for (const v of caravan.visitors) {
      v.path = [];
    }
    sim.addLog(`The traders from ${FACTIONS[caravan.faction].name} are packing up.`, 'info');
  }
  for (const v of caravan.visitors) {
    if (v.path.length === 0 && sim.tick >= v.restUntil) {
      if (caravan.leaving) {
        const region = sim.regionOf(v.tile);
        const exit = sim.nearest(
          v.tile,
          (i) => {
            const x = w.xOf(i);
            const y = w.yOf(i);
            return (x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1) && sim.regionOf(i) === region;
          },
          1,
        )[0];
        v.path = exit !== undefined ? (sim.pathfinder.find(v.tile, [exit]) ?? []) : [];
        if (v.path.length === 0) {
          // At the edge (or with nowhere to go): gone.
          v.tile = -1;
        }
      } else if (home !== undefined) {
        // Stand somewhere near the middle of the colony.
        const x = w.xOf(home) + sim.rng.int(-4, 4);
        const y = w.yOf(home) + sim.rng.int(-4, 4);
        if (w.inBounds(x, y) && w.isPassable(w.idx(x, y)) && sim.regionOf(w.idx(x, y)) === sim.regionOf(v.tile)) {
          v.path = sim.pathfinder.find(v.tile, [w.idx(x, y)]) ?? [];
        }
        v.restUntil = sim.tick + sim.rng.int(200, 600);
      }
    }
    if (v.path.length > 0) {
      const next = v.path[0];
      if (!w.isPassable(next)) {
        v.path = [];
        v.moveProgress = 0;
        continue;
      }
      const diagonal = w.xOf(next) !== w.xOf(v.tile) && w.yOf(next) !== w.yOf(v.tile);
      v.moveProgress += (MOVE_SPEED * 0.85) / (w.moveCost(next) * (diagonal ? Math.SQRT2 : 1));
      if (v.moveProgress >= 1) {
        v.tile = next;
        v.path.shift();
        v.moveProgress = 0;
      }
    }
  }
  caravan.visitors = caravan.visitors.filter((v) => v.tile >= 0);
  if (
    caravan.arrivedTick === undefined &&
    home !== undefined &&
    caravan.visitors.some((v) => w.distance(v.tile, home) <= ARRIVED)
  ) {
    caravan.arrivedTick = sim.tick;
    sim.addLog(
      `Traders from ${FACTIONS[caravan.faction].name} have arrived. Open Trade to deal with them.`,
      'good',
      true,
    );
  }
  if (caravan.visitors.length === 0) {
    sim.caravan = null;
    sim.addLog('The traders have gone on their way.', 'info');
  }
}

// How much of an item the colony can trade: whatever sits in its stockpiles.
export function colonyStock(sim: Simulation, item: number): number {
  const w = sim.world;
  let n = 0;
  for (const i of w.tilesWith('items')) {
    if (w.itemType[i] === item && sim.isStockpile(i)) {
      n += w.itemCount[i];
    }
  }
  return n;
}

// Takes `count` of an item out of the colony's stockpiles.
function takeFromStockpiles(sim: Simulation, item: number, count: number): void {
  const w = sim.world;
  let left = count;
  for (const i of [...w.tilesWith('items')]) {
    if (left <= 0) {
      break;
    }
    if (w.itemType[i] === item && sim.isStockpile(i)) {
      left -= w.takeItem(i, left);
    }
  }
}

// One deal: buy and sell lists of [item, count]. Returns null on success, or why it failed.
export function applyTrade(sim: Simulation, buy: [number, number][], sell: [number, number][]): string | null {
  const caravan = sim.caravan;
  if (!caravan || !tradeOpen(sim)) {
    return 'No traders are here.';
  }
  const price = prices(sim, caravan.faction);
  const silver = SILVER();
  for (const [item, count] of buy) {
    const have = caravan.stock.find((s) => s.item === item)?.count ?? 0;
    if (count < 0 || count > have) {
      return `The traders don't have that many ${itemDef(item).name.toLowerCase()}.`;
    }
  }
  for (const [item, count] of sell) {
    if (count < 0 || item === silver || count > colonyStock(sim, item)) {
      return `The colony doesn't have that many ${itemDef(item).name.toLowerCase()} in its stockpiles.`;
    }
  }
  const cost = buy.reduce((sum, [item, n]) => sum + n * price.buy(item), 0);
  const income = sell.reduce((sum, [item, n]) => sum + n * price.sell(item), 0);
  const balance = dealBalance(cost, income);
  if (balance > colonyStock(sim, silver)) {
    return 'Not enough silver in the stockpiles.';
  }
  if (-balance > caravan.silver) {
    return "The traders can't afford that much.";
  }
  const home = sim.homeTile() ?? caravan.visitors[0].tile;
  for (const [item, count] of sell) {
    if (count > 0) {
      takeFromStockpiles(sim, item, count);
      const line = caravan.stock.find((s) => s.item === item);
      if (line) {
        line.count += count;
      } else {
        caravan.stock.push({ item, count });
      }
    }
  }
  for (const [item, count] of buy) {
    if (count > 0) {
      caravan.stock.find((s) => s.item === item)!.count -= count;
      sim.world.dropItemNear(home, item, count, undefined, NORMAL_QUALITY);
    }
  }
  caravan.stock = caravan.stock.filter((s) => s.count > 0);
  if (balance > 0) {
    takeFromStockpiles(sim, silver, balance);
  } else if (balance < 0) {
    sim.world.dropItemNear(home, silver, -balance);
  }
  // The traders' purse takes what the colony pays (or pays out what it receives).
  caravan.silver += balance;
  // A good deal for both sides warms relations, a little at a time.
  const gain = Math.min(5, Math.floor((cost + income) / 80));
  if (gain > 0) {
    sim.goodwill[caravan.faction] = Math.min(100, goodwillOf(sim, caravan.faction) + gain);
  }
  sim.addLog(
    `Traded with ${FACTIONS[caravan.faction].name}: ${balance > 0 ? `paid ${balance}` : `received ${-balance}`} silver.`,
    'good',
  );
  return null;
}

// Everything the colony could put on the table, by item.
export function tradableItems(): number[] {
  return ITEMS.filter((i) => i.key !== 'silver').map((i) => i.id);
}
