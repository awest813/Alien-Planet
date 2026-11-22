import type { Obsession } from './minds';
import type { Biome } from './biomes';
import { Village, freshVillage } from './village';
import { Diplomacy, freshDiplomacy } from './diplomacy';
import { Shaft } from './depths';
import { ChronicleEntry, chronicleFromStory } from './chronicle';
import type { BeaconState } from './beacon';
import { NONE, RECIPES, featureDef, itemDef } from './defs';
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
  Grief,
} from './types';
import { Caravan } from './trade';
import { WeatherState } from './weather';
import { World } from './world';

// 16: recreation, art, music and gatherings added colonist fields older saves don't have.
// 17: a layer that's mostly empty is saved as the tiles that aren't (see packLayer). A game from before refuses it
// as a newer version, rather than read it as a blank map; 16 still loads.
export const SAVE_VERSION = 17;
export const OLDEST_SAVE_VERSION = 16;
export const loadableVersion = (version: number | undefined): boolean =>
  version !== undefined && version >= OLDEST_SAVE_VERSION && version <= SAVE_VERSION;

// A mostly empty layer: its length, the tiles that aren't empty, and what's on them.
export interface PackedLayer {
  length: number;
  at: Int32Array;
  values: Uint8Array | Uint16Array | Float32Array;
}
type Layer<T> = T | PackedLayer;

// A layer as saved: whole, or (when that's less than half the bytes) only its tiles that aren't empty. An XL map's
// layers came to 3.6 MB, nearly all zeroes, and writing them was most of an autosave's time on a slow phone. Every
// value comes back to the bit (a float is compared and copied as its bits, so even -0 stays -0).
export function packLayer<T extends Uint8Array | Uint16Array | Float32Array>(layer: T): Layer<T> {
  const bits = layer instanceof Float32Array ? new Uint32Array(layer.buffer, layer.byteOffset, layer.length) : layer;
  // Mostly empty, so looked over four bytes at a time: only a word that isn't all zeroes has its tiles looked at.
  const perWord = 4 / layer.BYTES_PER_ELEMENT;
  const aligned = layer.byteOffset % 4 === 0;
  const wordCount = aligned ? Math.floor(layer.byteLength / 4) : 0;
  const words = new Uint32Array(layer.buffer, aligned ? layer.byteOffset : 0, wordCount);
  // (Two passes, the count and then the copy, written out: a callback for each tile was half the time.)
  let n = 0;
  for (let wi = 0; wi < wordCount; wi++) {
    if (words[wi] !== 0) {
      for (let i = wi * perWord, end = i + perWord; i < end; i++) {
        n += bits[i] !== 0 ? 1 : 0;
      }
    }
  }
  for (let i = wordCount * perWord; i < bits.length; i++) {
    n += bits[i] !== 0 ? 1 : 0;
  }
  if (n * (4 + layer.BYTES_PER_ELEMENT) * 2 > layer.length * layer.BYTES_PER_ELEMENT) {
    return layer.slice() as T;
  }
  const at = new Int32Array(n);
  const values =
    layer instanceof Float32Array
      ? new Float32Array(n)
      : layer instanceof Uint16Array
        ? new Uint16Array(n)
        : new Uint8Array(n);
  const out = values instanceof Float32Array ? new Uint32Array(values.buffer) : values;
  let k = 0;
  for (let wi = 0; wi < wordCount; wi++) {
    if (words[wi] !== 0) {
      for (let i = wi * perWord, end = i + perWord; i < end; i++) {
        if (bits[i] !== 0) {
          at[k] = i;
          out[k++] = bits[i];
        }
      }
    }
  }
  for (let i = wordCount * perWord; i < bits.length; i++) {
    if (bits[i] !== 0) {
      at[k] = i;
      out[k++] = bits[i];
    }
  }
  return { length: layer.length, at, values };
}

// (Through JSON a typed array is {"0": …, "1": …}, or an array from a file: its values, in order, either way.)
const valuesOf = (v: unknown): ArrayLike<number> =>
  ArrayBuffer.isView(v) || Array.isArray(v) ? (v as ArrayLike<number>) : Object.values(v as Record<string, number>);
// (An array has `at`, `values` and `length` of its own: a layer from a file is one.)
const isPacked = (v: unknown): v is PackedLayer =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v) && 'at' in v && 'values' in v;

// A saved layer into the world's own, whichever way it was saved.
function unpackLayer(target: Uint8Array | Uint16Array | Float32Array | Float64Array, layer: unknown): void {
  if (!isPacked(layer)) {
    target.set(valuesOf(layer));
    return;
  }
  target.fill(0);
  const at = valuesOf(layer.at);
  if (target instanceof Float32Array && layer.values instanceof Float32Array) {
    // Bit for bit.
    const bits = new Uint32Array(target.buffer, target.byteOffset, target.length);
    const from = new Uint32Array(layer.values.buffer, layer.values.byteOffset, layer.values.length);
    for (let k = 0; k < at.length; k++) {
      bits[at[k]] = from[k];
    }
    return;
  }
  const values = valuesOf(layer.values);
  for (let k = 0; k < at.length; k++) {
    target[at[k]] = values[k];
  }
}

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
  weaponWear?: number;
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
  strainedSince?: number;
  separatedFrom?: number;
  retired?: boolean;
  childhood?: { hard: number; happy: number };
  grief?: Grief[];
  // On an expedition (older saves: never).
  away?: 'leaving' | 'gone';
}

// Plain structured-cloneable data, stored as-is in IndexedDB. Jobs and reservations
// are not saved: colonists simply pick new work after loading.
export interface SaveData {
  version: number;
  // Weapons lying about keep a condition (they wear away out in the weather). Missing from older saves.
  weaponsWear?: boolean;
  seed: number;
  tick: number;
  rngState: number;
  width: number;
  height: number;
  layers: {
    terrain: Uint8Array;
    feature: Layer<Uint8Array>;
    designation: Layer<Uint8Array>;
    zone: Layer<Uint8Array>;
    blueprint: Layer<Uint8Array>;
    delivered: Layer<Uint16Array>;
    itemType: Layer<Uint8Array>;
    itemCount: Layer<Uint16Array>;
    progress: Layer<Float32Array>;
    filth?: Layer<Uint8Array>;
    forbidden?: Layer<Uint8Array>;
    locked?: Layer<Uint8Array>;
    drying?: Layer<Float32Array>;
    growth: Layer<Float32Array>;
    fresh: Layer<Float32Array>;
    quality: Layer<Float32Array>;
    damage: Layer<Float32Array>;
    fire: Layer<Float32Array>;
    floor: Layer<Uint8Array>;
    roof: Layer<Uint8Array>;
    fuel: Layer<Float32Array>;
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
  // Missing on saves from before map bookmarks.
  bookmarks?: Record<number, number>;
  unburied?: Fallen[];
  graves?: [number, Fallen][];
  // Work left on benches by crafts cut short: [bench tile, recipe, progress] (older saves: none).
  benchWork?: [number, number, number][];
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
  history?: [number, number, number, number, number][];
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
    weaponsWear: true,
    seed: sim.seed,
    tick: sim.tick,
    rngState: sim.rng.state,
    width: w.width,
    height: w.height,
    layers: {
      terrain: w.terrain.slice(),
      feature: packLayer(w.feature),
      designation: packLayer(w.designation),
      zone: packLayer(w.zone),
      blueprint: packLayer(w.blueprint),
      delivered: packLayer(w.delivered),
      itemType: packLayer(w.itemType),
      itemCount: packLayer(w.itemCount),
      progress: packLayer(w.progress),
      filth: packLayer(w.filth),
      forbidden: packLayer(w.forbidden),
      locked: packLayer(w.locked),
      drying: packLayer(w.drying),
      growth: packLayer(w.growth),
      fresh: packLayer(w.fresh),
      quality: packLayer(w.quality),
      damage: packLayer(w.damage),
      fire: packLayer(w.fire),
      floor: packLayer(w.floor),
      roof: packLayer(w.roof),
      fuel: packLayer(w.fuel),
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
        weaponWear: c.weaponWear,
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
        strainedSince: c.strainedSince,
        separatedFrom: c.separatedFrom,
        retired: c.retired,
        childhood: c.childhood,
        grief: c.grief,
        away: c.away,
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
    bookmarks: { ...sim.bookmarks },
    // Only graves still standing (one taken down leaves its record behind).
    graves: [...sim.graves].filter(([i]) => sim.graveAt(i)).map(([i, f]) => [i, { ...f }]),
    benchWork: [...sim.benchWork].map(([i, b]) => [i, b.recipe, b.progress]),
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
    history: sim.history.map((d) => [...d] as [number, number, number, number, number]),
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
  if (!loadableVersion(data.version)) {
    throw new Error(`Unsupported save version ${data.version}`);
  }
  const world = new World(data.width, data.height);
  // (A layer that's been through JSON, as the old saves the tests load have, is {"0": …, "1": …}: TypedArray.set
  // takes that as empty, and the map loaded blank. Its values, in order, are the layer; see unpackLayer.)
  const layers = data.layers;
  unpackLayer(world.terrain, layers.terrain);
  unpackLayer(world.feature, layers.feature);
  unpackLayer(world.designation, layers.designation);
  unpackLayer(world.zone, layers.zone);
  unpackLayer(world.blueprint, layers.blueprint);
  unpackLayer(world.delivered, layers.delivered);
  unpackLayer(world.itemType, layers.itemType);
  unpackLayer(world.itemCount, layers.itemCount);
  unpackLayer(world.progress, layers.progress);
  for (const key of ['filth', 'forbidden', 'locked', 'drying'] as const) {
    if (layers[key]) {
      unpackLayer(world[key], layers[key]);
    }
  }
  unpackLayer(world.growth, layers.growth);
  unpackLayer(world.fresh, layers.fresh);
  unpackLayer(world.quality, layers.quality);
  unpackLayer(world.damage, layers.damage);
  unpackLayer(world.fire, layers.fire);
  unpackLayer(world.floor, layers.floor);
  unpackLayer(world.roof, layers.roof);
  unpackLayer(world.fuel, layers.fuel);
  // Saves from before fires burned wood have every fire empty: light them with a full load.
  if (!layers.forbidden) {
    for (let i = 0; i < world.size; i++) {
      const burns = world.feature[i] !== NONE ? featureDef(world.feature[i]).burns : undefined;
      if (burns) {
        world.fuel[i] = burns.capacity;
      }
    }
  }
  // A save from before weapons wore kept no condition for them: each tile held whatever the last stack there left
  // (a meat's days, a tunic's wear), so one knife would last half a year out in the rain and another nine days.
  // As good as new.
  if (!data.weaponsWear) {
    for (let i = 0; i < world.size; i++) {
      if (world.itemType[i] !== NONE && itemDef(world.itemType[i]).weapon) {
        world.fresh[i] = 1;
      }
    }
  }
  world.structureVersion++;

  // (Defaults read from the copy, not the save: two games loaded from one save mustn't share a colonist's parts.)
  const colonists: Colonist[] = data.colonists.map((saved) => {
    const copy = structuredClone(saved);
    return {
      ...copy,
      moveProgress: 0,
      job: null,
      reserved: [],
      practicedAt: copy.practicedAt ?? {},
      age: copy.age ?? 30,
      backstory: copy.backstory ?? 'drifter',
      parents: copy.parents ?? [],
    };
  });
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
  // Recipes are appended over time: an older save has no bill for the newer ones, so they get the default.
  sim.bills = RECIPES.map((r) =>
    data.bills[r.id] ? { ...data.bills[r.id] } : { recipe: r.id, target: r.defaultTarget },
  );
  sim.stats = structuredClone(data.stats);
  sim.log = data.log.map((entry) => ({ ...entry }));
  sim.storyLog = structuredClone(data.storyLog);
  sim.gathering = data.gathering ? structuredClone(data.gathering) : null;
  sim.unburied = structuredClone(data.unburied ?? []);
  sim.wildCover = data.wildCover ?? 0;
  sim.beacon = data.beacon ? structuredClone(data.beacon) : { hours: 0 };
  sim.departed = !!data.departed;
  // (Only tiles on this map: a bookmark is a number key and a tile.)
  sim.bookmarks = Object.fromEntries(
    Object.entries(data.bookmarks ?? {}).filter(([, tile]) => Number.isInteger(tile) && tile >= 0 && tile < world.size),
  );
  sim.graves = new Map((data.graves ?? []).map(([i, f]) => [i, { ...f }]));
  sim.benchWork = new Map((data.benchWork ?? []).map(([i, recipe, progress]) => [i, { recipe, progress }]));
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
  sim.history = (data.history ?? []).map((d) => [...d] as [number, number, number, number, number]);
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
  sim.setTileTemperatures(valuesOf(layers.temperature));
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
