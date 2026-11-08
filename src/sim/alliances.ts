import { TICKS_PER_HOUR } from './constants';
import { FACTIONS, itemId, quantity } from './defs';
import { buySettler, changeGoodwill, fightersHired, friendly, proposeTruce } from './diplomacy';
import { cannotGo, sendExpedition } from './expeditions';
import { ransom } from './prisoners';
import type { Simulation } from './simulation';
import { colonyStock, goodwillOf, takeFromStockpiles } from './trade';
import type { WorldAction } from './types';

// The two friendly factions, the Meadow Kin and the Hollowstone Clans, don't get on. Now and then they
// quarrel and each asks the colony to back them: whoever it sides with is pleased and the other offended.
// A faction that thinks well of the colony may send an envoy offering an alliance: their fighters come
// to its raids more readily, but when they are raided in turn they ask for help (a colonist lent for a
// few days, or goods), and an ally who is refused takes it badly and ends the alliance.

export interface Dispute {
  a: number;
  b: number;
  about: string;
  until: number;
}

export interface Envoy {
  faction: number;
  until: number;
}

export interface Alliance {
  faction: number;
  until: number;
  // The earliest day they next call for help.
  nextCallDay: number;
}

export interface AllyCall {
  faction: number;
  until: number;
  // Goods that would do instead of a colonist.
  item: number;
  count: number;
}

const DAY = TICKS_PER_HOUR * 24;
// Quarrels: from the third week, every week and a half or two; an answer within three days.
const DISPUTE_FROM_DAY = 14;
const DISPUTE_GAP: [number, number] = [9, 15];
const ANSWER_DAYS = 3;
// Siding with one: they're pleased, the other is offended. Staying out: neither is pleased, an ally less so.
export const SIDE_GAIN = 8;
export const SIDE_LOSS = 12;
const ABSTAIN_LOSS = 2;
const ALLY_ABSTAIN_LOSS = 6;
const DISPUTES = [
  'water drawn from the river in a dry spell',
  'grazing on the high meadows',
  'a strayed herd one says the other kept',
  'timber felled by the ford',
  'a road the hill folk cut through a field',
  'a betrothal broken off',
];
// Envoys: from the fourth week, from a faction that likes the colony at least this much.
const ENVOY_FROM_DAY = 20;
export const ENVOY_GOODWILL = 35;
const ENVOY_GAP: [number, number] = [12, 18];
// An alliance: how long it lasts, what signing it is worth, how the other side takes it.
export const ALLIANCE_DAYS = 36;
const ALLIANCE_GAIN = 8;
const RIVAL_OFFENCE = 10;
const DECLINE_ENVOY = 4;
// Calls for help: every week or so; an answer within two days. Help costs the colony; refusal costs the alliance.
const CALL_GAP: [number, number] = [7, 11];
const CALL_DAYS = 2;
const GOODS_GAIN = 5;
export const REFUSE_LOSS = 15;
// An ally's fighters come to the colony's raids this much more often.
export const ALLY_HELP = 0.2;
// What an ally under attack might ask for instead of a colonist (item, how many at the start).
const CALL_GOODS: [string, number][] = [
  ['meal', 12],
  ['herbalMedicine', 5],
  ['wood', 60],
  ['leather', 15],
  ['shortBow', 2],
];

const name = (faction: number) => FACTIONS[faction].name;
const gap = (sim: Simulation, [lo, hi]: [number, number]) => sim.day + sim.rng.int(lo, hi);
export const alliance = (sim: Simulation) => {
  const a = sim.diplomacy.alliance;
  return a && a.until > sim.tick ? a : null;
};
// Whether the colony is allied with this faction.
export const alliedWith = (sim: Simulation, faction: number): boolean => alliance(sim)?.faction === faction;

// The friendly faction whose fighters come to the colony's raids: the hired ones, else an ally, else the
// Meadow Kin.
export function helperFaction(sim: Simulation): number {
  const kin = FACTIONS.findIndex((f) => f.key === 'meadowKin');
  const ally = alliance(sim);
  return !fightersHired(sim) && ally ? ally.faction : kin;
}

// Called every in-game hour.
export function updateAlliances(sim: Simulation): void {
  const d = sim.diplomacy;
  if (d.dispute && sim.tick >= d.dispute.until) {
    settleDispute(sim, null);
  }
  if (d.envoy && sim.tick >= d.envoy.until) {
    answerEnvoy(sim, false);
  }
  if (d.call && sim.tick >= d.call.until) {
    answerCall(sim, 'refuse');
  }
  if (d.alliance && d.alliance.until <= sim.tick) {
    sim.addLog(`The alliance with ${name(d.alliance.faction)} has run its course.`, 'info', true);
    // A call for help still open goes with it (no ally, no broken promise).
    if (d.call?.faction === d.alliance.faction) {
      d.call = null;
    }
    d.alliance = null;
  }
  // News comes in the late morning.
  if (Math.floor(sim.hour) !== 10) {
    return;
  }
  const [a, b] = friendly();
  if (!d.dispute && a && b && sim.day >= (d.nextDisputeDay ?? DISPUTE_FROM_DAY)) {
    d.dispute = { a: a.id, b: b.id, about: sim.rng.pick(DISPUTES), until: sim.tick + ANSWER_DAYS * DAY };
    d.nextDisputeDay = gap(sim, DISPUTE_GAP);
    sim.stats.disputes = (sim.stats.disputes ?? 0) + 1;
    sim.addLog(
      `${name(a.id)} and ${name(b.id)} are quarrelling over ${d.dispute.about}. Each asks the colony to back them (Factions).`,
      'info',
      true,
    );
    return;
  }
  const ally = alliance(sim);
  if (!ally && !d.envoy && sim.day >= (d.nextEnvoyDay ?? ENVOY_FROM_DAY)) {
    const keen = friendly().filter((f) => goodwillOf(sim, f.id) >= ENVOY_GOODWILL);
    d.nextEnvoyDay = gap(sim, ENVOY_GAP);
    if (keen.length > 0) {
      const f = keen.length > 1 && sim.rng.next() < 0.5 ? keen[1] : keen[0];
      d.envoy = { faction: f.id, until: sim.tick + ANSWER_DAYS * DAY };
      sim.addLog(
        `An envoy from ${name(f.id)} has come to offer an alliance for ${ALLIANCE_DAYS} days: their fighters would come to your raids more readily, and they would ask your help when raided (Factions).`,
        'info',
        true,
      );
    }
    return;
  }
  // (Not with too little of the alliance left to answer in.)
  if (ally && !d.call && sim.day >= ally.nextCallDay && ally.until - sim.tick >= CALL_DAYS * DAY) {
    ally.nextCallDay = gap(sim, CALL_GAP);
    const growth = 1 + Math.min(sim.day, 80) / 80;
    const [key, base] = sim.rng.pick(CALL_GOODS);
    d.call = {
      faction: ally.faction,
      until: sim.tick + CALL_DAYS * DAY,
      item: itemId(key),
      count: Math.round(base * growth),
    };
    sim.addLog(
      `${name(ally.faction)} are under attack and ask their ally for help: lend them a colonist for a few days, or send ${quantity(d.call.item, d.call.count)} (Factions).`,
      'warn',
      true,
    );
  }
}

// Backs one side in the quarrel (or neither, with null).
export function settleDispute(sim: Simulation, side: number | null): string | null {
  const d = sim.diplomacy;
  const q = d.dispute;
  if (!q) {
    return 'Nobody is quarrelling.';
  }
  if (side !== null && side !== q.a && side !== q.b) {
    return "They aren't part of the quarrel.";
  }
  d.dispute = null;
  if (side === null) {
    for (const f of [q.a, q.b]) {
      changeGoodwill(sim, f, -(alliedWith(sim, f) ? ALLY_ABSTAIN_LOSS : ABSTAIN_LOSS));
    }
    sim.addLog(
      `The colony stayed out of the quarrel between ${name(q.a)} and ${name(q.b)}. Neither is pleased.`,
      'info',
    );
    return null;
  }
  const other = side === q.a ? q.b : q.a;
  changeGoodwill(sim, side, SIDE_GAIN);
  changeGoodwill(sim, other, -SIDE_LOSS);
  sim.addLog(
    `The colony backed ${name(side)} over ${q.about} (goodwill +${SIDE_GAIN}). ${name(other)} are offended (goodwill -${SIDE_LOSS}).`,
    'info',
    true,
  );
  return null;
}

export function answerEnvoy(sim: Simulation, accept: boolean): string | null {
  const d = sim.diplomacy;
  const envoy = d.envoy;
  if (!envoy) {
    return 'No envoy is waiting.';
  }
  d.envoy = null;
  if (!accept) {
    changeGoodwill(sim, envoy.faction, -DECLINE_ENVOY);
    sim.addLog(`The colony sent ${name(envoy.faction)}'s envoy home without an alliance.`, 'info');
    return null;
  }
  d.alliance = {
    faction: envoy.faction,
    until: sim.tick + ALLIANCE_DAYS * DAY,
    nextCallDay: gap(sim, CALL_GAP),
  };
  changeGoodwill(sim, envoy.faction, ALLIANCE_GAIN);
  sim.stats.alliances = (sim.stats.alliances ?? 0) + 1;
  const rivals = friendly().filter((f) => f.id !== envoy.faction);
  for (const f of rivals) {
    changeGoodwill(sim, f.id, -RIVAL_OFFENCE);
  }
  sim.addLog(
    `The colony is now allied with ${name(envoy.faction)} for ${ALLIANCE_DAYS} days.${rivals.length > 0 ? ` ${rivals.map((f) => f.name).join(' and ')} take it badly.` : ''}`,
    'good',
    true,
  );
  return null;
}

// Answers an ally's call for help: lend a colonist (by id), send the goods, or refuse.
export function answerCall(sim: Simulation, answer: 'goods' | 'refuse' | number): string | null {
  const d = sim.diplomacy;
  const call = d.call;
  if (!call) {
    return 'Nobody has asked for help.';
  }
  if (answer === 'goods') {
    if (colonyStock(sim, call.item) < call.count) {
      return `Only ${colonyStock(sim, call.item)} of ${call.count} in the stockpiles.`;
    }
    takeFromStockpiles(sim, call.item, call.count);
    d.call = null;
    changeGoodwill(sim, call.faction, GOODS_GAIN);
    sim.stats.callsAnswered = (sim.stats.callsAnswered ?? 0) + 1;
    sim.addLog(
      `The colony sent ${name(call.faction)} ${quantity(call.item, call.count)}. They're grateful.`,
      'good',
      true,
    );
    return null;
  }
  if (answer === 'refuse') {
    d.call = null;
    // Only an ally is owed help.
    if (!alliedWith(sim, call.faction)) {
      return null;
    }
    changeGoodwill(sim, call.faction, -REFUSE_LOSS);
    sim.stats.callsRefused = (sim.stats.callsRefused ?? 0) + 1;
    d.alliance = null;
    sim.addLog(
      `The colony didn't help ${name(call.faction)} when they were attacked. They've broken off the alliance (goodwill -${REFUSE_LOSS}).`,
      'danger',
      true,
    );
    return null;
  }
  const c = sim.colonists[answer];
  const why = c ? cannotGo(sim, c) : 'nobody by that name';
  if (why) {
    return `${c?.name ?? 'They'} can't go: ${why}.`;
  }
  const failed = sendExpedition(sim, call.faction, 'aid', [answer]);
  if (failed) {
    return failed;
  }
  d.call = null;
  return null;
}

// One dealing with the wider world, from the Factions screen. Returns why it couldn't be done, if it couldn't.
export function worldAction(sim: Simulation, action: WorldAction): string | null {
  switch (action.kind) {
    case 'truce':
      return proposeTruce(sim, action.faction);
    case 'ransom':
      return ransom(sim, action.captive);
    case 'settler':
      return buySettler(sim, action.faction);
    case 'dispute':
      return settleDispute(sim, action.side);
    case 'envoy':
      return answerEnvoy(sim, action.accept);
    case 'call':
      return answerCall(sim, action.answer);
    case 'expedition':
      return sendExpedition(sim, action.to, action.purpose, action.colonists);
  }
}
