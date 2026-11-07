import { addQuarry, maxHp } from './animals';
import { TICKS_PER_HOUR, populationFor } from './constants';
import { FACTIONS, itemDef, itemId, quantity, weaponDef } from './defs';
import type { Simulation } from './simulation';
import { STARTING_GOODWILL, colonyStock, goodwillOf, takeFromStockpiles } from './trade';

// The wider world: what the friendly faction asks of the colony, the gifts the colony sends to win them
// over, and the tribute that buys a few days' peace from raiders.

export type RequestKind = 'deliver' | 'hunt';

export interface FactionRequest {
  faction: number;
  kind: RequestKind;
  // Deliveries: what and how many.
  item: number;
  count: number;
  // Hunts: the beast's animal id.
  quarry: number;
  // When the request lapses (tick).
  until: number;
  // What they'll give: silver, or a new colonist instead; and goodwill either way.
  silver: number;
  recruit: boolean;
  goodwill: number;
}

export interface Diplomacy {
  request: FactionRequest | null;
  // The earliest day the next request can come.
  nextRequestDay: number;
  // Hostile faction id → the tick its paid-for peace ends.
  peaceUntil: Record<number, number>;
}

export const freshDiplomacy = (): Diplomacy => ({ request: null, nextRequestDay: 5, peaceUntil: {} });

const DAY = TICKS_PER_HOUR * 24;
// Days to do what's asked.
const DELIVER_DAYS = 4;
const HUNT_DAYS = 3;
// Goodwill: earned by a request done, lost by one turned down or let lapse.
const DONE_GOODWILL = 12;
const DECLINE_GOODWILL = -3;
const LAPSE_GOODWILL = -8;
// Hard feelings fade: goodwill below where it started creeps back, one point every two days.
const MENDING_DAYS = 2;
// Below this the friendly faction won't ask (or trade, or send anything).
export const WARY = 0;
// Silver for one goodwill, before the drop-off as they come to like you anyway.
const SILVER_PER_GOODWILL = 8;
export const GIFT_SIZES = [25, 50, 100] as const;
// Tribute: how long the peace lasts.
export const PEACE_DAYS = 12;

// What they might ask for (item, how many at the start), more as the colony grows.
const DELIVERIES: [string, number][] = [
  ['wood', 60],
  ['meal', 10],
  ['cloth', 20],
  ['leather', 12],
  ['stoneBlocks', 25],
  ['herbalMedicine', 5],
];

const clampGoodwill = (g: number) => Math.max(-100, Math.min(100, Math.round(g)));

export function changeGoodwill(sim: Simulation, faction: number, delta: number): void {
  sim.goodwill[faction] = clampGoodwill(goodwillOf(sim, faction) + delta);
}

export const friendly = () => FACTIONS.filter((f) => !f.hostile);
export const atPeace = (sim: Simulation, faction: number): boolean =>
  (sim.diplomacy.peaceUntil[faction] ?? 0) > sim.tick;
// Whether the friendly faction is on speaking terms with the colony.
export const onGoodTerms = (sim: Simulation, faction: number): boolean => goodwillOf(sim, faction) >= WARY;

const roomToGrow = (sim: Simulation) => sim.living().length < populationFor(sim.world.width).maxColonists;

// Called every in-game hour: a new request now and then (mid-morning), and a lapsed one closed.
export function updateDiplomacy(sim: Simulation): void {
  const d = sim.diplomacy;
  if (Math.floor(sim.hour) === 0 && sim.day % MENDING_DAYS === 0) {
    for (const f of friendly()) {
      if (goodwillOf(sim, f.id) < STARTING_GOODWILL) {
        changeGoodwill(sim, f.id, 1);
      }
    }
  }
  const r = d.request;
  if (r) {
    if (r.kind === 'hunt' && !sim.animals.some((a) => a.id === r.quarry)) {
      complete(sim, `The ${QUARRY_NAME} is dead.`);
    } else if (sim.tick >= r.until) {
      lapse(sim);
    }
    return;
  }
  if (Math.floor(sim.hour) !== 9 || sim.day < d.nextRequestDay) {
    return;
  }
  const faction = friendly().find((f) => onGoodTerms(sim, f.id));
  if (faction) {
    makeRequest(sim, faction.id);
  }
}

// Whether the colony could go after the great boar: a hunter with a bow who can get out into the valley.
function canHunt(sim: Simulation): boolean {
  const outside = sim.outsideRegion();
  return sim
    .living()
    .some(
      (c) =>
        !c.health.downed &&
        c.priorities.hunting > 0 &&
        weaponDef(c.weapon).range > 1 &&
        sim.regionOf(c.tile) === outside,
    );
}

// A new favour asked (a delivery or a hunt, by chance unless `kind` is given).
export function makeRequest(sim: Simulation, faction: number, kind?: RequestKind): void {
  const d = sim.diplomacy;
  const growth = 1 + sim.day / 30;
  const hunt = kind
    ? kind === 'hunt'
    : sim.day >= 6 && sim.story.difficulty !== 'peaceful' && canHunt(sim) && sim.rng.next() < 0.3;
  let r: FactionRequest;
  if (hunt) {
    const beast = addQuarry(sim);
    if (!beast) {
      d.nextRequestDay = sim.day + 1;
      return;
    }
    r = {
      faction,
      kind: 'hunt',
      item: 0,
      count: 0,
      quarry: beast.id,
      until: sim.tick + HUNT_DAYS * DAY,
      silver: Math.round((60 + sim.day * 2) / 5) * 5,
      recruit: false,
      goodwill: DONE_GOODWILL + 3,
    };
  } else {
    // Something the colony has, or is close to having, more often than not.
    const options = DELIVERIES.map(([key, base]) => {
      const item = itemId(key);
      const count = Math.max(1, Math.round(base * growth));
      return { item, count, weight: Math.min(1, colonyStock(sim, item) / count) + 0.15 };
    });
    let roll = sim.rng.next() * options.reduce((sum, o) => sum + o.weight, 0);
    const { item, count } = options.find((o) => (roll -= o.weight) <= 0) ?? options[0];
    r = {
      faction,
      kind: 'deliver',
      item,
      count,
      quarry: -1,
      until: sim.tick + DELIVER_DAYS * DAY,
      silver: Math.max(10, Math.round((itemDef(item).value * count * 1.6) / 5) * 5),
      // Now and then, someone who'd like to join instead of payment.
      recruit: sim.day >= 10 && roomToGrow(sim) && sim.rng.next() < 0.25,
      goodwill: DONE_GOODWILL,
    };
  }
  d.request = r;
  const days = r.kind === 'hunt' ? HUNT_DAYS : DELIVER_DAYS;
  sim.addLog(
    `${FACTIONS[faction].name} ask a favour: ${describeRequest(r)}. They need it within ${days} days (Factions).`,
    'info',
    true,
  );
}

// The beast asked to be hunted.
export const QUARRY_NAME = 'great boar';

export function describeRequest(r: FactionRequest): string {
  const reward = `${r.recruit ? 'one of their own, who would like to join the colony' : `${r.silver} silver`}`;
  return r.kind === 'hunt'
    ? `hunt down the ${QUARRY_NAME} troubling their herds, for ${reward}`
    : `${quantity(r.item, r.count)}, for ${reward}`;
}

function complete(sim: Simulation, what: string): void {
  const d = sim.diplomacy;
  const r = d.request!;
  d.request = null;
  d.nextRequestDay = sim.day + 4 + sim.rng.int(0, 3);
  changeGoodwill(sim, r.faction, r.goodwill);
  sim.stats.requestsDone = (sim.stats.requestsDone ?? 0) + 1;
  const name = FACTIONS[r.faction].name;
  if (r.recruit && roomToGrow(sim)) {
    const c = sim.addWanderer();
    if (c) {
      sim.addLog(`${what} ${name} are grateful: ${c.name} has come to join the colony.`, 'good', true);
      return;
    }
  }
  const home = sim.homeTile() ?? sim.living()[0]?.tile;
  if (home !== undefined && r.silver > 0) {
    sim.world.dropItemNear(home, itemId('silver'), r.silver);
  }
  sim.addLog(`${what} ${name} are grateful, and paid ${r.silver} silver.`, 'good', true);
}

// The beast nobody's after any more: an ordinary boar again, and it moves on.
function releaseQuarry(sim: Simulation, r: FactionRequest): void {
  const beast = r.kind === 'hunt' ? sim.animals.find((a) => a.id === r.quarry) : undefined;
  if (beast) {
    beast.quarry = false;
    beast.hp = Math.min(beast.hp, maxHp(beast));
    beast.leaving = !beast.hunted;
  }
}

function lapse(sim: Simulation): void {
  const d = sim.diplomacy;
  const r = d.request!;
  d.request = null;
  d.nextRequestDay = sim.day + 4 + sim.rng.int(0, 3);
  changeGoodwill(sim, r.faction, LAPSE_GOODWILL);
  sim.stats.requestsFailed = (sim.stats.requestsFailed ?? 0) + 1;
  releaseQuarry(sim, r);
  sim.addLog(`The colony never did what ${FACTIONS[r.faction].name} asked. They're disappointed.`, 'warn', true);
}

// Sends what was asked for (from the stockpiles). Returns why not, if it can't.
export function fulfil(sim: Simulation): string | null {
  const r = sim.diplomacy.request;
  if (!r || r.kind !== 'deliver') {
    return 'Nothing to deliver.';
  }
  const have = colonyStock(sim, r.item);
  if (have < r.count) {
    return `Only ${have} of ${r.count} in the stockpiles.`;
  }
  takeFromStockpiles(sim, r.item, r.count);
  complete(sim, `${FACTIONS[r.faction].name} collected the ${quantity(r.item, r.count)}.`);
  return null;
}

export function decline(sim: Simulation): void {
  const d = sim.diplomacy;
  const r = d.request;
  if (!r) {
    return;
  }
  d.request = null;
  d.nextRequestDay = sim.day + 4 + sim.rng.int(0, 3);
  changeGoodwill(sim, r.faction, DECLINE_GOODWILL);
  sim.stats.requestsFailed = (sim.stats.requestsFailed ?? 0) + 1;
  releaseQuarry(sim, r);
  sim.addLog(`The colony turned down ${FACTIONS[r.faction].name}'s request.`, 'info');
}

// Goodwill a gift of silver would earn: less the better they already think of you.
export function giftGoodwill(sim: Simulation, faction: number, silver: number): number {
  const g = goodwillOf(sim, faction);
  return Math.max(1, Math.round((silver / SILVER_PER_GOODWILL) * Math.max(0.25, (100 - g) / 100)));
}

export function gift(sim: Simulation, faction: number, silver: number): string | null {
  const f = FACTIONS[faction];
  if (!f || f.hostile) {
    return 'They would only take it and come back for more.';
  }
  if (!Number.isInteger(silver) || silver <= 0) {
    return 'A gift has to be something.';
  }
  if (colonyStock(sim, itemId('silver')) < silver) {
    return 'Not enough silver in the stockpiles.';
  }
  const gain = giftGoodwill(sim, faction, silver);
  takeFromStockpiles(sim, itemId('silver'), silver);
  changeGoodwill(sim, faction, gain);
  sim.stats.gifts = (sim.stats.gifts ?? 0) + 1;
  sim.addLog(`The colony sent ${f.name} a gift of ${silver} silver (goodwill +${gain}).`, 'good');
  return null;
}

// What raiders want to leave the colony alone for a while: more as it grows richer and older.
export const tributeCost = (sim: Simulation): number => Math.round((60 + sim.day * 5) / 10) * 10;

export function payTribute(sim: Simulation, faction: number): string | null {
  const f = FACTIONS[faction];
  if (!f || !f.hostile) {
    return 'They are no threat to buy off.';
  }
  const cost = tributeCost(sim);
  if (colonyStock(sim, itemId('silver')) < cost) {
    return `They want ${cost} silver.`;
  }
  takeFromStockpiles(sim, itemId('silver'), cost);
  const d = sim.diplomacy;
  d.peaceUntil[faction] = Math.max(d.peaceUntil[faction] ?? 0, sim.tick) + PEACE_DAYS * DAY;
  sim.stats.tributes = (sim.stats.tributes ?? 0) + 1;
  sim.addLog(`The colony paid ${f.name} ${cost} silver. They'll leave it alone for ${PEACE_DAYS} days.`, 'info', true);
  // Any of theirs attacking now take the silver and go.
  const attacking = sim.enemies.filter((e) => e.faction === faction && e.hp > 0 && !e.fleeing);
  if (attacking.length > 0) {
    for (const e of attacking) {
      e.fleeing = true;
      e.path = [];
    }
    if (sim.raid && !sim.enemies.some((e) => e.hp > 0 && !e.fleeing)) {
      sim.raid.outcome ??= 'withdrew';
    }
    sim.addLog('The raiders take the silver and leave.', 'good');
  }
  return null;
}
