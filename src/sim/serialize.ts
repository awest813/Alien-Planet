import type { JoyKind } from './defs';
import { RaidState } from './combat';
import { PowerState } from './power';
import { ResearchState } from './research';
import { Rng } from './rng';
import { SimTimers, Simulation, StoryEntry } from './simulation';
import { StoryState } from './storyteller';
import {
  Animal,
  Bill,
  Carried,
  Colonist,
  Stance,
  WornArmor,
  Enemy,
  Health,
  LogEntry,
  Needs,
  NightResult,
  Passion,
  Priorities,
  ScheduleSlot,
  SkillKey,
  Skills,
  Stats,
  TimedThought,
  WornApparel,
  SKILL_KEYS,
  Artwork,
} from './types';
import { Caravan } from './trade';
import { WeatherState } from './weather';
import { World } from './world';

export const SAVE_VERSION = 15;

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
  skillXp: Record<SkillKey, number>;
  passions: Record<SkillKey, Passion>;
  weapon: string;
  weaponQuality: number;
  armor: WornArmor | null;
  stance: Stance;
  focus: number;
  tool: { quality: number; wear: number } | null;
  apparel: WornApparel | null;
  // What they were doing in the moment: asleep, mid-cooldown, marching to a drafted spot.
  sleeping: boolean;
  restTicks: number;
  restOutside: number;
  restCold: number;
  workStreak: number;
  cooldown: number;
  draftTarget: number;
  path: number[];
  practicedAt?: Partial<Record<SkillKey, number>>;
  recentJoy: Partial<Record<JoyKind, number>>;
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
    fresh: Float32Array;
    quality: Float32Array;
    damage: Float32Array;
    fire: Float32Array;
    floor: Uint8Array;
    roof: Uint8Array;
    fuel: Float32Array;
    // Float64, so room temperatures come back exactly.
    temperature: Float64Array;
  };
  colonists: SavedColonist[];
  bills: Bill[];
  stats: Stats;
  log: LogEntry[];
  storyLog: StoryEntry[];
  // Finished sculptures: [tile, artwork].
  artworks?: [number, Artwork][];
  story: StoryState;
  enemies: Enemy[];
  nextEnemyId: number;
  animals: Animal[];
  nextAnimalId: number;
  caravan: Caravan | null;
  goodwill: Record<number, number>;
  nextVisitorId: number;
  pendingRebuilds: [number, number][];
  dousing: [number, number][];
  research: ResearchState;
  power: PowerState;
  raid: RaidState | null;
  firstNight: NightResult;
  objectivesDone: Record<string, boolean>;
  timers: SimTimers;
  roomTemps: number[];
  weather: WeatherState;
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
      fresh: w.fresh.slice(),
      quality: w.quality.slice(),
      damage: w.damage.slice(),
      fire: w.fire.slice(),
      floor: w.floor.slice(),
      roof: w.roof.slice(),
      fuel: w.fuel.slice(),
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
        skillXp: c.skillXp,
        passions: c.passions,
        weapon: c.weapon,
        weaponQuality: c.weaponQuality,
        armor: c.armor && { ...c.armor },
        stance: c.stance,
        focus: c.focus,
        tool: c.tool && { ...c.tool },
        apparel: c.apparel,
        sleeping: c.sleeping,
        restTicks: c.restTicks,
        restOutside: c.restOutside,
        restCold: c.restCold,
        workStreak: c.workStreak,
        cooldown: c.cooldown,
        draftTarget: c.draftTarget,
        // Only a drafted colonist's walk is an order; anyone else re-plans after loading.
        path: c.drafted ? c.path : [],
        practicedAt: c.practicedAt,
        recentJoy: { ...c.recentJoy },
      }),
    ),
    bills: structuredClone(sim.bills),
    stats: structuredClone(sim.stats),
    log: sim.log.map((entry) => ({ ...entry })),
    storyLog: structuredClone(sim.storyLog),
    // Only pieces still standing (one taken down leaves its record behind).
    artworks: [...sim.artworks].filter(([i]) => sim.artworkAt(i)).map(([i, art]) => [i, { ...art }]),
    story: structuredClone(sim.story),
    enemies: structuredClone(sim.enemies),
    nextEnemyId: sim.nextEnemyId,
    animals: structuredClone(sim.animals),
    caravan: structuredClone(sim.caravan),
    goodwill: { ...sim.goodwill },
    nextVisitorId: sim.nextVisitorId,
    pendingRebuilds: sim.pendingRebuilds.map(([i, f]) => [i, f]),
    dousing: [...sim.dousing],
    nextAnimalId: sim.nextAnimalId,
    research: structuredClone(sim.research),
    power: structuredClone(sim.power),
    raid: structuredClone(sim.raid),
    firstNight: sim.firstNight,
    objectivesDone: { ...sim.objectivesDone },
    timers: sim.exportTimers(),
    roomTemps: sim.roomTemperatures(),
    weather: { ...sim.weather },
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
  world.fresh.set(layers.fresh);
  world.quality.set(layers.quality);
  world.damage.set(layers.damage);
  world.fire.set(layers.fire);
  world.floor.set(layers.floor);
  world.roof.set(layers.roof);
  world.fuel.set(layers.fuel);
  world.structureVersion++;

  const colonists: Colonist[] = data.colonists.map((saved) => ({
    ...structuredClone(saved),
    moveProgress: 0,
    job: null,
    reserved: [],
    practicedAt: saved.practicedAt ?? {},
  }));
  // Saves from before the Animals skill was tracked properly have no (or broken) progress for it.
  for (const c of colonists) {
    for (const key of SKILL_KEYS) {
      if (!Number.isFinite(c.skillXp[key])) {
        c.skillXp[key] = 0;
      }
      c.passions[key] ??= 0;
    }
  }

  const sim = new Simulation(world, colonists, data.seed, new Rng(data.rngState));
  sim.tick = data.tick;
  sim.bills = structuredClone(data.bills);
  sim.stats = structuredClone(data.stats);
  sim.log = data.log.map((entry) => ({ ...entry }));
  sim.storyLog = structuredClone(data.storyLog);
  sim.artworks = new Map((data.artworks ?? []).map(([i, art]) => [i, { ...art }]));
  sim.storyCount = sim.storyLog.length;
  // Saves from before difficulty settings play on standard.
  sim.story = { ...structuredClone(data.story), difficulty: data.story.difficulty ?? 'standard' };
  sim.enemies = structuredClone(data.enemies);
  sim.nextEnemyId = data.nextEnemyId;
  sim.animals = structuredClone(data.animals);
  sim.caravan = structuredClone(data.caravan);
  sim.goodwill = { ...data.goodwill };
  sim.nextVisitorId = data.nextVisitorId;
  sim.pendingRebuilds = data.pendingRebuilds.map(([i, f]) => [i, f]);
  sim.dousing = new Map(data.dousing);
  sim.nextAnimalId = data.nextAnimalId;
  sim.research = structuredClone(data.research);
  sim.power = structuredClone(data.power);
  sim.raid = structuredClone(data.raid);
  sim.firstNight = data.firstNight;
  sim.objectivesDone = { ...data.objectivesDone };
  sim.syncClock();
  sim.setTileTemperatures(layers.temperature);
  sim.setRoomTemperatures(data.roomTemps);
  sim.weather = { ...data.weather };
  for (let i = 0; i < world.size; i++) {
    if (world.fire[i] > 0) {
      sim.burning.add(i);
    }
  }
  sim.resumeAfterLoad(data.timers);
  return sim;
}
