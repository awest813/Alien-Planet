import { TICKS_PER_HOUR, populationFor } from './constants';
import { FACTIONS, itemDef, itemId, quantity } from './defs';
import { changeGoodwill } from './diplomacy';
import { damage } from './health';
import { DRAFT_AGE, ageBy } from './lifespans';
import type { Simulation } from './simulation';
import { colonyStock, goodwillOf, takeFromStockpiles, waresOf } from './trade';
import type { Colonist } from './types';

// Expeditions: one to three colonists leave the valley for some days. They walk off the map edge, are
// away (off the map, out of the colony's count of who's here, but still its own), and come back in from
// the edge with what they found, or hurt. They can go to a friendly faction's settlement to trade and
// make friends, to the old ruins in the hills to salvage, or (see alliances.ts) to help an ally.

export type Purpose = 'trade' | 'salvage' | 'aid';

export interface Expedition {
  id: number;
  // A faction's settlement, or RUINS.
  to: number;
  purpose: Purpose;
  members: number[];
  setOut: number;
  // When they come home.
  back: number;
  // Silver they carry to trade with.
  purse: number;
  // Seen on the road home (said once, a little before they're back).
  sighted?: boolean;
}

export const RUINS = -1;
export const MAX_PARTY = 3;
const DAY = TICKS_PER_HOUR * 24;
// Days away: a neighbour's settlement is closer than the ruins.
export const TRIP_DAYS: Record<Purpose, number> = { trade: 3, salvage: 5, aid: 3 };
// They're seen on the road this long before they're back.
const SIGHTED_TICKS = TICKS_PER_HOUR * 2;
// Leaving: someone who can't reach the edge in this long sets off from where they are.
const LEAVING_TICKS = TICKS_PER_HOUR * 8;
// Trade: what each member carries to spend (more as the colony grows), and how far it goes at the settlement
// (no traders' cut).
const PURSE_EACH = 100;
const HOME_PRICES = 1.3;
// Chances of trouble on the road: someone hurt (and on a salvage trip, half the haul lost).
const TROUBLE: Record<Purpose, number> = { trade: 0.1, salvage: 0.35, aid: 0.35 };
// Goodwill from a visit, and from helping an ally.
const VISIT_GOODWILL = 6;
const AID_GOODWILL = 8;
// Chance of someone coming back with them to join the colony.
const RECRUIT_CHANCE: Record<Purpose, number> = { trade: 0.12, salvage: 0.08, aid: 0 };

export const expeditions = (sim: Simulation): Expedition[] => sim.diplomacy.expeditions ?? [];

// Supplies for the road: silver for each member for each day away, a little more as prices rise.
export const supplyCost = (sim: Simulation, purpose: Purpose, members: number): number =>
  purpose === 'aid'
    ? 0
    : Math.round((members * TRIP_DAYS[purpose] * (10 + Math.min(sim.day, 120) / 12)) / 5) * 5 +
      (purpose === 'trade' ? purse(sim) * members : 0);

export const purse = (sim: Simulation): number => Math.round((PURSE_EACH + Math.min(sim.day, 120) * 1.25) / 5) * 5;

// Where they're going, in a sentence.
export function destinationName(to: number): string {
  if (to === RUINS) {
    return 'the ruins in the hills';
  }
  const f = FACTIONS[to];
  return f?.key === 'hollowstone'
    ? `the halls of ${f.name.replace(/^The /, 'the ')}`
    : `${f?.name.replace(/^The /, 'the ') ?? 'the neighbours'}'s farmsteads`;
}

// Why a colonist can't go, or null if they can.
export function cannotGo(sim: Simulation, c: Colonist): string | null {
  if (c.health.dead || c.away) {
    return 'not here';
  }
  if (c.age < DRAFT_AGE) {
    return 'too young';
  }
  if (c.health.downed || c.health.injuries.some((i) => i.bleeding > 0) || c.health.disease) {
    return 'not well enough';
  }
  if (sim.inMentalBreak(c)) {
    return 'not in the right frame of mind';
  }
  if (c.expectingUntil !== undefined) {
    return 'expecting a child';
  }
  if (sim.infants.some((i) => i.carer === c.id)) {
    return 'caring for a baby';
  }
  if (sim.obsession?.colonist === c.id) {
    return 'possessed by a vision';
  }
  const g = sim.gathering;
  if (g && (g.couple?.includes(c.id) || g.honoree === c.id || g.host === c.id)) {
    return 'expected at a gathering';
  }
  return null;
}

// Sends a party off. Returns why not, if they can't go.
export function sendExpedition(sim: Simulation, to: number, purpose: Purpose, ids: number[]): string | null {
  const members = [...new Set(ids)].map((id) => sim.colonists[id]).filter((c): c is Colonist => !!c);
  if (members.length === 0 || members.length > MAX_PARTY || members.length !== ids.length) {
    return `Choose one to ${MAX_PARTY} colonists to go.`;
  }
  for (const c of members) {
    const why = cannotGo(sim, c);
    if (why) {
      return `${c.name} can't go: ${why}.`;
    }
  }
  if (to === RUINS ? purpose !== 'salvage' : purpose === 'salvage' || !FACTIONS[to] || FACTIONS[to].hostile) {
    return 'Nobody there would have them.';
  }
  if (purpose === 'trade' && goodwillOf(sim, to) < 0) {
    return `${FACTIONS[to].name} won't welcome them just now.`;
  }
  // Somebody grown has to mind the colony.
  const staying = sim.living().filter((c) => !members.includes(c) && c.age >= DRAFT_AGE && !c.health.downed);
  if (staying.length === 0) {
    return 'Someone has to stay and mind the colony.';
  }
  const cost = supplyCost(sim, purpose, members.length);
  if (colonyStock(sim, itemId('silver')) < cost) {
    return `Supplies for the road cost ${cost} silver.`;
  }
  takeFromStockpiles(sim, itemId('silver'), cost);
  const d = sim.diplomacy;
  const id = d.nextExpeditionId ?? 0;
  d.nextExpeditionId = id + 1;
  const e: Expedition = {
    id,
    to,
    purpose,
    members: members.map((c) => c.id),
    setOut: sim.tick,
    back: sim.tick + TRIP_DAYS[purpose] * DAY,
    purse: purpose === 'trade' ? purse(sim) * members.length : 0,
  };
  d.expeditions = [...expeditions(sim), e];
  for (const c of members) {
    leave(sim, c);
  }
  sim.stats.expeditions = (sim.stats.expeditions ?? 0) + 1;
  const names = members
    .map((c) => c.name)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1');
  const why = purpose === 'salvage' ? 'to salvage what they can' : purpose === 'aid' ? 'to help' : 'to trade';
  sim.addLog(
    `${names} set off for ${destinationName(to)} ${why}${cost > 0 ? ` (${cost} silver${purpose === 'trade' ? ' for supplies and to trade with' : ' of supplies'})` : ''}. Back in about ${TRIP_DAYS[purpose]} days.`,
    'info',
    true,
  );
  return null;
}

// A member drops what they're doing and heads for the edge of the map.
function leave(sim: Simulation, c: Colonist): void {
  sim.endJob(c);
  sim.dropCarried(c);
  c.drafted = false;
  c.away = 'leaving';
  // Anyone on their way to tend or feed them gives up.
  for (const o of sim.colonists) {
    if (o !== c && o.job && o.job.patient === c.id && ['tend', 'soothe', 'feed', 'rescue'].includes(o.job.type)) {
      sim.endJob(o);
    }
  }
  if (sim.concert?.player === c.id) {
    sim.concert = null;
  }
  // An animal chasing them loses them (it turns on someone else, or calms down, on its next turn).
  for (const a of sim.animals) {
    if (a.revengeOn === c.id) {
      a.revengeOn = -1;
      a.path = [];
    }
  }
}

const onEdge = (sim: Simulation, i: number) => {
  const w = sim.world;
  const x = w.xOf(i);
  const y = w.yOf(i);
  return x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1;
};

// Each tick, for a member on the way out: a step towards the edge, and gone once there.
export function travel(sim: Simulation, c: Colonist): void {
  if (c.away !== 'leaving') {
    return;
  }
  const w = sim.world;
  const e = expeditions(sim).find((x) => x.members.includes(c.id));
  if (!e || onEdge(sim, c.tile) || sim.tick - e.setOut > LEAVING_TICKS) {
    depart(c);
    return;
  }
  if (c.path.length === 0) {
    const region = sim.regionOf(c.tile);
    const exit = sim.nearest(c.tile, (i) => onEdge(sim, i) && sim.regionOf(i) === region, 1)[0];
    c.path = exit !== undefined ? (sim.pathfinder.find(c.tile, [exit]) ?? []) : [];
    if (c.path.length === 0) {
      depart(c);
      return;
    }
  }
  const next = c.path[0];
  if (!w.isPassable(next)) {
    c.path = [];
    c.moveProgress = 0;
    return;
  }
  c.moveProgress += sim.moveRate(c);
  if (c.moveProgress >= 1) {
    c.tile = next;
    c.path.shift();
    c.moveProgress = 0;
  }
}

function depart(c: Colonist): void {
  c.away = 'gone';
  c.path = [];
  c.moveProgress = 0;
}

// Called every in-game hour: parties due back come home.
export function updateExpeditions(sim: Simulation): void {
  for (const e of expeditions(sim)) {
    if (sim.tick >= e.back) {
      comeHome(sim, e);
    } else if (!e.sighted && sim.tick >= e.back - SIGHTED_TICKS) {
      e.sighted = true;
      const party = e.members
        .map((id) => sim.colonists[id])
        .filter((c) => c && !c.health.dead)
        .map((c) => c.name);
      if (party.length > 0) {
        const from = e.to === RUINS ? 'the ruins' : FACTIONS[e.to].name.replace(/^The /, 'the ');
        sim.addLog(
          `${party.join(', ').replace(/, ([^,]*)$/, ' and $1')} ${party.length > 1 ? 'are' : 'is'} on the road home from ${from}: back in about two hours.`,
          'good',
        );
      }
    }
  }
  // Nobody stays away without a party to be with (a save edited by hand, say): they walk back in.
  for (const c of sim.colonists) {
    if (c.away && !c.health.dead && !expeditions(sim).some((e) => e.members.includes(c.id))) {
      c.away = undefined;
      c.path = [];
    }
  }
}

// Where a party comes back in: the edge nearest home, or (with nobody home to find it from) wherever they
// left.
function arrival(sim: Simulation, members: Colonist[]): number {
  const w = sim.world;
  const home = sim.homeTile();
  const region = sim.outsideRegion();
  if (home !== undefined && region !== undefined) {
    const edge = sim.nearest(home, (i) => onEdge(sim, i) && sim.regionOf(i) === region, 1)[0];
    if (edge !== undefined) {
      return edge;
    }
  }
  const from = members[0].tile;
  return w.isPassable(from) ? from : (sim.nearest(from, (i) => w.isPassable(i), 1)[0] ?? from);
}

function comeHome(sim: Simulation, e: Expedition): void {
  const d = sim.diplomacy;
  d.expeditions = expeditions(sim).filter((x) => x !== e);
  const members = e.members.map((id) => sim.colonists[id]).filter((c) => c && !c.health.dead);
  if (members.length === 0) {
    return;
  }
  const spot = arrival(sim, members);
  const hours = (sim.tick - e.setOut) / TICKS_PER_HOUR;
  for (const c of members) {
    c.away = undefined;
    c.tile = spot;
    c.path = [];
    c.moveProgress = 0;
    c.job = null;
    // They ate and slept on the road.
    c.needs.food = Math.max(c.needs.food, 0.5);
    c.needs.rest = Math.max(c.needs.rest, 0.6);
    ageBy(sim, c, hours);
    // (Old age can catch up with them on the way home.)
    if (c.health.dead) {
      continue;
    }
    // Whoever they left behind who has since died.
    if (c.spouse >= 0 && sim.colonists[c.spouse]?.health.dead) {
      c.spouse = -1;
      c.strainedSince = undefined;
    }
    // (They mourned when word reached them on the road.)
    if (c.lover >= 0 && sim.colonists[c.lover]?.health.dead) {
      c.lover = -1;
    }
    sim.addThought(c, 'backFromJourney');
  }
  // (Anyone old age caught up with on the road isn't back.)
  const back = members.filter((c) => !c.health.dead);
  if (back.length === 0) {
    return;
  }
  members.splice(0, members.length, ...back);
  const names = members
    .map((c) => c.name)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1');
  const found: { item: number; count: number }[] = [];
  const notes: string[] = [];
  const trouble = sim.rng.next() < TROUBLE[e.purpose];
  const scale = 1 + Math.min(sim.day, 120) / 120;
  if (e.purpose === 'trade') {
    found.push(...goodsWorth(sim, e.to, e.purse * HOME_PRICES));
    changeGoodwill(sim, e.to, VISIT_GOODWILL);
    notes.push(`${FACTIONS[e.to].name} made them welcome (goodwill +${VISIT_GOODWILL})`);
  } else if (e.purpose === 'aid') {
    changeGoodwill(sim, e.to, AID_GOODWILL);
    sim.stats.callsAnswered = (sim.stats.callsAnswered ?? 0) + 1;
    notes.push(`${FACTIONS[e.to].name} won't forget the help (goodwill +${AID_GOODWILL})`);
    found.push(...goodsWorth(sim, e.to, 40 * members.length));
  } else {
    for (let n = 0; n < members.length; n++) {
      found.push({ item: itemId('iron'), count: Math.round(sim.rng.int(4, 12) * scale) });
      found.push({ item: itemId('stoneBlocks'), count: Math.round(sim.rng.int(10, 30) * scale) });
      if (sim.rng.next() < 0.35) {
        found.push({ item: itemId('toolKit'), count: 1 });
      }
      if (sim.rng.next() < 0.15) {
        found.push({ item: itemId(sim.rng.pick(['crossbow', 'longbow', 'ironSword', 'scaleArmor'])), count: 1 });
      }
      if (sim.rng.next() < 0.2) {
        found.push({ item: itemId('herbalMedicine'), count: sim.rng.int(2, 5) });
      }
    }
    if (trouble && sim.rng.next() < 0.4) {
      for (const f of found) {
        f.count = Math.floor(f.count / 2);
      }
      notes.push('half the haul was lost when a passage caved in');
    }
  }
  if (trouble) {
    const hurt = sim.rng.pick(members);
    damage(sim, hurt, 0.15 + sim.rng.next() * 0.2, sim.rng.next() < 0.5 ? 'bruise' : 'cut');
    notes.push(`${hurt.name} came back hurt`);
  }
  const home = sim.homeTile() ?? spot;
  const kept = mergeFound(found);
  for (const f of kept) {
    sim.world.dropItemNear(home, f.item, f.count);
  }
  if (kept.length > 0) {
    notes.unshift(`they brought back ${kept.map((f) => quantity(f.item, f.count)).join(', ')}`);
  }
  const room = sim.headcount() < populationFor(sim.world.width).maxColonists;
  if (room && sim.rng.next() < RECRUIT_CHANCE[e.purpose]) {
    const c = sim.adopt(sim.freshName(), spot);
    notes.push(`${c.name} came back with them to join the colony`);
  }
  sim.addLog(
    `${names} ${members.length > 1 ? 'are' : 'is'} back from ${destinationName(e.to)}: ${notes.join('; ')}.`,
    'good',
    true,
  );
}

// Goods from a faction's own stores worth about `worth` silver at full value.
function goodsWorth(sim: Simulation, faction: number, worth: number): { item: number; count: number }[] {
  const wares = waresOf(sim, faction)
    .map(([key]) => itemId(key))
    .filter((item) => itemDef(item).value > 0 && itemDef(item).value <= worth / 2);
  if (wares.length === 0) {
    return [];
  }
  const out: { item: number; count: number }[] = [];
  const kinds = Math.min(wares.length, 2 + sim.rng.int(0, 1));
  const pool = [...wares];
  for (let k = 0; k < kinds; k++) {
    const item = pool.splice(sim.rng.int(0, pool.length - 1), 1)[0];
    const count = Math.max(1, Math.round(worth / kinds / itemDef(item).value));
    out.push({ item, count });
  }
  return out;
}

function mergeFound(found: { item: number; count: number }[]): { item: number; count: number }[] {
  const total = new Map<number, number>();
  for (const f of found) {
    total.set(f.item, (total.get(f.item) ?? 0) + f.count);
  }
  return [...total].filter(([, n]) => n > 0).map(([item, count]) => ({ item, count }));
}

// Who's away, for the colony's own bookkeeping (and the interface).
export function awayWith(sim: Simulation, c: Colonist): Expedition | undefined {
  return c.away ? expeditions(sim).find((e) => e.members.includes(c.id)) : undefined;
}
