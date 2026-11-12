import { MOVE_SPEED, TICKS_PER_HOUR } from './constants';
import { artBeauty } from './art';
import { FACTIONS, ITEMS, NONE, NORMAL_QUALITY, featureDef, itemDef, itemId } from './defs';
import type { Simulation } from './simulation';
import { qualityFactor } from './apparel';
import type { World } from './world';

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
// Raiders start out hostile; the hill clans start out guarded (they keep to themselves at first).
export const HOSTILE_GOODWILL = -50;
const GUARDED_GOODWILL = 5;
// The hill clans keep to themselves until the colony has dealt with them: they trade and ask favours only
// from this goodwill (the Meadow Kin from 0).
const KNOWN_GOODWILL = 10;
export const tradeFloor = (faction: number): number => (FACTIONS[faction]?.key === 'hollowstone' ? KNOWN_GOODWILL : 0);
// Where each faction's goodwill starts, and drifts back to.
export const startingGoodwill = (faction: number): number =>
  FACTIONS[faction]?.hostile
    ? HOSTILE_GOODWILL
    : FACTIONS[faction]?.key === 'hollowstone'
      ? GUARDED_GOODWILL
      : STARTING_GOODWILL;

// Silver changing hands for a deal, rounded in the traders' favour (so a single cheap item can't be
// sold for double its price).
export const dealBalance = (cost: number, income: number) => Math.ceil(cost) - Math.floor(income);
// How long a caravan stays, counted from when it sets out.
const VISIT_HOURS = 30;
// Time allowed for the walk in from the edge (a Large map takes about 3 hours).
const WALK_IN_HOURS = 6;
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
// Finer goods they bring once the colony has been around a while and has silver to spend.
const LATER_WARES: [string, number, number][] = [
  ['fineMeal', 0, 8],
  ['toolKit', 0, 2],
  ['iron', 0, 15],
  ['crossbow', 0, 1],
  ['scaleArmor', 0, 1],
];
const LATER_FROM_DAY = 30;
// The hill clans deal in metal and stone.
const HILL_WARES: [string, number, number][] = [
  ['iron', 10, 30],
  ['toolKit', 1, 3],
  ['stoneBlocks', 40, 120],
  ['bricks', 0, 60],
  ['meal', 0, 8],
  ['leather', 0, 10],
  ['knife', 0, 2],
  ['spear', 0, 2],
  ['recurveBow', 0, 1],
];
const HILL_LATER_WARES: [string, number, number][] = [
  ['ironSword', 0, 1],
  ['ironMail', 0, 1],
  ['crossbow', 0, 1],
  ['scaleArmor', 0, 1],
];

// What a faction's traders bring, by the colony's age.
export function waresOf(sim: Simulation, faction: number): [string, number, number][] {
  const hill = FACTIONS[faction]?.key === 'hollowstone';
  const later = sim.day >= LATER_FROM_DAY;
  if (hill) {
    return later ? [...HILL_WARES, ...HILL_LATER_WARES] : HILL_WARES;
  }
  return later ? [...WARES, ...LATER_WARES] : WARES;
}

// Friendly factions on speaking terms, who might send traders.
const tradingPartners = (sim: Simulation) =>
  FACTIONS.filter((f) => !f.hostile && goodwillOf(sim, f.id) >= tradeFloor(f.id));

// How keen the neighbours are to send a caravan: more the better the best of them thinks of the colony.
export const caravanWeight = (sim: Simulation): number =>
  sim.caravan ? 0 : Math.max(0, ...tradingPartners(sim).map((f) => 0.6 + goodwillOf(sim, f.id) / 100));
// Caravans grow with the colony: more goods and a fuller purse, up to three times the first ones.
const caravanScale = (sim: Simulation) => 1 + Math.min(sim.day, 120) / 60;

export const goodwillOf = (sim: Simulation, faction: number): number =>
  sim.goodwill[faction] ?? startingGoodwill(faction);

// Moves a faction's goodwill, kept within -100..100.
export function shiftGoodwill(sim: Simulation, faction: number, delta: number): void {
  sim.goodwill[faction] = Math.max(-100, Math.min(100, Math.round(goodwillOf(sim, faction) + delta)));
}

export function standingLabel(goodwill: number, hostile: boolean): string {
  if (hostile) {
    return goodwill >= -25 ? 'Uneasy' : 'Hostile';
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
  // Whoever comes, the better they think of the colony the likelier.
  const partners = tradingPartners(sim);
  let roll = sim.rng.next() * partners.reduce((sum, f) => sum + 0.6 + goodwillOf(sim, f.id) / 100, 0);
  const faction = partners.find((f) => (roll -= 0.6 + goodwillOf(sim, f.id) / 100) <= 0) ?? partners[0];
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
  const names = sim.unusedNames(faction.names);
  const visitors: Visitor[] = [];
  for (let n = 0; n < 3; n++) {
    const name = names.splice(sim.rng.int(0, names.length - 1), 1)[0] ?? 'Trader';
    visitors.push({ id: sim.nextVisitorId++, name, tile: edge, path: [], moveProgress: 0, restUntil: 0 });
  }
  const scale = caravanScale(sim);
  const stock = waresOf(sim, faction.id)
    .map(([key, lo, hi]) => ({ item: itemId(key), count: Math.round(sim.rng.int(lo, hi) * scale) }))
    .filter((s) => s.count > 0);
  sim.caravan = {
    faction: faction.id,
    visitors,
    stock,
    silver: Math.round(sim.rng.int(200, 400) * scale),
    // Their stay counts from when they reach the colony (set then); until then, a cap for a party that
    // never gets there.
    leaveAt: sim.tick + (VISIT_HOURS + WALK_IN_HOURS) * TICKS_PER_HOUR,
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
    // (Off at once: a trader resting stood about for up to three hours after packing up, and no new caravan could
    // come while they did.)
    for (const v of caravan.visitors) {
      v.path = [];
      v.restUntil = 0;
    }
    sim.addLog(`The traders from ${FACTIONS[caravan.faction].name} are packing up.`, 'info');
  }
  for (const v of caravan.visitors) {
    stepVisitor(sim, v, caravan.leaving, home);
  }
  caravan.visitors = caravan.visitors.filter((v) => v.tile >= 0);
  if (
    caravan.arrivedTick === undefined &&
    // (Not once they've packed up: in on the hour their time ran out, "have arrived, open Trade" while closed.)
    !caravan.leaving &&
    home !== undefined &&
    caravan.visitors.some((v) => w.distance(v.tile, home) <= ARRIVED)
  ) {
    caravan.arrivedTick = sim.tick;
    caravan.leaveAt = sim.tick + VISIT_HOURS * TICKS_PER_HOUR;
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
  for (const i of w.tilesWithItem(item)) {
    if (sim.isStockpile(i)) {
      n += w.itemCount[i];
    }
  }
  return n;
}

// Takes `count` of an item out of the colony's stockpiles (from the given stacks first, if any).
export function takeFromStockpiles(sim: Simulation, item: number, count: number, order?: number[]): void {
  const w = sim.world;
  let left = count;
  for (const i of [...(order ?? []), ...w.tilesWithItem(item)]) {
    if (left <= 0) {
      break;
    }
    if (w.itemType[i] === item && sim.isStockpile(i)) {
      left -= w.takeItem(i, left);
    }
  }
}

// How much of its full price a stack fetches: how well it was made, how worn it is (clothes, armor,
// tools), and whether it's about to spoil. A normal, unworn, fresh one fetches the full price.
export function condition(w: World, i: number): number {
  const def = itemDef(w.itemType[i]);
  let factor = qualityFactor(w.quality[i]) / qualityFactor(NORMAL_QUALITY);
  if (def.apparel || def.armor || def.tool) {
    factor *= 0.3 + 0.7 * Math.max(0, Math.min(1, w.fresh[i]));
  } else if (def.shelfLife !== undefined && w.fresh[i] < SPOILING_DAYS) {
    factor *= 0.5;
  }
  return factor;
}
// Food with less than this many days left is about to spoil, and sells for half.
const SPOILING_DAYS = 1;

// What the traders would pay for an item from the stockpiles, stack by stack, the worst first (that's
// the order it goes in, so the best is kept back): each lot's count and price per unit.
export function saleLots(sim: Simulation, item: number): { tile: number; count: number; price: number }[] {
  const w = sim.world;
  const caravan = sim.caravan;
  const base = caravan ? prices(sim, caravan.faction).sell(item) : itemDef(item).value;
  const lots: { tile: number; count: number; price: number }[] = [];
  for (const i of w.tilesWithItem(item)) {
    if (sim.isStockpile(i)) {
      lots.push({ tile: i, count: w.itemCount[i], price: base * condition(w, i) });
    }
  }
  return lots.sort((a, b) => a.price - b.price || a.tile - b.tile);
}

// What selling `count` of these lots fetches (worst first).
export function lotsValue(lots: { count: number; price: number }[], count: number): number {
  let left = count;
  let total = 0;
  for (const lot of lots) {
    const n = Math.min(left, lot.count);
    total += n * lot.price;
    left -= n;
    if (left <= 0) {
      break;
    }
  }
  return total;
}

// Of `count` sold from these lots (worst first), how many were as good as new: full price, at `base` each.
function asNewCount(lots: { count: number; price: number }[], count: number, base: number): number {
  let left = count;
  let n = 0;
  for (const lot of lots) {
    const taken = Math.min(left, lot.count);
    if (lot.price >= base - 1e-9) {
      n += taken;
    }
    left -= taken;
    if (left <= 0) {
      break;
    }
  }
  return n;
}

function mergeLines(lines: [number, number][]): [number, number][] {
  const total = new Map<number, number>();
  for (const [item, count] of lines) {
    total.set(item, (total.get(item) ?? 0) + count);
  }
  return [...total];
}

// One deal: buy and sell lists of [item, count]. Returns null on success, or why it failed.
export function applyTrade(sim: Simulation, buy: [number, number][], sell: [number, number][]): string | null {
  const caravan = sim.caravan;
  if (!caravan || !tradeOpen(sim)) {
    return 'No traders are here.';
  }
  // Fold repeated lines for the same item together, so each item is checked against its full count.
  buy = mergeLines(buy);
  sell = mergeLines(sell);
  const price = prices(sim, caravan.faction);
  const silver = SILVER();
  for (const [item, count] of buy) {
    const have = caravan.stock.find((s) => s.item === item)?.count ?? 0;
    // (Whole numbers only: NaN or a fraction slipped past a check for less than none or more than there is.)
    if (!Number.isInteger(count) || count < 0 || count > have) {
      return `The traders don't have that many ${itemDef(item).name.toLowerCase()}.`;
    }
  }
  for (const [item, count] of sell) {
    if (!Number.isInteger(count) || count < 0 || item === silver || count > colonyStock(sim, item)) {
      return `The colony doesn't have that many ${itemDef(item).name.toLowerCase()} in its stockpiles.`;
    }
  }
  const cost = buy.reduce((sum, [item, n]) => sum + n * price.buy(item), 0);
  // Sold as it stands: a fine piece fetches more, a worn or spoiling one less, and the worst goes first.
  const lots = new Map(sell.map(([item]) => [item, saleLots(sim, item)]));
  const income = sell.reduce((sum, [item, n]) => sum + lotsValue(lots.get(item)!, n), 0);
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
      takeFromStockpiles(
        sim,
        item,
        count,
        lots.get(item)!.map((l) => l.tile),
      );
      // What was as good as new joins their wares (so a sale can be bought back); what was worn, spoiling or
      // poorly made goes in their packs. (Their wares are sold as new: a worn tunic or a spoiling meal came back
      // fresh.)
      const asNew = asNewCount(lots.get(item)!, count, price.sell(item));
      const line = caravan.stock.find((s) => s.item === item);
      if (asNew <= 0) {
        // (Nothing to add.)
      } else if (line) {
        line.count += asNew;
      } else {
        caravan.stock.push({ item, count: asNew });
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
    shiftGoodwill(sim, caravan.faction, gain);
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

// ---- Art ----

// Sculptures are sold where they stand: the traders pay in silver and carry the piece off. Memorials
// aren't for sale.
export interface ArtOffer {
  tile: number;
  name: string;
  title: string;
  artist: string;
  quality: number;
  price: number;
}

// What the visiting traders would pay for a piece: its worth by size, scaled by how well it came out,
// less their cut (smaller the better they think of the colony).
export function artPrice(sim: Simulation, tile: number): number {
  const art = sim.artworkAt(tile);
  const caravan = sim.caravan;
  const def = featureDef(sim.world.feature[tile]);
  if (!art || !caravan || def.value <= 0) {
    return 0;
  }
  const g = Math.max(-50, Math.min(100, goodwillOf(sim, caravan.faction)));
  return Math.round(((def.value * artBeauty(art.quality)) / artBeauty(NORMAL_QUALITY)) * (0.5 + g * 0.002));
}

// Every piece the colony could sell to the traders here now, most valuable first.
export function artForSale(sim: Simulation): ArtOffer[] {
  if (!tradeOpen(sim)) {
    return [];
  }
  const offers: ArtOffer[] = [];
  for (const [tile] of sim.artworks) {
    const art = sim.artworkAt(tile);
    const price = art ? artPrice(sim, tile) : 0;
    if (art && price > 0) {
      const name = featureDef(sim.world.feature[tile]).name;
      offers.push({ tile, name, title: art.title, artist: art.artist, quality: art.quality, price });
    }
  }
  return offers.sort((a, b) => b.price - a.price);
}

// Sells the sculpture on a tile. Returns null on success, or why it couldn't be done.
export function sellArt(sim: Simulation, tile: number): string | null {
  const caravan = sim.caravan;
  if (!caravan || !tradeOpen(sim)) {
    return 'No traders are here.';
  }
  const art = sim.artworkAt(tile);
  const price = artPrice(sim, tile);
  if (!art || price <= 0) {
    return "That isn't a piece the traders will buy.";
  }
  if (price > caravan.silver) {
    return "The traders can't afford that piece.";
  }
  const name = featureDef(sim.world.feature[tile]).name.toLowerCase();
  sim.world.setFeature(tile, NONE);
  // Any order on the piece (to take it down) goes with it, or builders would start on the floor.
  sim.world.designation[tile] = 0;
  sim.world.markDirty(tile);
  sim.artworks.delete(tile);
  caravan.silver -= price;
  sim.world.dropItemNear(sim.homeTile() ?? tile, SILVER(), price);
  shiftGoodwill(sim, caravan.faction, 3);
  sim.stats.artSold = (sim.stats.artSold ?? 0) + 1;
  sim.addLog(
    `${FACTIONS[caravan.faction].name} bought ${art.artist}'s ${name}, “${art.title}”, for ${price} silver.`,
    'good',
    true,
  );
  return null;
}

// A visitor's tick: on their way out, to the map edge and gone (their tile set to -1); otherwise standing
// about near the middle of the colony, moving now and then. (Traders, and an envoy waiting on an answer.)
export function stepVisitor(sim: Simulation, v: Visitor, leaving: boolean, home: number | undefined): void {
  const w = sim.world;
  if (v.path.length === 0 && sim.tick >= v.restUntil) {
    if (leaving) {
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
      return;
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
