import { TICKS_PER_HOUR } from './constants';
import { featureDef, featureId } from './defs';
import type { Simulation } from './simulation';
import { traitValue } from './social';
import { Colonist } from './types';

// Minds: the different ways a colonist can break under strain, the kinds of inspiration that lift
// them, and rare obsessions that end in a legendary work of art (or a breakdown).

// ---- Mental breaks ----

export type BreakKind = 'daze' | 'sulk' | 'binge' | 'tantrum';

export const BREAK_LABELS: Record<BreakKind, string> = {
  daze: 'Mental break: wandering in a daze',
  sulk: 'Mental break: sulking',
  binge: 'Mental break: binge eating',
  tantrum: 'Mental break: in a rage',
};

const BREAK_LOGS: Record<BreakKind, string> = {
  daze: 'has had enough and is wandering around in a daze.',
  sulk: 'has had enough and has gone off to sulk.',
  binge: 'has had enough and is eating everything in sight.',
  tantrum: 'has had enough and is flying into a rage!',
};

// Which way a colonist breaks: their nature steers it. Children only sulk or wander off in a daze.
export function chooseBreak(sim: Simulation, c: Colonist): BreakKind {
  const weights: Record<BreakKind, number> = { daze: 3, sulk: 2, binge: 2, tantrum: 1 };
  if (c.traits.includes('glutton')) {
    weights.binge *= 4;
  }
  if (c.traits.includes('pessimist')) {
    weights.sulk *= 3;
  }
  if ((traitValue(c, 'insultChance') ?? 0) > 0.2) {
    weights.tantrum *= 4;
  }
  if (traitValue(c, 'insultChance') === 0) {
    weights.tantrum = 0;
  }
  if (c.age < 13) {
    weights.binge = 0;
    weights.tantrum = 0;
  }
  const kinds = Object.keys(weights) as BreakKind[];
  const total = kinds.reduce((sum, k) => sum + weights[k], 0);
  let roll = sim.rng.next() * total;
  for (const k of kinds) {
    roll -= weights[k];
    if (roll < 0) {
      return k;
    }
  }
  return 'daze';
}

export const breakLog = (c: Colonist, kind: BreakKind): string => `${c.name} ${BREAK_LOGS[kind]}`;

// What a tantrum may smash: furniture and the like, never walls, doors, art, graves or the beacon.
export function smashable(sim: Simulation, i: number): boolean {
  const f = sim.world.feature[i];
  if (f === 0) {
    return false;
  }
  const def = featureDef(f);
  return (
    !!def.build &&
    !def.natural &&
    !def.crop &&
    !def.blocksRoom &&
    !def.door &&
    !def.art &&
    !def.layer &&
    def.key !== 'grave' &&
    def.key !== 'signalBeacon' &&
    def.key !== 'prisonerBed'
  );
}

// ---- Inspirations ----

export const INSPIRATIONS = ['inspired', 'creativeInspiration', 'tamingInspiration', 'teachingInspiration'] as const;
export type InspirationKey = (typeof INSPIRATIONS)[number];

// The storyteller's inspiration: someone wakes up full of ideas, of a kind that suits them.
export function inspire(sim: Simulation): boolean {
  const ready = sim.living().filter((c) => !c.health.downed && !sim.inMentalBreak(c) && c.age >= 13);
  if (ready.length === 0) {
    return false;
  }
  const c = sim.rng.pick(ready);
  const options: InspirationKey[] = ['inspired'];
  if (c.skills.artistic >= 5) {
    options.push('creativeInspiration');
  }
  if (c.skills.animals >= 4 && sim.animals.some((a) => !a.tame && a.hp > 0)) {
    options.push('tamingInspiration');
  }
  if (c.age >= 18 && sim.living().some((o) => o.age < 18)) {
    options.push('teachingInspiration');
  }
  const kind = sim.rng.pick(options);
  sim.addThought(c, kind);
  const what: Record<InspirationKey, string> = {
    inspired: 'is inspired and will work faster for a day.',
    creativeInspiration: 'has a creative spark: their next sculpture will be something special.',
    tamingInspiration: 'feels a way with animals today: their next taming will surely work.',
    teachingInspiration: 'is in a teaching mood: the children around them will learn fast.',
  };
  sim.addLog(`${c.name} ${what[kind]}`, 'good', true);
  return true;
}

// Uses up a one-off inspiration (creative, taming), if the colonist has it.
export function useInspiration(sim: Simulation, c: Colonist, key: InspirationKey): boolean {
  const had = c.thoughts.some((t) => t.key === key && t.expires > sim.tick);
  if (had) {
    c.thoughts = c.thoughts.filter((t) => t.key !== key);
  }
  return had;
}

// ---- Obsessions ----

export interface Obsession {
  colonist: number;
  // Where the legendary piece is to stand (its blueprint).
  tile: number;
  started: number;
  deadline: number;
}

export const LEGEND = featureId('legendarySculpture');
export const OBSESSION_DAYS = 8;
// A skilled artist (or craftsman) may be seized by a vision.
export const OBSESSION_SKILL = 7;
export const LEGEND_QUALITY = 20;

// Visions come to a content artist, not a struggling one.
export const OBSESSION_MOOD = 55;
const canObsess = (sim: Simulation, c: Colonist) =>
  c.age >= 18 &&
  c.mood >= OBSESSION_MOOD &&
  !c.health.downed &&
  !sim.inMentalBreak(c) &&
  Math.max(c.skills.artistic, c.skills.crafting) >= OBSESSION_SKILL;

export const obsessionPossible = (sim: Simulation): boolean =>
  !sim.obsession && sim.living().some((c) => canObsess(sim, c));

// The storyteller's obsession: a vision that must be carved, with materials it names.
export function startObsession(sim: Simulation): boolean {
  if (sim.obsession) {
    return false;
  }
  const c = sim
    .living()
    .filter((o) => canObsess(sim, o))
    .sort((a, b) => Math.max(b.skills.artistic, b.skills.crafting) - Math.max(a.skills.artistic, a.skills.crafting))[0];
  const tile = c ? sim.legendSite() : undefined;
  if (!c || tile === undefined) {
    return false;
  }
  sim.planLegend(tile);
  sim.obsession = {
    colonist: c.id,
    tile,
    started: sim.tick,
    deadline: sim.tick + OBSESSION_DAYS * 24 * TICKS_PER_HOUR,
  };
  const cost = featureDef(LEGEND)
    .build!.cost.map((k) => `${k.count} ${sim.itemName(k.item)}`)
    .join(', ');
  sim.stats.obsessions = (sim.stats.obsessions ?? 0) + 1;
  sim.addLog(
    `${c.name} is seized by a vision and must carve it: bring ${cost} within ${OBSESSION_DAYS} days, or they'll break down.`,
    'warn',
    true,
  );
  sim.events.push('obsession');
  return true;
}

// Called every in-game hour: an obsession runs out of time, or its artist is gone.
export function updateObsession(sim: Simulation): void {
  const o = sim.obsession;
  if (!o) {
    return;
  }
  const c = sim.colonists[o.colonist];
  const planned = sim.world.blueprint[o.tile] === LEGEND;
  if (!c || c.health.dead || !planned) {
    // Their passing (or the plan being cancelled) ends it quietly.
    if (planned) {
      sim.dropLegend(o.tile);
    }
    sim.obsession = null;
    return;
  }
  if (sim.tick >= o.deadline) {
    sim.obsession = null;
    sim.dropLegend(o.tile);
    sim.addThought(c, 'obsessionFailed');
    sim.startBreak(c, 'tantrum', 8);
    sim.addLog(`${c.name}'s vision came to nothing, and they've snapped.`, 'danger', true);
  }
}
