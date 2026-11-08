import type { Obsession } from './minds';
import type { Biome } from './biomes';
import { Village, freshVillage } from './village';
import { Diplomacy, freshDiplomacy } from './diplomacy';
import { Shaft } from './depths';
import { ChronicleEntry, chronicleFromStory } from './chronicle';
import type { BeaconState } from './beacon';
import { NONE, featureDef } from './defs';
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
  Captive,
  Colonist,
  Infant,
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
  WORK_TYPES,
  Artwork,
  Fallen,
  Gathering,
} from './types';
import { Caravan } from './trade';
import { WeatherState } from './weather';
import { World } from './world';

// 16: recreation, art, music and gatherings added colonist fields older saves don't have.
export const SAVE_VERSION = 16;

interface SavedColonist {
  id: number;
  name: string;
  color: string;
  // Older saves have no ages or backstories.
  age?: number;
  backstory?: string;
  parents?: number[];
  expectingUntil?: number;
  expectingWith?: number;
  breakKind?: 'daze' | 'sulk' | 'binge' | 'tantrum';
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
  spouse: number;
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
    filth?: Uint8Array;
    forbidden?: Uint8Array;
    locked?: Uint8Array;
    drying?: Float32Array;
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
  // A gathering planned or under way, the dead awaiting burial, and the graves: [tile, who].
  gathering?: Gathering | null;
  // Trees and bushes the map started with (regrowth stops there).
  wildCover?: number;
  // The signal beacon's progress, and whether the colony has left.
  beacon?: BeaconState;
  departed?: boolean;
  unburied?: Fallen[];
  graves?: [number, Fallen][];
  story: StoryState;
  // The land the colony started in (older saves: temperate).
  biome?: Biome;
  enemies: Enemy[];
  allies?: Enemy[];
  nextEnemyId: number;
  captives?: Captive[];
  infants?: Infant[];
  obsession?: Obsession | null;
  village?: Village;
  diplomacy?: Diplomacy;
  shafts?: Record<number, Shaft>;
  chronicle?: ChronicleEntry[];
  nextInfantId?: number;
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
      filth: w.filth.slice(),
      forbidden: w.forbidden.slice(),
      locked: w.locked.slice(),
      drying: w.drying.slice(),
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
        spouse: c.spouse,
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
        age: c.age,
        backstory: c.backstory,
        parents: [...c.parents],
        expectingUntil: c.expectingUntil,
        expectingWith: c.expectingWith,
        breakKind: c.breakKind,
      }),
    ),
    bills: structuredClone(sim.bills),
    stats: structuredClone(sim.stats),
    log: sim.log.map((entry) => ({ ...entry })),
    storyLog: structuredClone(sim.storyLog),
    // Only pieces still standing (one taken down leaves its record behind).
    gathering: sim.gathering && structuredClone(sim.gathering),
    unburied: structuredClone(sim.unburied),
    wildCover: sim.wildCover,
    beacon: structuredClone(sim.beacon),
    departed: sim.departed,
    // Only graves still standing (one taken down leaves its record behind).
    graves: [...sim.graves].filter(([i]) => sim.graveAt(i)).map(([i, f]) => [i, { ...f }]),
    artworks: [...sim.artworks].filter(([i]) => sim.artworkAt(i)).map(([i, art]) => [i, { ...art }]),
    story: structuredClone(sim.story),
    biome: sim.biome,
    enemies: structuredClone(sim.enemies),
    allies: structuredClone(sim.allies),
    nextEnemyId: sim.nextEnemyId,
    captives: structuredClone(sim.captives),
    infants: structuredClone(sim.infants),
    obsession: sim.obsession && { ...sim.obsession },
    village: { ...sim.village },
    diplomacy: structuredClone(sim.diplomacy),
    shafts: structuredClone(sim.shafts),
    chronicle: structuredClone(sim.chronicle),
    nextInfantId: sim.nextInfantId,
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
  if (layers.filth) {
    world.filth.set(layers.filth);
  }
  if (layers.forbidden) {
    world.forbidden.set(layers.forbidden);
  }
  if (layers.locked) {
    world.locked.set(layers.locked);
  }
  if (layers.drying) {
    world.drying.set(layers.drying);
  }
  world.growth.set(layers.growth);
  world.fresh.set(layers.fresh);
  world.quality.set(layers.quality);
  world.damage.set(layers.damage);
  world.fire.set(layers.fire);
  world.floor.set(layers.floor);
  world.roof.set(layers.roof);
  world.fuel.set(layers.fuel);
  // Saves from before fires burned wood have every fire empty: light them with a full load.
  if (!layers.forbidden) {
    for (let i = 0; i < world.size; i++) {
      const burns = world.feature[i] !== NONE ? featureDef(world.feature[i]).burns : undefined;
      if (burns) {
        world.fuel[i] = burns.capacity;
      }
    }
  }
  world.structureVersion++;

  const colonists: Colonist[] = data.colonists.map((saved) => ({
    ...structuredClone(saved),
    moveProgress: 0,
    job: null,
    reserved: [],
    practicedAt: saved.practicedAt ?? {},
    age: saved.age ?? 30,
    backstory: saved.backstory ?? 'drifter',
    parents: saved.parents ?? [],
  }));
  // Saves from before the Animals skill was tracked properly have no (or broken) progress for it.
  for (const c of colonists) {
    for (const key of SKILL_KEYS) {
      if (!Number.isFinite(c.skillXp[key])) {
        c.skillXp[key] = 0;
      }
      c.passions[key] ??= 0;
    }
    // Work types added since the save was made start at normal priority.
    for (const work of WORK_TYPES) {
      c.priorities[work] ??= 3;
    }
  }

  const sim = new Simulation(world, colonists, data.seed, new Rng(data.rngState));
  sim.tick = data.tick;
  sim.bills = structuredClone(data.bills);
  sim.stats = structuredClone(data.stats);
  sim.log = data.log.map((entry) => ({ ...entry }));
  sim.storyLog = structuredClone(data.storyLog);
  sim.gathering = data.gathering ? structuredClone(data.gathering) : null;
  sim.unburied = structuredClone(data.unburied ?? []);
  sim.wildCover = data.wildCover ?? 0;
  sim.beacon = data.beacon ? structuredClone(data.beacon) : { hours: 0 };
  sim.departed = !!data.departed;
  sim.graves = new Map((data.graves ?? []).map(([i, f]) => [i, { ...f }]));
  sim.artworks = new Map((data.artworks ?? []).map(([i, art]) => [i, { ...art }]));
  sim.storyCount = sim.storyLog.length;
  // Saves from before difficulty settings play on standard.
  sim.story = { ...structuredClone(data.story), difficulty: data.story.difficulty ?? 'standard' };
  sim.biome = data.biome ?? 'temperate';
  sim.enemies = structuredClone(data.enemies);
  sim.allies = structuredClone(data.allies ?? []);
  sim.nextEnemyId = data.nextEnemyId;
  sim.captives = structuredClone(data.captives ?? []);
  sim.infants = structuredClone(data.infants ?? []);
  sim.obsession = data.obsession ? { ...data.obsession } : null;
  sim.village = { ...freshVillage(), ...data.village };
  sim.diplomacy = { ...freshDiplomacy(), ...structuredClone(data.diplomacy) };
  sim.shafts = structuredClone(data.shafts ?? {});
  // Older saves have no chronicle: start one from what the story log still holds.
  sim.chronicle = structuredClone(data.chronicle ?? chronicleFromStory(sim.storyLog));
  sim.nextInfantId = data.nextInfantId ?? 0;
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
