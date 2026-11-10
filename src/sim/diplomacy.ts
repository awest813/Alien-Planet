import { addQuarry, maxHp } from './animals';
import { maybeSendAllies } from './combat';
import { TICKS_PER_HOUR, populationFor } from './constants';
import { FACTIONS, RECIPES, itemDef, itemId, quantity, weaponDef } from './defs';
import type { Expedition } from './expeditions';
import type { Alliance, AllyCall, Dispute, Envoy } from './alliances';
import type { Visitor } from './trade';
import type { Simulation } from './simulation';
import {
  colonyStock,
  goodwillOf,
  shiftGoodwill,
  startingGoodwill,
  takeFromStockpiles,
  tradeFloor,
  waresOf,
} from './trade';

// The wider world: what the friendly faction asks of the colony, the gifts the colony sends to win them
// over, and the tribute that buys a few days' peace from raiders.

// A commission is a delivery of crafted goods, paid for in the neighbours' own goods rather than silver.
export type RequestKind = 'deliver' | 'hunt' | 'commission';

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
  // Commissions: what they pay with instead of silver.
  pay?: { item: number; count: number }[];
}

export interface Diplomacy {
  request: FactionRequest | null;
  // The earliest day the next request can come.
  nextRequestDay: number;
  // Hostile faction id → the tick its paid-for peace ends.
  peaceUntil: Record<number, number>;
  // Until this tick the friendly faction has been paid to send fighters to every raid.
  fightersUntil?: number;
  // Hostile faction id → the tick a truce with them ends (no raids from them until then).
  truceUntil?: Record<number, number>;
  // The friendly faction that asked the last favour, so the neighbours take turns.
  lastAsked?: number;
  // No settler for sale before this day.
  settlerDay?: number;
  // No food to be asked of friends before this day.
  aidDay?: number;
  // The two friendly factions quarrelling, an envoy waiting on an answer, an alliance and its call for help
  // (see alliances.ts).
  dispute?: Dispute | null;
  nextDisputeDay?: number;
  envoy?: Envoy | null;
  nextEnvoyDay?: number;
  // Visitors on their way back to the map edge (an envoy with the colony's answer).
  departing?: Visitor[];
  alliance?: Alliance | null;
  call?: AllyCall | null;
  // Colonists off the map (see expeditions.ts).
  expeditions?: Expedition[];
  nextExpeditionId?: number;
}

export const freshDiplomacy = (): Diplomacy => ({ request: null, nextRequestDay: 5, peaceUntil: {} });

const DAY = TICKS_PER_HOUR * 24;
// Days to do what's asked.
const DELIVER_DAYS = 5;
const HUNT_DAYS = 3;
// Goodwill: earned by a request done, lost by one turned down or let lapse.
const DONE_GOODWILL = 12;
const DECLINE_GOODWILL = -3;
const LAPSE_GOODWILL = -8;
// Hard feelings fade: goodwill below where it started creeps back, one point every two days.
const MENDING_DAYS = 2;
// And warm feelings cool unless kept up: above this, goodwill slips a point every few days, so a close
// friendship takes favours, trade or gifts now and then.
const KEPT_UP_ABOVE = 40;
const COOLING_DAYS = 3;
// Commissions: crafted goods, from the second week, given a little longer.
const COMMISSION_FROM_DAY = 12;
const COMMISSION_CHANCE = 0.3;
const COMMISSION_DAYS = 7;
// What they might commission (item, how many at the start).
const COMMISSIONS: [string, number][] = [
  ['tunic', 2],
  ['parka', 1],
  ['toolKit', 2],
  ['fineMeal', 5],
  ['bread', 10],
  ['leatherArmor', 1],
  ['recurveBow', 1],
  ['longbow', 1],
  ['bricks', 25],
  ['ironSword', 1],
];

// Below this the friendly faction won't ask (or trade, or send anything).
export const WARY = 0;
// Silver for one goodwill, before the drop-off as they come to like you anyway.
const SILVER_PER_GOODWILL = 8;
export const GIFT_SIZES = [25, 50, 100] as const;
// Tribute: how long the peace lasts.
export const PEACE_DAYS = 12;

// What they might ask for (item, how many at the start), more as the colony grows.
const DELIVERIES: [string, number][] = [
  ['wood', 40],
  ['meal', 8],
  ['cloth', 15],
  ['leather', 10],
  ['stoneBlocks', 20],
  ['herbalMedicine', 4],
];

// Close friends drift apart faster: above this, goodwill slips a point every other day as well.
const CLOSE_ABOVE = 75;

export const changeGoodwill = shiftGoodwill;

export const friendly = () => FACTIONS.filter((f) => !f.hostile);
// Paid off, or at truce.
export const atPeace = (sim: Simulation, faction: number): boolean =>
  (sim.diplomacy.peaceUntil[faction] ?? 0) > sim.tick || truceDays(sim, faction) > 0;
// Whether the friendly faction is on speaking terms with the colony.
export const onGoodTerms = (sim: Simulation, faction: number): boolean =>
  goodwillOf(sim, faction) >= tradeFloor(faction);

// Away colonists still have their place.
const roomToGrow = (sim: Simulation) => sim.headcount() < populationFor(sim.world.width).maxColonists;

// Called every in-game hour: a new request now and then (mid-morning), and a lapsed one closed.
export function updateDiplomacy(sim: Simulation): void {
  const d = sim.diplomacy;
  if (Math.floor(sim.hour) === 0) {
    for (const f of friendly()) {
      const g = goodwillOf(sim, f.id);
      if (g < startingGoodwill(f.id) && sim.day % MENDING_DAYS === 0) {
        changeGoodwill(sim, f.id, 1);
      } else if ((g > CLOSE_ABOVE && sim.day % 2 === 0) || (g > KEPT_UP_ABOVE && sim.day % COOLING_DAYS === 0)) {
        changeGoodwill(sim, f.id, -1);
      }
    }
    updateHostility(sim);
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
  // The neighbours take turns to ask.
  const asking = friendly().filter((f) => onGoodTerms(sim, f.id));
  const faction = asking.find((f) => f.id !== d.lastAsked) ?? asking[0];
  if (faction) {
    d.lastAsked = faction.id;
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
  // More as the colony grows, up to three times the first asks (by day 80).
  const growth = 1 + Math.min(sim.day, 80) / 40;
  const hunt = kind
    ? kind === 'hunt'
    : sim.day >= 6 && sim.story.difficulty !== 'peaceful' && canHunt(sim) && sim.rng.next() < 0.3;
  let r: FactionRequest;
  const commission =
    !hunt && (kind ? kind === 'commission' : sim.day >= COMMISSION_FROM_DAY && sim.rng.next() < COMMISSION_CHANCE);
  const crafted = commission ? pickCommission(sim, growth) : undefined;
  if (crafted) {
    // Paid in their own goods, worth half as much again as what they ask for.
    const worth = itemDef(crafted.item).value * crafted.count * 1.5;
    r = {
      faction,
      kind: 'commission',
      item: crafted.item,
      count: crafted.count,
      quarry: -1,
      until: sim.tick + COMMISSION_DAYS * DAY,
      silver: 0,
      recruit: false,
      goodwill: DONE_GOODWILL,
      pay: payInKind(sim, faction, worth),
    };
  } else if (hunt) {
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
      silver: Math.round((60 + Math.min(sim.day, 80) * 2) / 5) * 5,
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
  const days = r.kind === 'hunt' ? HUNT_DAYS : r.kind === 'commission' ? COMMISSION_DAYS : DELIVER_DAYS;
  sim.addLog(
    `${FACTIONS[faction].name} ask a favour: ${describeRequest(r)}. They need it within ${days} days (Factions).`,
    'info',
    true,
  );
}

// The beast asked to be hunted.
export const QUARRY_NAME = 'great boar';

export function describeRequest(r: FactionRequest): string {
  const reward = r.pay
    ? r.pay.map((p) => quantity(p.item, p.count)).join(' and ')
    : `${r.recruit ? 'one of their own, who would like to join the colony' : `${r.silver} silver`}`;
  if (r.kind === 'commission') {
    return `${quantity(r.item, r.count)} made for them, paid in ${reward}`;
  }
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
  if (r.pay) {
    for (const p of r.pay) {
      if (home !== undefined) {
        sim.world.dropItemNear(home, p.item, p.count);
      }
    }
    sim.addLog(
      `${what} ${name} are pleased, and paid in ${r.pay.map((p) => quantity(p.item, p.count)).join(' and ')}.`,
      'good',
      true,
    );
    return;
  }
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
  if (!r || r.kind === 'hunt') {
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
  const gain = Math.max(1, Math.round((silver / SILVER_PER_GOODWILL) * Math.max(0.25, (100 - g) / 100)));
  // (No higher than it goes.)
  return Math.max(0, Math.min(gain, 100 - g));
}

export function gift(sim: Simulation, faction: number, silver: number): string | null {
  const f = FACTIONS[faction];
  if (!f || f.hostile) {
    return 'They would only take it and come back for more.';
  }
  if (!Number.isInteger(silver) || silver <= 0) {
    return 'A gift has to be something.';
  }
  const gain = giftGoodwill(sim, faction, silver);
  if (gain <= 0) {
    return `${f.name} already think the world of the colony: keep the silver.`;
  }
  if (colonyStock(sim, itemId('silver')) < silver) {
    return 'Not enough silver in the stockpiles.';
  }
  takeFromStockpiles(sim, itemId('silver'), silver);
  changeGoodwill(sim, faction, gain);
  sim.stats.gifts = (sim.stats.gifts ?? 0) + 1;
  sim.addLog(`The colony sent ${f.name} a gift of ${silver} silver (goodwill +${gain}).`, 'good');
  return null;
}

// What raiders want to leave the colony alone for a while: more as it grows richer and older (up to 460).
export const tributeCost = (sim: Simulation): number => Math.round((60 + Math.min(sim.day, 80) * 5) / 10) * 10;

// Hiring the friendly faction's fighters: paid by the same scale as tribute, they come to every raid (and
// siege) for twelve days, sooner and more of them than when they come of their own accord. They won't take
// silver to fight for a colony they think little of.
export const HIRE_DAYS = 12;
export const HIRE_GOODWILL = 30;
export const hireCost = tributeCost;
export const fightersHired = (sim: Simulation): boolean => (sim.diplomacy.fightersUntil ?? 0) > sim.tick;

export function hireFighters(sim: Simulation, faction: number): string | null {
  const f = FACTIONS[faction];
  // (Only the Meadow Kin hire out their fighters; an ally's come anyway, see alliances.ts.)
  if (!f || f.hostile || f.key !== 'meadowKin') {
    return "They won't fight for the colony.";
  }
  if (goodwillOf(sim, faction) < HIRE_GOODWILL) {
    return `${f.name} won't fight for a colony they think so little of (goodwill ${HIRE_GOODWILL} needed).`;
  }
  const cost = hireCost(sim);
  if (colonyStock(sim, itemId('silver')) < cost) {
    return `They want ${cost} silver.`;
  }
  takeFromStockpiles(sim, itemId('silver'), cost);
  const d = sim.diplomacy;
  d.fightersUntil = Math.max(d.fightersUntil ?? 0, sim.tick) + HIRE_DAYS * DAY;
  sim.stats.hired = (sim.stats.hired ?? 0) + 1;
  // Hired in the thick of it: they come to this raid too.
  if (sim.raid && !sim.raid.outcome && sim.raid.allies === undefined && sim.allies.length === 0) {
    maybeSendAllies(sim);
  }
  sim.addLog(
    `The colony paid ${f.name} ${cost} silver: their fighters will come to every raid for the next ${HIRE_DAYS} days.`,
    'good',
    true,
  );
  return null;
}

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

// Something the colony knows how to make (by research) and already makes: it has at least a third of what's
// asked in store. Otherwise they ask for something else.
function pickCommission(sim: Simulation, growth: number): { item: number; count: number } | undefined {
  const options = COMMISSIONS.map(([key, base]) => ({
    item: itemId(key),
    count: Math.max(1, Math.round(base * growth)),
  }))
    .filter(({ item }) => RECIPES.some((r) => r.product.item === item && !r.mend && sim.isResearched(r.research)))
    .filter((o) => colonyStock(sim, o.item) * 3 >= o.count)
    .map((o) => ({ ...o, weight: Math.min(1, colonyStock(sim, o.item) / o.count) + 0.3 }));
  if (options.length === 0) {
    return undefined;
  }
  let roll = sim.rng.next() * options.reduce((sum, o) => sum + o.weight, 0);
  return options.find((o) => (roll -= o.weight) <= 0) ?? options[0];
}

// Goods from a faction's own stores worth about `worth` silver: one or two kinds of what their traders carry.
function payInKind(sim: Simulation, faction: number, worth: number): { item: number; count: number }[] {
  const wares = waresOf(sim, faction)
    .map(([key]) => itemId(key))
    .filter((item) => itemDef(item).value > 0 && itemDef(item).value <= worth);
  if (wares.length === 0) {
    return [{ item: itemId('silver'), count: Math.round(worth) }];
  }
  const first = sim.rng.pick(wares);
  const rest = wares.filter((i) => i !== first);
  const second = rest.length > 0 && worth >= 60 ? sim.rng.pick(rest) : undefined;
  const lines =
    second === undefined
      ? [{ item: first, share: 1 }]
      : [
          { item: first, share: 0.6 },
          { item: second, share: 0.4 },
        ];
  return lines
    .map(({ item, share }) => ({ item, count: Math.max(1, Math.round((worth * share) / itemDef(item).value)) }))
    .filter((p) => p.count > 0);
}

// ---- Raiders' goodwill ----
// The raider factions start out hostile, and how the colony treats their people moves that: letting captives
// go (or selling them back) softens them, starving them hardens them. Feelings drift back over time. The
// warier they are the more often and the harder they raid; softened enough, they'll agree to a truce.

export const hostile = () => FACTIONS.filter((f) => f.hostile);
// How each dealing with a raider faction's people changes their goodwill.
export const HOSTILE_DEALINGS = {
  released: 8,
  releasedWounded: 4,
  ransomed: 5,
  recruited: -4,
  starved: -15,
  leftToDie: -1,
  executed: -25,
} as const;
// Hostile feelings drift back to where they started, a point every few days.
const HOSTILE_DRIFT_DAYS = 4;
// A truce: on offer at this goodwill, it holds this long, and it spends this much of their goodwill.
export const TRUCE_GOODWILL = -25;
export const TRUCE_DAYS = 18;
const TRUCE_SPENDS = 20;

export function hostileDealing(sim: Simulation, faction: number, how: keyof typeof HOSTILE_DEALINGS): void {
  if (!FACTIONS[faction]?.hostile) {
    return;
  }
  const before = goodwillOf(sim, faction);
  changeGoodwill(sim, faction, HOSTILE_DEALINGS[how]);
  if (before < TRUCE_GOODWILL && goodwillOf(sim, faction) >= TRUCE_GOODWILL && truceDays(sim, faction) === 0) {
    sim.addLog(`${FACTIONS[faction].name} might now agree to a truce (Factions).`, 'good', true);
  }
}

export const truceDays = (sim: Simulation, faction: number): number =>
  Math.max(0, Math.ceil(((sim.diplomacy.truceUntil?.[faction] ?? 0) - sim.tick) / DAY));

// Once a day: hostile feelings drift back, and an ended truce is noted.
function updateHostility(sim: Simulation): void {
  for (const f of hostile()) {
    const g = goodwillOf(sim, f.id);
    const start = startingGoodwill(f.id);
    if (g !== start && sim.day % HOSTILE_DRIFT_DAYS === 0) {
      changeGoodwill(sim, f.id, g > start ? -1 : 1);
    }
    const until = sim.diplomacy.truceUntil?.[f.id];
    if (until !== undefined && until <= sim.tick) {
      delete sim.diplomacy.truceUntil![f.id];
      sim.addLog(`The truce with ${FACTIONS[f.id].name} has ended.`, 'warn', true);
    }
  }
}

export function proposeTruce(sim: Simulation, faction: number): string | null {
  const f = FACTIONS[faction];
  if (!f || !f.hostile) {
    return 'There is no quarrel with them to settle.';
  }
  if (truceDays(sim, faction) > 0) {
    return `There is already a truce with ${f.name}.`;
  }
  if (goodwillOf(sim, faction) < TRUCE_GOODWILL) {
    return `${f.name} won't hear of a truce yet (goodwill ${TRUCE_GOODWILL} needed). Letting their people go helps.`;
  }
  const d = sim.diplomacy;
  d.truceUntil = { ...d.truceUntil, [faction]: sim.tick + TRUCE_DAYS * DAY };
  changeGoodwill(sim, faction, -TRUCE_SPENDS);
  sim.stats.truces = (sim.stats.truces ?? 0) + 1;
  sim.addLog(`${f.name} have agreed to a truce: no raids from them for ${TRUCE_DAYS} days.`, 'good', true);
  // Any of theirs attacking now go home.
  const attacking = sim.enemies.filter((e) => e.faction === faction && e.hp > 0 && !e.fleeing);
  for (const e of attacking) {
    e.fleeing = true;
    e.path = [];
  }
  if (attacking.length > 0 && sim.raid && !sim.enemies.some((e) => e.hp > 0 && !e.fleeing)) {
    sim.raid.outcome ??= 'withdrew';
  }
  return null;
}

// How hard a raider faction presses the colony: 1 where their goodwill started, up to 1.2 at its worst and
// down to 0.8 once they've softened. It scales their share of the raids and how many come.
export const raidPressure = (sim: Simulation, faction: number): number =>
  Math.max(0.8, Math.min(1.2, 1 + (startingGoodwill(faction) - goodwillOf(sim, faction)) / 250));

// Which raider faction comes: the warier, the likelier.
export function pickRaider(sim: Simulation, factions: { id: number }[]): number {
  let roll = sim.rng.next() * factions.reduce((sum, f) => sum + raidPressure(sim, f.id), 0);
  return (factions.find((f) => (roll -= raidPressure(sim, f.id)) <= 0) ?? factions[0]).id;
}

// ---- Settlers ----
// The Meadow Kin will send a willing settler to a colony they like, for silver to set them up: one every
// so often, while the valley has room.

// Friends will send food in hard times, once in a while, for some of the goodwill the colony has built up: three
// days' food for everyone, as potatoes and dried meat.
export const AID_GOODWILL = 50;
export const AID_COST = 20;
const AID_GAP_DAYS = 10;
const AID_DAYS_OF_FOOD = 3;
// Nutrition a colonist eats in a day.
const DAILY_FOOD = 1.4;
export const aidDays = (sim: Simulation): number => Math.max(0, (sim.diplomacy.aidDay ?? 0) - sim.day);

export function askForFood(sim: Simulation, faction: number): string | null {
  const f = FACTIONS[faction];
  if (!f || f.hostile) {
    return 'They would never help.';
  }
  if (goodwillOf(sim, faction) < AID_GOODWILL) {
    return `${f.name} would help a closer friend (goodwill ${AID_GOODWILL} needed).`;
  }
  if (aidDays(sim) > 0) {
    const wait = aidDays(sim);
    return `They sent food not long ago (again in ${wait} day${wait === 1 ? '' : 's'}).`;
  }
  const home = sim.homeTile();
  if (home === undefined) {
    return 'There is nowhere to bring it.';
  }
  // Half of it as potatoes, half as dried meat, by nutrition.
  const need = sim.living().length * AID_DAYS_OF_FOOD * DAILY_FOOD;
  const potatoes = Math.ceil(need / 2 / itemDef(itemId('potatoes')).nutrition);
  const meat = Math.ceil(need / 2 / itemDef(itemId('driedMeat')).nutrition);
  sim.world.dropItemNear(home, itemId('potatoes'), potatoes);
  sim.world.dropItemNear(home, itemId('driedMeat'), meat);
  changeGoodwill(sim, faction, -AID_COST);
  sim.diplomacy.aidDay = sim.day + AID_GAP_DAYS;
  sim.stats.aid = (sim.stats.aid ?? 0) + 1;
  sim.addLog(
    `${f.name} sent food to tide the colony over: ${potatoes} potatoes and ${meat} dried meat (goodwill −${AID_COST}).`,
    'good',
    true,
  );
  return null;
}

export const SETTLER_GOODWILL = 30;
const SETTLER_GAP_DAYS = 8;
export const settlerCost = (sim: Simulation): number => Math.round((250 + Math.min(sim.day, 120) * 3) / 10) * 10;
export const settlerDays = (sim: Simulation): number => Math.max(0, (sim.diplomacy.settlerDay ?? 0) - sim.day);

export function buySettler(sim: Simulation, faction: number): string | null {
  const f = FACTIONS[faction];
  if (!f || f.hostile || f.key !== 'meadowKin') {
    return 'They have nobody to spare.';
  }
  if (!roomToGrow(sim)) {
    return 'The colony has no room for more.';
  }
  if (goodwillOf(sim, faction) < SETTLER_GOODWILL) {
    return `${f.name} won't send one of their own to a colony they hardly know (goodwill ${SETTLER_GOODWILL} needed).`;
  }
  if (settlerDays(sim) > 0) {
    const wait = settlerDays(sim);
    return `Nobody else is ready to leave for a while (${wait} day${wait === 1 ? '' : 's'}).`;
  }
  const cost = settlerCost(sim);
  if (colonyStock(sim, itemId('silver')) < cost) {
    return `They want ${cost} silver to set a settler up.`;
  }
  const c = sim.addWanderer();
  if (!c) {
    return 'No way into the valley for them.';
  }
  takeFromStockpiles(sim, itemId('silver'), cost);
  sim.diplomacy.settlerDay = sim.day + SETTLER_GAP_DAYS;
  sim.stats.settlers = (sim.stats.settlers ?? 0) + 1;
  sim.addLog(`${c.name} has come from ${f.name} to settle, for ${cost} silver.`, 'good', true);
  return null;
}
