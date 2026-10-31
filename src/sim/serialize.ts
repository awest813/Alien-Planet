import { RaidState } from './combat';
import { Rng } from './rng';
import { Simulation, StoryEntry } from './simulation';
import { StoryState } from './storyteller';
import {
  Bill,
  Carried,
  Colonist,
  Enemy,
  Health,
  LogEntry,
  Needs,
  NightResult,
  Priorities,
  ScheduleSlot,
  Skills,
  Stats,
  TimedThought,
} from './types';
import { World } from './world';

export const SAVE_VERSION = 3;

interface SavedColonist {
  id: number;
  name: string;
  color: string;
  tile: number;
  skills: Skills;
  priorities: Priorities;
  schedule: ScheduleSlot[];
  needs: Needs;
  mood: number;
  thoughts: TimedThought[];
  carrying: Carried | null;
  nightTicks: number;
  exposedTicks: number;
  breakUntil: number;
  lowMoodTicks: number;
  traits: string[];
  opinions: Record<number, number>;
  lover: number;
  health: Health;
  drafted: boolean;
}

// Plain structured-cloneable data, stored as-is in IndexedDB. Jobs and reservations
// are not saved: colonists simply pick new work after loading.
export interface SaveData {
  version: number;
  seed: number;
  tick: number;
  rngState: number;
  width: number;
  height: number;
  layers: {
    terrain: Uint8Array;
    feature: Uint8Array;
    designation: Uint8Array;
    zone: Uint8Array;
    blueprint: Uint8Array;
    delivered: Uint16Array;
    itemType: Uint8Array;
    itemCount: Uint16Array;
    progress: Float32Array;
    growth: Float32Array;
    temperature: Float32Array;
  };
  colonists: SavedColonist[];
  bills: Bill[];
  stats: Stats;
  log: LogEntry[];
  storyLog: StoryEntry[];
  story: StoryState;
  enemies: Enemy[];
  nextEnemyId: number;
  raid: RaidState | null;
  firstNight: NightResult;
  objectivesDone: Record<string, boolean>;
}

export function serialize(sim: Simulation): SaveData {
  const w = sim.world;
  return {
    version: SAVE_VERSION,
    seed: sim.seed,
    tick: sim.tick,
    rngState: sim.rng.state,
    width: w.width,
    height: w.height,
    layers: {
      terrain: w.terrain.slice(),
      feature: w.feature.slice(),
      designation: w.designation.slice(),
      zone: w.zone.slice(),
      blueprint: w.blueprint.slice(),
      delivered: w.delivered.slice(),
      itemType: w.itemType.slice(),
      itemCount: w.itemCount.slice(),
      progress: w.progress.slice(),
      growth: w.growth.slice(),
      temperature: sim.tileTemperatures(),
    },
    colonists: sim.colonists.map((c) =>
      structuredClone({
        id: c.id,
        name: c.name,
        color: c.color,
        tile: c.tile,
        skills: c.skills,
        priorities: c.priorities,
        schedule: c.schedule,
        needs: c.needs,
        mood: c.mood,
        thoughts: c.thoughts,
        carrying: c.carrying,
        nightTicks: c.nightTicks,
        exposedTicks: c.exposedTicks,
        breakUntil: c.breakUntil,
        lowMoodTicks: c.lowMoodTicks,
        traits: c.traits,
        opinions: c.opinions,
        lover: c.lover,
        health: c.health,
        drafted: c.drafted,
      }),
    ),
    bills: structuredClone(sim.bills),
    stats: structuredClone(sim.stats),
    log: sim.log.map((entry) => ({ ...entry })),
    storyLog: structuredClone(sim.storyLog),
    story: structuredClone(sim.story),
    enemies: structuredClone(sim.enemies),
    nextEnemyId: sim.nextEnemyId,
    raid: structuredClone(sim.raid),
    firstNight: sim.firstNight,
    objectivesDone: { ...sim.objectivesDone },
  };
}

export function deserialize(data: SaveData): Simulation {
  if (data.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version ${data.version}`);
  }
  const world = new World(data.width, data.height);
  const layers = data.layers;
  world.terrain.set(layers.terrain);
  world.feature.set(layers.feature);
  world.designation.set(layers.designation);
  world.zone.set(layers.zone);
  world.blueprint.set(layers.blueprint);
  world.delivered.set(layers.delivered);
  world.itemType.set(layers.itemType);
  world.itemCount.set(layers.itemCount);
  world.progress.set(layers.progress);
  world.growth.set(layers.growth);
  world.structureVersion++;

  const colonists: Colonist[] = data.colonists.map((saved) => ({
    ...structuredClone(saved),
    path: [],
    moveProgress: 0,
    job: null,
    reserved: [],
    workStreak: 0,
    sleeping: false,
    restTicks: 0,
    restOutside: 0,
    restCold: 0,
    draftTarget: -1,
    cooldown: 0,
  }));

  const sim = new Simulation(world, colonists, data.seed, new Rng(data.rngState));
  sim.tick = data.tick;
  sim.bills = structuredClone(data.bills);
  sim.stats = structuredClone(data.stats);
  sim.log = data.log.map((entry) => ({ ...entry }));
  sim.storyLog = structuredClone(data.storyLog);
  sim.story = structuredClone(data.story);
  sim.enemies = structuredClone(data.enemies);
  sim.nextEnemyId = data.nextEnemyId;
  sim.raid = structuredClone(data.raid);
  sim.firstNight = data.firstNight;
  sim.objectivesDone = { ...data.objectivesDone };
  sim.syncClock();
  sim.setTileTemperatures(layers.temperature);
  return sim;
}
