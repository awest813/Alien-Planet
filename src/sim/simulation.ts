import {
  CROP_MIN_TEMP,
  HEATER_TARGET,
  MAGNIFICENT_ROOM,
  describeRoom,
  measureRooms,
  outdoorTemperature,
  updateRoomTemperatures,
} from './climate';
import {
  ANIMALS,
  COLONIST_COLORS,
  COLONIST_NAMES,
  FEATURES,
  ITEMS,
  NONE,
  NORMAL_QUALITY,
  RECIPES,
  RESEARCH,
  THOUGHTS,
  researchDef,
  TRAITS,
  benchSkill,
  driedFrom,
  featureDef,
  fuelOf,
  featureId,
  isFood,
  itemDef,
  itemId,
  matchesIngredient,
  terrainDef,
  BenchType,
  Ingredient,
  MENDABLE,
  STARTING_WEAPON,
  weaponDef,
  terrainId,
  type FeatureDef,
  type JoyKind,
  type JoySpec,
} from './defs';
import {
  animalName,
  animalsAtDawn,
  keepBreedingPairs,
  populateWildlife,
  spareForBreeding,
  updateAnimals,
} from './animals';
import {
  apparelScore,
  comfortRange,
  qualityFactor,
  qualityLabel,
  starterApparel,
  wearApparel,
  wornScore,
  TATTERED,
} from './apparel';
import {
  RaidState,
  armorOf,
  attackAnimal,
  besieging,
  canAttack,
  colonistCombat,
  colonistTarget,
  coverSpot,
  lineOfSight,
  updateEnemies,
  weaponScore,
} from './combat';
import {
  MAP_SIZE,
  MOVE_SPEED,
  NIGHT_END,
  NIGHT_START,
  SLOW_TICKS,
  START_HOUR,
  TICKS_PER_HOUR,
  populationFor,
} from './constants';
import {
  bleedingOf,
  healthFactor,
  STARVING_MOVE,
  starving,
  healthyState,
  needsBedRest,
  needsTending,
  painOf,
  POISONING_HOURS,
  die,
  tend,
  updateExposure,
  updateHealth,
  spreadDisease,
} from './health';
import { Pathfinder } from './pathfinding';
import { PowerState, freshPower, updatePower } from './power';
import { ResearchState, freshResearch, isAvailable, isResearched, researchCost } from './research';
import { DAYS_PER_YEAR, Season, daysUntilWinter, seasonDay, seasonOf, yearOf } from './seasons';
import { emptyXp, learn, rollPassions, rustSkills, skillFactor } from './skills';
import { PassRegions, Rooms, computePassRegions, computeRooms } from './regions';
import { Rng, hash2 } from './rng';
import { Caravan, sellArt, updateCaravan } from './trade';
import { updateAlliances, updateVisitors, worldAction } from './alliances';
import { travel, updateExpeditions } from './expeditions';
import { WET_CHILL, WeatherState, douse, freshWeather, isWet, updateFires, updateWeather, weatherDef } from './weather';
import {
  converse,
  mutualOpinion,
  relationLabel,
  rollTraits,
  socialThoughts,
  traitFactor,
  traitValue,
  updateSocial,
  fadeOpinions,
  checkMarriages,
} from './social';
import { griefThoughts, updateGrief } from './grief';
import { ageThoughts, ailmentPain, needsCare, setRetired } from './ageing';
import { stepLesson, tryLesson, trySeekPlaymate, updateChildhood, updatePlay, updateSchool } from './school';
import {
  Difficulty,
  StoryState,
  coldSnapOn,
  colonyWealth,
  eclipseOn,
  foodDays,
  freshStory,
  heatWaveOn,
  updateStoryteller,
} from './storyteller';
import {
  Bill,
  Animal,
  Colonist,
  Command,
  Enemy,
  Job,
  JobType,
  Carried,
  LogEntry,
  NightResult,
  Priorities,
  Rect,
  RoomInfo,
  ScheduleSlot,
  Shot,
  SKILL_KEYS,
  SkillKey,
  Skills,
  Stats,
  WORK_TYPES,
  WorkTypeKey,
  Artwork,
  Captive,
  Infant,
  Fallen,
  Gathering,
  GatheringKind,
} from './types';
import { EXCELLENT, MASTERWORK, artBeauty, rollQuality, titleFor } from './art';
import {
  ATTENDED_TICKS,
  FESTIVALS,
  FUNERAL_FROM,
  FUNERAL_UNTIL,
  GATHERINGS,
  GRIEF,
  PARTY_FROM,
  PARTY_GAP_TICKS,
  PARTY_MOOD,
  PARTY_UNTIL,
  UNBURIED_DAYS,
  WEDDING_HOUR,
  WEDDING_OPINION,
} from './gatherings';
import { BeaconState, TRANSMIT_HOURS, chooseToStay, depart, freshBeacon, updateBeacon } from './beacon';
import { FEED_BELOW, PRISONER_BED, TALK_TICKS, execute, release, talk, updateCaptives, visitDue } from './prisoners';
import { ADULT, CARER_HUNGER, DRAFT_AGE, ELDER, agePace, canWork, rollPast, updateLifespans } from './lifespans';
import { inHospitalBed, isInfected, scarMove, scarWork } from './body';
import {
  Village,
  freshVillage,
  hoursSpeed,
  rationsEatBelow,
  rationsHunger,
  restDay,
  updateRest,
  updateVillage,
  villageThoughts,
  bedroomExpectation,
} from './village';
import { updateGreatBeast } from './beast';
import { ChronicleEntry, addToChronicle, chronicleKind, chronicleText } from './chronicle';
import { Shaft, digDeeper, digWork, shaftAt } from './depths';
import {
  Diplomacy,
  decline,
  freshDiplomacy,
  fulfil,
  gift,
  hireFighters,
  payTribute,
  updateDiplomacy,
} from './diplomacy';
import {
  BREAK_LABELS,
  BreakKind,
  LEGEND,
  LEGEND_QUALITY,
  Obsession,
  breakLog,
  chooseBreak,
  smashable,
  updateObsession,
  useInspiration,
} from './minds';
import { spreadWildPlants, wildPlantCover } from './plants';
import {
  Designation,
  Filth,
  GROW_ZONE,
  STOCKPILE_ZONE,
  TileKind,
  World,
  growZoneCrop,
  isFreezable,
  isStockpileZone,
  priorityRank,
  stockpileZone,
  zoneAccepts,
} from './world';
import { generateWorld } from './worldgen';
import type { Biome, MapKind } from './biomes';

export { MAP_SIZE, MAP_SIZES, NIGHT_END, NIGHT_START, START_HOUR, TICKS_PER_HOUR, populationFor } from './constants';
const LOG_LIMIT = 60;
const STORY_LIMIT = 200;

// Need rates, per tick.
const FOOD_DECAY = 1 / (TICKS_PER_HOUR * 16);
const REST_DECAY = 1 / (TICKS_PER_HOUR * 18);
const REST_GAIN_BED = 1 / (TICKS_PER_HOUR * 7);
const REST_GAIN_GROUND = 1 / (TICKS_PER_HOUR * 9);
const JOY_DECAY = 1 / (TICKS_PER_HOUR * 24);
// Music: how far it carries, and how much a listener gets from it (per tick, at average skill).
const HEARING = 6;
const LISTEN_GAIN = 1 / (TICKS_PER_HOUR * 10);
// Players this good make listeners feel it more.
const FINE_MUSIC_SKILL = 10;
// Concerts: who can give one, when, for how long, and how close the audience gathers.
// Below this many days of food, the colony's provider goes for food before other work.
const PROVIDE_BELOW_DAYS = 1.5;
const CONCERT_SKILL = 6;
const CONCERT_FROM = 17;
// Listeners get this much more from a harp than from other instruments.
// A built wall a door can be put into (not a door already, nor a natural rock face).
const doorable = (def: FeatureDef): boolean => def.blocksRoom && !def.door && !!def.build && !def.natural;

// Right beside a fire it's warmer than a heater keeps a room, by up to this much.
const FIRESIDE_EXTRA = 6;
const HARP_GAIN = 1.25;
const CONCERT_UNTIL = 22;
const CONCERT_TICKS = TICKS_PER_HOUR * 2;
const CONCERT_RADIUS = 3;
const CONCERT_HOURS_TO_FULL = 1.5;
// An elder telling stories: in the evening, by a lit fire, for an hour and a half, no more than once in two
// days. Listeners enjoy the company; children and teens pick up something of the teller's best skill.
const STORIES_FROM = 18;
const STORIES_UNTIL = 21;
const STORY_TICKS = TICKS_PER_HOUR * 1.5;
const STORY_GAP_TICKS = TICKS_PER_HOUR * 24 * 2;
const STORY_HOURS_TO_FULL = 2;
// Of every tick spent listening, what a child learns of the teller's craft (working at it learns 1).
const STORY_LESSON = 0.5;
// How good a player sounds: 0.5 for a beginner to 1.5 for a master.
const musicQuality = (c: Colonist) => 0.5 + c.skills.artistic / 20;
// Below this after a meal, a colonist eats again straight away.
const STILL_HUNGRY = 0.3;
// Downed with nobody to help: below this much food they crawl to something to eat, this far at most.
// How often a step in off bare ground leaves dirt on a floor (dry, and in the wet).
const TRACK_DIRT = 0.04;
// Work to scrub away one level of mess (about a seventh of an hour), and how far out from the
// colony's middle anyone bothers cleaning outdoors.
const CLEAN_WORK = 30;
const CLEAN_RANGE = 12;
// Hours on a drying rack (in the dry) to turn meat, fish or berries into food that keeps.
const DRYING_HOURS = 12;
// A rage targets furniture this close; its wander job is marked with this stage.
const TANTRUM_RANGE = 10;
const TANTRUM_STAGE = 9;
const SULK_STAGE = 8;
// How far below (or above) their comfort colonists will still go out for fun or idle about.
const JOY_CHILL = 6;
// The best a storage tile can be for an item (critical priority, cold for perishables).
const MAX_STORE_VALUE = 9;
// Levels of mess around someone indoors that make a room feel filthy, and the most a dirty kitchen
// takes off a meal's quality.
const FILTHY = 6;
const MAX_KITCHEN_TAINT = 6;
const TRACK_DIRT_WET = 0.12;
const CRAWL_HUNGRY = 0.15;
// A downed patient this hungry is fed before wounds that aren't bleeding are tended.
const STARVING_PATIENT = 0.1;
// Below this outdoor temperature the fires matter; then wood for this many days of them is kept back from
// the generators.
// Walls and doors count as this many tiles nearer than other blueprints.
const ENCLOSURE_FIRST = 15;
const OBJECTIVE_TICKS = 40;
// Reservation keys that name a tile (`w<tile>` for work, `i<tile>` for items, and so on); `t` and `h` take ids.
const TILE_KEYS = new Set([...'iwbdxsljfc'].map((ch) => ch.charCodeAt(0)));
// The tile in a key like `i1234`, read in place (this runs for every candidate in every search, and slicing
// out a new string each time adds up). NaN when the rest isn't all digits (an id key such as `fd12`).
function keyTile(key: string): number {
  let n = 0;
  for (let k = 1; k < key.length; k++) {
    const d = key.charCodeAt(k) - 48;
    if (d < 0 || d > 9) {
      return NaN;
    }
    n = n * 10 + d;
  }
  return key.length > 1 ? n : NaN;
}

// Undrafted colonists keep this far from a siege camp, except to bring in, tend or feed the hurt (and eat).
const SIEGE_DANGER = 14;
const SIEGE_EXEMPT = new Set<string>(['shelter', 'rescue', 'tend', 'feed', 'eat', 'wander']);
// What the later research does.
const MASONRY_SPEED = 1.2;
const HAY = itemId('hay');
const IRRIGATION_YIELD = 1.25;
// Steel tools (steelmaking) for miners and woodcutters; seed from the best plants (plant breeding).
const STEEL_SPEED = 1.25;
// Weapons and armour, for a quick look at whether any are lying about before searching for them.
const GEAR_ITEMS = ITEMS.filter((i) => i.weapon || i.armor).map((i) => i.id);
// Each round of further study (up to ten) speeds all work a little.
const FURTHER_STUDY_SPEED = 0.03;
const FURTHER_STUDY_ROUNDS = 10;
const BREEDING_YIELD = 1.2;
// With no raids to cost it time and stores, a peaceful colony's food would only pile up: its fields give a
// little less, so food stays something to plan for.
const PEACEFUL_YIELD = 0.8;
const PRESERVING_RATE = 2 / 3;
// The first days, when colonists expect little.
const LOW_EXPECTATION_DAYS = 12;
const COLD_FOR_FIRES = 8;
const FIREWOOD_RESERVE_DAYS = 3;
// Haulers fill the animals' troughs only while the colony has this many days of food in store.
const TROUGH_FOOD_DAYS = 3;
// Wood the colonists land with.
const SALVAGED_WOOD = 50;
const CRAWL_RANGE = 25;
// How long "nowhere to carry this patient" stands before a doctor looks again.
const NO_RESCUE_RETRY = TICKS_PER_HOUR / 2;
// Jobs nobody leaves for a wedding or a funeral.
const BUSY_FOR_RITES = new Set<JobType>([
  'tend',
  'rescue',
  'capture',
  'feed',
  'eat',
  'extinguish',
  'shelter',
  'warmUp',
  'rest',
  'sleep',
]);
// A gathering fills recreation in this many hours.
const GATHERING_HOURS_TO_FULL = 2;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// A memorial's inscription: the fallen by name, or (before anyone has died) a dedication.
const memorialTitle = (names: string[]) =>
  names.length === 0
    ? 'To Absent Friends'
    : names.length <= 3
      ? `In Memory of ${names.join(', ').replace(/, ([^,]*)$/, ' and $1')}`
      : 'To Our Fallen';
// Beauty within SURROUNDINGS tiles needed to feel pleasant, and beautiful.
const SURROUNDINGS = 2;
const PLEASANT_AROUND = 6;
const BEAUTIFUL_AROUND = 15;
// Flowers in winter keep this share of their beauty.
const WINTER_FLOWERS = 0.2;
const WALK_HOURS_TO_FULL = 4;
const JOY_GAIN_WALK = 1 / (TICKS_PER_HOUR * WALK_HOURS_TO_FULL);
// Recreation tolerance: past a free allowance, what a kind is worth falls as
// (1 + TOLERANCE × FREE_JOY) / (1 + TOLERANCE × recent amount of it).
const TOLERANCE = 1;
const FREE_JOY = 0.5;
const MIN_JOY_EFFICIENCY = 0.25;
// A game for two, played alone, is worth this share.
const COMPANY_ALONE = 0.4;
// How much a tile of walking takes off an option's appeal (in need per hour).
const JOY_DISTANCE_COST = 0.004;
// Up to half as much again from a walk among trees or by the water.
const SCENIC_BONUS = 0.5;
// A kind of recreation counts towards variety when it's a fair share of what they've had lately; when
// one kind is nearly all of it (and there's been a fair amount), it gets old.
const VARIETY_MIN = 0.08;
const VARIETY_SHARE = 0.12;
const SAME_OLD_TOTAL = 0.6;
const SAME_OLD_SHARE = 0.85;
const EAT_TICKS = 60;

// Mood below this for a couple of hours risks a mental break.
export const BREAK_THRESHOLD = 12;
const NICE_ROOM = 25;

export interface SimTimers {
  rotted: number;
  frostLosses: number;
  iceNoticeYear: number;
  nextDressCheck: [number, number][];
  nextWarmSearch: [number, number][];
  nextFoodSearch: [number, number][];
  // Missing from saves made before these were kept.
  ordered?: number[];
  nextPartyTick?: number;
  nextTactics?: [number, number][];
  nextShelterSearch?: [number, number][];
  shelterLogged?: [number, number][];
  // A concert under way when the game was saved.
  concert?: { player: number; tile: number; endsAt: number } | null;
  // Stories by a fire under way when the game was saved.
  storyCircle?: { teller: number; fire: number; endsAt: number } | null;
}

// Moments the UI reacts to: raids, deaths and collapses pause the game.
export type SimEvent =
  | 'obsession'
  | 'dusk'
  | 'dawn'
  | 'raid'
  | 'raidNear'
  | 'death'
  | 'collapse'
  | 'fire'
  | 'manhunters'
  | 'goal'
  | 'concert'
  | 'gathering'
  | 'shipAnswered'
  | 'shipLanded'
  | 'birth';

// A notable moment in the colony's history, for the story screen.
export interface StoryEntry {
  day: number;
  hour: number;
  text: string;
  tone: LogEntry['tone'];
}

const JOB_FOR_DESIGNATION: Record<number, JobType> = {
  [Designation.MINE]: 'mine',
  [Designation.CHOP]: 'chop',
  [Designation.FORAGE]: 'forage',
  [Designation.DECONSTRUCT]: 'deconstruct',
};

const WORK_JOBS = new Set<JobType>([
  'mine',
  'chop',
  'forage',
  'construct',
  'sculpt',
  'deconstruct',
  'sow',
  'harvestCrop',
]);
const TEND_TICKS = 80;
const MEDICINE = itemId('herbalMedicine');
// A doctor with time to spare eases an elder's aches with herbal medicine (while the colony has more than
// this much to spare for wounds): they hurt less for three days.
const SOOTHE_RESERVE = 3;
const EASE_TICKS = TICKS_PER_HOUR * 24 * 3;
const WOOD = itemId('wood');
// A stored weapon must be this much better (by weaponScore) before someone swaps theirs for it.
const WEAPON_UPGRADE = 1.15;
// A different kind of weapon (a longbow over a recurve) only needs to be somewhat better.
const NEW_WEAPON_UPGRADE = 1.03;
// Raiders this close send undrafted colonists running for shelter.
const SHELTER_RANGE = 14;
const TOOL_KIT = itemId('toolKit');
// Work a tool kit speeds up (and wears down).
const TOOL_WORK = new Set<JobType>(['mine', 'chop', 'forage', 'construct', 'deconstruct', 'sow', 'harvestCrop']);
// A normal tool kit makes that work this much faster; better-made kits more, poor ones less.
const TOOL_BONUS = 0.3;
// Hours of work a tool kit lasts.
const TOOL_HOURS = 80;
// An inspired colonist's work speed.
const INSPIRED_SPEED = 1.4;
const RAW_FISH = itemId('rawFish');
// Ticks of handling before each taming attempt.
const TAME_TICKS = 150;
const SHALLOW_WATER = terrainId('shallowWater');
const ICE = terrainId('ice');
// Work per catch at a fishing spot, and fish per catch.
const FISH_WORK = 90;
const FISH_PER_CATCH = 3;
// Colonists only fish while the colony holds less than this much nutrition per head.
const FISH_FOOD_TARGET = 6;
// Hunters leave marked game farther than this from home until it wanders closer: on a big map, a hunt
// across the valley ends with someone mauled, or downed in the snow, a long way from help.
export const HUNT_RANGE = 48;
// Shallow water freezes from the shore inwards below this, and thaws above THAW.
const FREEZE = -2;
const THAW = 3;
// Below this, crops in the field start dying.
const FROST = -5;

// Plants are worked from their own tile; rock, buildings, and workbenches from an adjacent one.
const standsOn = (type: JobType): boolean =>
  type === 'chop' || type === 'forage' || type === 'sow' || type === 'harvestCrop';

// Chessboard distance between two tiles.
const chebyshevTiles = (w: World, a: number, b: number): number =>
  Math.max(Math.abs(w.xOf(a) - w.xOf(b)), Math.abs(w.yOf(a) - w.yOf(b)));

const defaultSchedule = (): ScheduleSlot[] =>
  Array.from({ length: 24 }, (_, h) => (h >= NIGHT_START || h < NIGHT_END ? 'S' : 'A'));

// Every colonist starts willing to do everything at normal priority.
// The work order with mining moved ahead of plant cutting (see workOrder).
// Each dawn, recreation had lately counts for half as much; a trace that small is forgotten.
const JOY_MEMORY_PER_DAY = 0.5;
function fadeRecentJoy(c: Colonist): void {
  for (const key of Object.keys(c.recentJoy) as JoyKind[]) {
    const left = c.recentJoy[key]! * JOY_MEMORY_PER_DAY;
    if (left < 0.01) {
      delete c.recentJoy[key];
    } else {
      c.recentJoy[key] = left;
    }
  }
}

const STONE_FIRST_ORDER: readonly WorkTypeKey[] = (() => {
  const order: WorkTypeKey[] = WORK_TYPES.filter((w) => w !== 'mining');
  order.splice(order.indexOf('plantCutting'), 0, 'mining');
  return order;
})();
const defaultPriorities = (): Priorities => Object.fromEntries(WORK_TYPES.map((work) => [work, 3])) as Priorities;

function createColonist(id: number, name: string, tile: number, rng: Rng, cold = false): Colonist {
  const skills: Skills = {
    mining: rng.int(1, 9),
    construction: rng.int(1, 9),
    plants: rng.int(1, 9),
    cooking: rng.int(1, 9),
    crafting: rng.int(1, 9),
    research: rng.int(1, 9),
    medicine: rng.int(1, 9),
    combat: rng.int(1, 9),
    animals: rng.int(1, 9),
    artistic: rng.int(1, 9),
  };
  const c: Colonist = {
    id,
    name,
    color: COLONIST_COLORS[id % COLONIST_COLORS.length],
    age: 30,
    backstory: 'drifter',
    parents: [],
    tile,
    path: [],
    moveProgress: 0,
    skills,
    priorities: defaultPriorities(),
    schedule: defaultSchedule(),
    needs: { food: 0.8, rest: 0.9, joy: 0.7 },
    mood: 55,
    thoughts: [],
    job: null,
    carrying: null,
    reserved: [],
    workStreak: 0,
    sleeping: false,
    restTicks: 0,
    restOutside: 0,
    restCold: 0,
    nightTicks: 0,
    exposedTicks: 0,
    breakUntil: 0,
    lowMoodTicks: 0,
    traits: rollTraits(rng),
    opinions: {},
    lover: -1,
    spouse: -1,
    health: healthyState(),
    drafted: false,
    draftTarget: -1,
    cooldown: 0,
    skillXp: emptyXp(),
    passions: rollPassions(rng),
    weapon: STARTING_WEAPON,
    weaponQuality: NORMAL_QUALITY,
    armor: null,
    stance: 'cover',
    focus: -1,
    tool: null,
    apparel: starterApparel(cold),
    practicedAt: {},
    recentJoy: {},
  };
  rollPast(c, rng);
  return c;
}

// Which skill a piece of work trains.
function skillFor(type: JobType): SkillKey {
  switch (type) {
    case 'mine':
      return 'mining';
    case 'construct':
    case 'deconstruct':
      return 'construction';
    case 'sculpt':
      return 'artistic';
    default:
      return 'plants';
  }
}

// Strangers start with a mild, random impression of each other.
function introduce(a: Colonist, b: Colonist, rng: Rng): void {
  a.opinions[b.id] = rng.int(-10, 15);
  b.opinions[a.id] = rng.int(-10, 15);
}

// The whole colony simulation. It knows nothing about Phaser or the DOM: the renderer
// reads its state, and the UI changes it only through `apply(command)`.
// What taking something down gives back: about three quarters, but never all of a cost of two or
// more (a single item can't be split).
const refund = (count: number): number => Math.min(count > 1 ? count - 1 : count, Math.round(count * 0.75));

// Work that stops for a fire near home.
const FIRE_INTERRUPTS = new Set<JobType>([
  'mine',
  'chop',
  'forage',
  'construct',
  'sculpt',
  'deconstruct',
  'sow',
  'harvestCrop',
  'haul',
  'deliver',
  'craft',
  'joy',
  'research',
  'fish',
  'tame',
  'clean',
  'warden',
  'lesson',
  'wander',
]);

export class Simulation {
  public tick = 0;
  public readonly reservations = new Map<string, number>();
  public stats: Stats = {
    produced: {},
    hauled: 0,
    built: 0,
    tended: 0,
    raidsRepelled: 0,
    kills: 0,
    hunted: 0,
    tamed: 0,
    wintersSurvived: 0,
  };
  public log: LogEntry[] = [];
  public storyLog: StoryEntry[] = [];
  // The colony's history, kept for good.
  public chronicle: ChronicleEntry[] = [];
  // The colony at each dawn, for the history graphs: [day, people, average mood, wealth, days of food].
  public history: [number, number, number, number, number][] = [];
  // The signal beacon's progress towards a ship, and whether the colony has boarded it (the end).
  public beacon: BeaconState = freshBeacon();
  public departed = false;
  // How many trees and berry bushes the map started with: regrowth stops there.
  public wildCover = 0;
  // A party, festival, wedding or funeral, planned or under way (one at a time).
  public gathering: Gathering | null = null;
  // The dead awaiting burial, and who lies in each grave.
  public unburied: Fallen[] = [];
  public graves = new Map<number, Fallen>();
  // No party before this tick.
  private nextPartyTick = 0;
  // Colonists who couldn't reach the gathering, and when they may try again.
  private noGatherUntil = new Map<number, number>();
  // An evening concert under way: who's playing, at which instrument, until when.
  public concert: { player: number; tile: number; endsAt: number } | null = null;
  // An elder telling stories by a fire (saved with the timers: a load ends it, counted as told; see resumeAfterLoad).
  public storyCircle: { teller: number; fire: number; endsAt: number } | null = null;
  // Finished sculptures by tile.
  public artworks = new Map<number, Artwork>();
  public story: StoryState = freshStory();
  // The land the colony started in: its climate, weather and wildlife (see biomes.ts).
  public biome: Biome = 'temperate';
  public enemies: Enemy[] = [];
  // Fighters a friendly faction sent to help against a raid (see combat.ts).
  public allies: Enemy[] = [];
  // Raiders lying wounded, and prisoners (see prisoners.ts).
  public captives: Captive[] = [];
  // The colony's leader and policies (see village.ts).
  public village: Village = freshVillage();
  // Mine shafts by tile: how deep each has gone.
  public shafts: Record<number, Shaft> = {};
  // Favours asked by the neighbours, and peace bought from raiders.
  public diplomacy: Diplomacy = freshDiplomacy();
  // A colonist seized by a vision for a legendary work (see minds.ts).
  public obsession: Obsession | null = null;
  // Babies, carried by a parent until they can walk (see lifespans.ts).
  public infants: Infant[] = [];
  public nextInfantId = 0;
  public nextEnemyId = 0;
  public raid: RaidState | null = null;
  public animals: Animal[] = [];
  public research: ResearchState = freshResearch();
  public power: PowerState = freshPower();
  // Buildings on the power grid and sun lamps, refreshed when features change.
  private powerTiles: number[] = [];
  // Buildings that burn fuel for heat and light.
  private fireTiles: number[] = [];
  // Bumped whenever a fire goes out or is lit again, so rooms work out their heat afresh.
  public fuelVersion = 0;
  private fishingSpots: number[] = [];
  // Year of the last "freezing over" message, so winter's freeze-thaw cycles don't repeat it.
  private iceNoticeYear = -1;
  // Story entries ever written (the log itself is capped), for notifications.
  public storyCount = 0;
  public weather: WeatherState = freshWeather();
  // Tiles on fire (the world's fire layer holds how long each has left).
  public burning = new Set<number>();
  // How far firefighters have got with each fire they're beating at.
  public dousing = new Map<number, number>();
  // Tick of the last lightning strike, for the renderer's flash.
  public lastLightning = -1;
  // A visiting trade caravan, if one is on its way, here, or leaving.
  public caravan: Caravan | null = null;
  // Standing with each faction, -100..100 (missing: the starting value).
  public goodwill: Record<number, number> = {};
  public nextVisitorId = 0;
  // Drafted colonists walking where the player sent them (not where their stance took them).
  private ordered = new Set<number>();
  // When each drafted colonist next rethinks their stance (straight away on being drafted).
  private nextTactics = new Map<number, number>();
  // Earliest tick each colonist may look for shelter again after finding none.
  private nextShelterSearch = new Map<number, number>();
  // When each colonist was last reported running for shelter.
  private shelterLogged = new Map<number, number>();
  // Buildings lost in a raid, to go back on the build list once it's over: [tile, feature].
  public pendingRebuilds: [number, number][] = [];
  // Earliest tick each colonist next considers changing clothes.
  private nextDressCheck = new Map<number, number>();
  // Earliest tick each colonist may search again for somewhere warmer (or cooler).
  private nextWarmSearch = new Map<number, number>();
  // Stockpile tiles where food keeps (refreshed with spoilage).
  private coldStores = 0;

  public coldStorageCount(): number {
    return this.coldStores;
  }

  // Bookkeeping a save carries so a loaded game carries on exactly as it would have.
  public exportTimers(): SimTimers {
    return {
      rotted: this.rotted,
      frostLosses: this.frostLosses,
      iceNoticeYear: this.iceNoticeYear,
      nextDressCheck: [...this.nextDressCheck],
      nextWarmSearch: [...this.nextWarmSearch],
      nextFoodSearch: [...this.nextFoodSearch],
      ordered: [...this.ordered],
      nextPartyTick: this.nextPartyTick,
      nextTactics: [...this.nextTactics],
      nextShelterSearch: [...this.nextShelterSearch],
      shelterLogged: [...this.shelterLogged],
      concert: this.concert ? { ...this.concert } : null,
      storyCircle: this.storyCircle ? { ...this.storyCircle } : null,
    };
  }

  // Picks up after a load: timers, sleepers back in bed, and the cold-storage count.
  public resumeAfterLoad(timers: SimTimers): void {
    this.rotted = timers.rotted;
    this.frostLosses = timers.frostLosses;
    this.iceNoticeYear = timers.iceNoticeYear;
    this.nextDressCheck = new Map(timers.nextDressCheck);
    this.nextWarmSearch = new Map(timers.nextWarmSearch);
    timers.nextFoodSearch.forEach(([id, tick]) => this.nextFoodSearch.set(id, tick));
    // A drafted colonist walking where the player sent them keeps going there after a load.
    this.ordered = new Set(timers.ordered ?? []);
    this.nextPartyTick = timers.nextPartyTick ?? 0;
    this.nextTactics = new Map(timers.nextTactics ?? []);
    this.nextShelterSearch = new Map(timers.nextShelterSearch ?? []);
    this.shelterLogged = new Map(timers.shelterLogged ?? []);
    // A concert under way is played to its end as the game loads (jobs aren't saved, so the audience has gone):
    // it counts as given, and the player feels it.
    const player = timers.concert ? this.colonists[timers.concert.player] : undefined;
    if (player && !player.health.dead && !player.away) {
      this.finishConcert(player);
    }
    // Stories by the fire, the same way: an evening half an hour into the telling counts as told (it was lost,
    // and with the next one two days off, the evening went uncounted).
    const circle = timers.storyCircle;
    const teller = circle ? this.colonists[circle.teller] : undefined;
    if (
      circle &&
      teller &&
      !teller.health.dead &&
      !teller.away &&
      this.tick >= circle.endsAt - STORY_TICKS + TICKS_PER_HOUR / 2
    ) {
      this.addThought(teller, 'toldStories');
      this.stats.storyNights = (this.stats.storyNights ?? 0) + 1;
    }
    for (const c of this.living()) {
      if (c.sleeping) {
        this.reserve(c, `b${c.tile}`);
        // A patient on bed rest stays on it (asleep, they'd wake rested and go straight back to bed).
        c.job = needsBedRest(c)
          ? this.makeJob('rest', c.tile, { wait: TICKS_PER_HOUR * 4 })
          : this.makeJob('sleep', c.tile);
      } else if (this.eatingWhenSaved(c)) {
        // Someone in the middle of a meal finishes it, rather than putting it in storage and going back for it.
        this.assign(c, this.makeJob('eat', -1, { item: c.carrying!.item, stage: 2 }), []);
        this.headToTable(c, c.job!);
      }
    }
    this.coldStores = this.storageTiles().filter((i) => this.isColdStore(i)).length;
    // A gathering under way: its guests (whose jobs weren't saved either) go back to it before anything else
    // can catch their eye.
    const g = this.gathering;
    if (g?.started && this.tick < g.endsAt && !this.raid) {
      this.inviteGuests(g);
    }
  }
  private lampTiles: number[] = [];
  private gridVersion = -1;
  private lit = new Uint8Array(0);
  private litKey = '';
  // Food that rotted since the last report.
  private rotted = 0;
  // Crops lost to frost since the last report.
  private frostLosses = 0;
  private lastSeason: Season | null = null;
  public nextAnimalId = 0;
  // Recent attacks, for the renderer.
  public shots: Shot[] = [];
  public firstNight: NightResult = 'pending';
  public objectivesDone: Record<string, boolean> = {};
  public bills: Bill[] = RECIPES.map((r) => ({ recipe: r.id, target: r.defaultTarget }));
  // Temperature per room id (see `rooms`).
  public roomTemps: number[] = [];
  // Drained by the controller each frame.
  public readonly events: SimEvent[] = [];

  public readonly pathfinder: Pathfinder;
  private regions: PassRegions;
  private rooms: Rooms;
  private roomContents: ReturnType<typeof measureRooms> = [];
  private cachedVersion = -1;
  // Colonists who spent their last tick fighting, for activity labels.
  private readonly fighting = new Set<number>();
  // Tick after which a starving colonist may search for food again.
  private readonly nextFoodSearch = new Map<number, number>();
  private contentsVersion = '';
  private wasNight = false;

  constructor(
    public readonly world: World,
    public readonly colonists: Colonist[],
    public readonly seed: number,
    public readonly rng: Rng,
  ) {
    this.pathfinder = new Pathfinder(world);
    // Map generation and loading write the layers directly.
    world.reindex();
    this.wasNight = this.isNight();
  }

  public static newColony(
    seed: number,
    difficulty: Difficulty = 'standard',
    size = MAP_SIZE,
    land: { biome?: Biome; map?: MapKind } = {},
  ): Simulation {
    const biome = land.biome ?? 'temperate';
    const { world, spawn } = generateWorld(size, size, seed, biome, land.map);
    const rng = new Rng(seed ^ 0x9e3779b9);
    const names = [...COLONIST_NAMES];
    const colonists: Colonist[] = [];
    // Land on dry ground around the spawn point.
    const spots = [spawn, ...world.neighbors(spawn)].filter(
      (i) => world.isPassable(i) && terrainDef(world.terrain[i]).buildable,
    );
    const { colonists: landing } = populationFor(size);
    for (let id = 0; id < landing; id++) {
      const name = names.splice(rng.int(0, names.length - 1), 1)[0];
      const c = createColonist(id, name, spots[id % spots.length], rng, biome === 'tundra');
      for (const other of colonists) {
        introduce(c, other, rng);
      }
      colonists.push(c);
    }
    // Survival rations to tide the colony over until the first harvest.
    world.dropItemNear(spawn, itemId('meal'), 4 * landing);
    // On the tundra they land in parkas, with a tunic each for the summer.
    if (biome === 'tundra') {
      world.dropItemNear(spawn, itemId('tunic'), landing);
    }
    // A little silver for the first traders who come by.
    world.dropItemNear(spawn, itemId('silver'), 100);
    // Timber salvaged from the landing: enough for a door and a bed or two, to make the first night easier.
    world.dropItemNear(spawn, itemId('wood'), SALVAGED_WOOD);
    const sim = new Simulation(world, colonists, seed, rng);
    sim.story = freshStory(difficulty);
    sim.biome = biome;
    // Eight animals on the standard map, more on bigger ones.
    populateWildlife(sim, Math.round((8 * world.size) / (MAP_SIZE * MAP_SIZE)), spawn);
    sim.wildCover = wildPlantCover(sim);
    sim.addLog(
      `${NUMBER_WORDS[landing] ?? landing} colonists have landed with a few days of rations and some salvaged timber. Give orders from the build bar (Chop, Mine, Stockpile) and they will get to it.`,
      'info',
      true,
    );
    return sim;
  }

  // Newcomers on the tundra come in parkas unless it's summer.
  private dressForCold(): boolean {
    return this.biome === 'tundra' && this.season !== 'Summer';
  }

  // Everyone alive and here (not away on an expedition).
  public living(): Colonist[] {
    return this.colonists.filter((c) => !c.health.dead && !c.away);
  }

  // Everyone alive, here or away: the colony's count against its population cap.
  public headcount(): number {
    return this.colonists.filter((c) => !c.health.dead).length;
  }

  // The walkable region visitors arrive in: the colony's own if it reaches the map edge, otherwise
  // the open country nearest it (a colony walled in on every side still gets raided and visited).
  public outsideRegion(): number | undefined {
    const anchor = this.living()[0];
    if (!anchor) {
      return undefined;
    }
    const w = this.world;
    const onEdge = (i: number) => {
      const x = w.xOf(i);
      const y = w.yOf(i);
      return (x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1) && w.isPassable(i);
    };
    const own = this.regionOf(anchor.tile);
    if (this.nearest(anchor.tile, (i) => onEdge(i) && this.regionOf(i) === own, 1).length > 0) {
      return own;
    }
    // Sealed in: the largest stretch of open country (never some tiny pocket by the edge).
    let best: number | undefined;
    for (let i = 0; i < w.size; i++) {
      const region = this.regionOf(i);
      if (onEdge(i) && (best === undefined || this.regions.sizes[region] > this.regions.sizes[best])) {
        best = region;
      }
    }
    return best;
  }

  // A name nobody in the colony (or among its babies) has yet.
  public freshName(): string {
    const taken = new Set([...this.colonists.map((c) => c.name), ...this.infants.map((i) => i.name)]);
    const free = COLONIST_NAMES.filter((n) => !taken.has(n));
    return free.length > 0 ? this.rng.pick(free) : `${this.rng.pick(COLONIST_NAMES)} ${this.colonists.length + 1}`;
  }

  public dieOf(c: Colonist, cause: string): void {
    die(this, c, cause);
  }

  // Someone joins the colony on a given tile (a prisoner won over, say).
  public adopt(name: string, tile: number): Colonist {
    const taken = new Set(this.colonists.map((o) => o.name));
    let unique = name;
    for (let n = 2; taken.has(unique); n++) {
      unique = `${name} ${n}`;
    }
    const c = createColonist(this.colonists.length, unique, tile, this.rng, this.dressForCold());
    for (const other of this.colonists) {
      introduce(c, other, this.rng);
    }
    this.colonists.push(c);
    return c;
  }

  // A traveller joins at the map edge nearest the colony. Returns the new colonist, if any.
  public addWanderer(): Colonist | null {
    const anchor = this.living()[0];
    const region = this.outsideRegion();
    if (!anchor || region === undefined) {
      return null;
    }
    const w = this.world;
    const edge = this.nearest(
      anchor.tile,
      (i) => {
        const x = w.xOf(i);
        const y = w.yOf(i);
        return (x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1) && this.regionOf(i) === region;
      },
      1,
    )[0];
    if (edge === undefined) {
      return null;
    }
    const c = createColonist(this.colonists.length, this.freshName(), edge, this.rng, this.dressForCold());
    for (const other of this.colonists) {
      introduce(c, other, this.rng);
    }
    this.colonists.push(c);
    return c;
  }

  // ---- Time ----

  public get totalHours(): number {
    return this.tick / TICKS_PER_HOUR + START_HOUR;
  }

  public get hour(): number {
    return this.totalHours % 24;
  }

  public get day(): number {
    return Math.floor(this.totalHours / 24) + 1;
  }

  // Call after changing `tick` directly (e.g. when loading) so no dusk/dawn event fires.
  public syncClock(): void {
    this.wasNight = this.isNight();
    // Seasons turn at midnight but are announced at dawn: before dawn, the last announced
    // season is yesterday's.
    this.lastSeason = seasonOf(this.hour < NIGHT_END ? this.totalHours - 24 : this.totalHours);
  }

  public isNight(): boolean {
    const h = this.hour;
    return h >= NIGHT_START || h < NIGHT_END;
  }

  public outdoorTemperature(): number {
    // Asked many times a tick (every tile outdoors that someone stands on): worked out once for the moment it's
    // asked about, and again only when the hour, the weather or a cold snap, heat wave or eclipse changes.
    const st = this.story;
    const c = this.outdoorCache;
    if (
      c.tick === this.tick &&
      c.weather === this.weather.kind &&
      c.cold === st.coldSnapUntil &&
      c.heat === st.heatWaveUntil &&
      c.eclipse === st.eclipseUntil &&
      c.biome === this.biome
    ) {
      return c.value;
    }
    const coldSnap = coldSnapOn(this) ? 12 : 0;
    const heatWave = heatWaveOn(this) ? 10 : 0;
    const eclipse = eclipseOn(this) ? 3 : 0;
    const value =
      outdoorTemperature(this.totalHours, this.seed, this.biome) -
      coldSnap +
      heatWave -
      eclipse +
      weatherDef(this).temp;
    this.outdoorCache = {
      tick: this.tick,
      weather: this.weather.kind,
      cold: st.coldSnapUntil,
      heat: st.heatWaveUntil,
      eclipse: st.eclipseUntil,
      biome: this.biome,
      value,
    };
    return value;
  }
  private outdoorCache: {
    tick: number;
    weather: string;
    cold: number | undefined;
    heat: number | undefined;
    eclipse: number | undefined;
    biome: string;
    value: number;
  } = { tick: -1, weather: '', cold: undefined, heat: undefined, eclipse: undefined, biome: '', value: 0 };

  // Whether clouds or rain hide the sky (no aurora to see).
  public weatherIsOvercast(): boolean {
    return this.weather.kind !== 'clear';
  }

  // The middle of the colony: the centre of its buildings, or the first colonist before there
  // are any. Lightning and firefighting centre on it.
  public homeTile(): number | undefined {
    const w = this.world;
    // (Buildings and crops change it; felling a tree or mining a rock doesn't.)
    if (this.homeVersion !== w.builtVersion) {
      this.homeVersion = w.builtVersion;
      let sx = 0;
      let sy = 0;
      let n = 0;
      // (Not a siege party's camp.)
      const camp = new Set(this.raid?.siege?.built ?? []);
      for (const i of w.tilesWith('features')) {
        if (!featureDef(w.feature[i]).natural && !featureDef(w.feature[i]).crop && !camp.has(i)) {
          sx += w.xOf(i);
          sy += w.yOf(i);
          n++;
        }
      }
      this.home = n > 0 ? w.idx(Math.round(sx / n), Math.round(sy / n)) : undefined;
    }
    return this.home ?? this.living()[0]?.tile;
  }

  private home: number | undefined;
  private homeVersion = -1;

  // Whether hunters will go after game at `tile`: within HUNT_RANGE of the colony's centre (before anything
  // is built, of the middle of the map, where colonies land, rather than of whoever happens to be first).
  public inHuntRange(tile: number, slack = 0): boolean {
    this.homeTile();
    const w = this.world;
    const anchor = this.home ?? w.idx(w.width >> 1, w.height >> 1);
    return w.distance(anchor, tile) <= HUNT_RANGE + slack;
  }

  // Whether a hunter will come for this marked animal: in range, or worth the trek (the neighbours' quarry,
  // or livestock, which isn't the danger the range guards against).
  public huntable(a: Animal): boolean {
    return a.hunted && (a.quarry || a.tame || this.inHuntRange(a.tile));
  }

  // ---- Main loop ----

  public step(): void {
    this.stepping = true;
    try {
      this.stepOnce();
    } finally {
      this.stepping = false;
    }
  }

  private stepOnce(): void {
    this.tick++;
    // The interface drains these each frame; with nobody listening (tests, balance runs) keep
    // only the latest few.
    if (this.events.length > 64) {
      this.events.splice(0, this.events.length - 64);
    }
    this.ensureRegions();

    const night = this.isNight();
    if (night !== this.wasNight) {
      this.wasNight = night;
      if (night) {
        this.events.push('dusk');
      } else {
        this.onDawn();
        this.events.push('dawn');
      }
    }

    updateStoryteller(this);

    const slow = this.tick % SLOW_TICKS === 0;
    if (slow) {
      this.refreshGrid();
      updatePower(this, this.powerTiles, SLOW_TICKS / TICKS_PER_HOUR);
      this.burnFuel(SLOW_TICKS / TICKS_PER_HOUR);
      this.updateClimate();
      this.growCrops();
      this.updateSpoilage(SLOW_TICKS / TICKS_PER_HOUR);
      updateFires(this, SLOW_TICKS / TICKS_PER_HOUR);
      updateSocial(this);
      this.checkConcert();
      this.checkStories();
      this.updateGathering();
    }
    if (this.tick % TICKS_PER_HOUR === 0) {
      // An elder's herbal rub wears off.
      for (const c of this.colonists) {
        if (c.health.easedUntil !== undefined && this.tick >= c.health.easedUntil) {
          c.health.easedUntil = undefined;
        }
      }
      this.updateIce();
      updateWeather(this);
      updateBeacon(this);
      updateCaptives(this);
      updateLifespans(this);
      updateSchool(this);
      updatePlay(this);
      updateChildhood(this);
      updateObsession(this);
      updateVillage(this);
      spreadDisease(this);
      updateGreatBeast(this);
      updateDiplomacy(this);
      updateAlliances(this);
      updateExpeditions(this);
      this.weatherFilth();
    }

    for (const c of this.colonists) {
      if (c.health.dead) {
        continue;
      }
      // On an expedition: walking off the map, or gone from it.
      if (c.away) {
        travel(this, c);
        continue;
      }
      if (slow) {
        updateExposure(this, c, SLOW_TICKS / TICKS_PER_HOUR);
        wearApparel(this, c, SLOW_TICKS / TICKS_PER_HOUR);
        updateHealth(this, c, SLOW_TICKS / TICKS_PER_HOUR);
        if (c.health.dead) {
          continue;
        }
        this.updateMood(c);
      }
      this.updateColonist(c);
    }
    updateEnemies(this);
    updateAnimals(this);
    updateCaravan(this);
    updateVisitors(this);

    // Goals are checked often enough that one ticks off moments after it's done (a couple of seconds at
    // normal speed), but not every tick.
    // The goals the player is working on now are checked often, so a finished one ticks off at once; the rest
    // (some look over the whole map) once an hour.
    if (this.tick % OBJECTIVE_TICKS === 0) {
      this.checkObjectives(this.tick % TICKS_PER_HOUR !== 0);
    }
  }

  public apply(cmd: Command): void {
    const w = this.world;
    switch (cmd.type) {
      case 'designate': {
        const value = {
          mine: Designation.MINE,
          chop: Designation.CHOP,
          forage: Designation.FORAGE,
          deconstruct: Designation.DECONSTRUCT,
        }[cmd.kind];
        // Dragged over any buildings, a deconstruct order takes only those; floors and roofs come
        // up when they're all the drag covers.
        let buildingsOnly = false;
        if (cmd.kind === 'deconstruct') {
          this.forRect(cmd.rect, (i) => {
            buildingsOnly ||= w.feature[i] !== NONE && !!featureDef(w.feature[i]).build;
          });
        }
        this.forRect(cmd.rect, (i) => {
          const f = w.feature[i];
          if (cmd.kind === 'deconstruct') {
            const target = this.deconstructTarget(i);
            if (target !== NONE && (!buildingsOnly || !featureDef(target).layer)) {
              w.designation[i] = value;
              w.progress[i] = 0;
              w.markDirty(i);
            }
            return;
          }
          if (f === NONE) {
            return;
          }
          const def = featureDef(f);
          const ok = def.harvest?.work === cmd.kind;
          if (ok) {
            w.designation[i] = value;
            w.markDirty(i);
            if (def.shaft) {
              shaftAt(this, i).stopped = false;
            }
          }
        });
        break;
      }
      case 'cancel':
        this.forRect(cmd.rect, (i) => {
          if (w.feature[i] !== NONE && featureDef(w.feature[i]).shaft) {
            shaftAt(this, i).stopped = true;
          }
          if (w.designation[i] !== Designation.NONE) {
            w.designation[i] = Designation.NONE;
            w.markDirty(i);
          }
          if (w.blueprint[i] !== NONE) {
            this.cancelBlueprint(i);
          }
        });
        break;
      case 'zone': {
        // A stockpile drawn onto or beside one with settings carries them on.
        let zone = cmd.zone;
        if (zone === STOCKPILE_ZONE) {
          const { x0, y0, x1, y1 } = cmd.rect;
          for (let y = Math.min(y0, y1) - 1; y <= Math.max(y0, y1) + 1 && zone === STOCKPILE_ZONE; y++) {
            for (let x = Math.min(x0, x1) - 1; x <= Math.max(x0, x1) + 1; x++) {
              if (w.inBounds(x, y) && isStockpileZone(w.zone[w.idx(x, y)])) {
                zone = w.zone[w.idx(x, y)];
                break;
              }
            }
          }
        }
        this.forRect(cmd.rect, (i) => {
          const terrain = terrainDef(w.terrain[i]);
          // A growing zone needs fertile soil open to the sky.
          const ok = cmd.zone >= GROW_ZONE ? terrain.fertility > 0 && w.roof[i] === NONE : terrain.buildable;
          if (cmd.zone >= GROW_ZONE && ok && w.blueprint[i] !== NONE && featureDef(w.blueprint[i]).layer === 'roof') {
            this.cancelBlueprint(i);
          }
          if (cmd.zone === 0 || ok) {
            w.zone[i] = zone;
            this.zoneVersion++;
            w.markDirty(i);
          }
        });
        break;
      }
      case 'stockpile': {
        // The whole stockpile the tile belongs to (touching stockpile tiles) takes the settings.
        if (!isStockpileZone(w.zone[cmd.tile])) {
          break;
        }
        const value = stockpileZone(cmd.refused, cmd.priority);
        const seen = new Set([cmd.tile]);
        const queue = [cmd.tile];
        while (queue.length > 0) {
          const i = queue.pop()!;
          w.zone[i] = value;
          w.markDirty(i);
          for (const n of w.neighbors(i)) {
            const straight = w.xOf(n) === w.xOf(i) || w.yOf(n) === w.yOf(i);
            if (straight && !seen.has(n) && isStockpileZone(w.zone[n])) {
              seen.add(n);
              queue.push(n);
            }
          }
        }
        this.zoneVersion++;
        break;
      }
      case 'festivals':
        this.story.festivals = cmd.on;
        break;
      case 'fulfilRequest': {
        const why = fulfil(this);
        if (why) {
          this.addLog(why, 'warn');
        }
        break;
      }
      case 'declineRequest':
        decline(this);
        break;
      case 'gift': {
        const why = gift(this, cmd.faction, cmd.silver);
        if (why) {
          this.addLog(why, 'warn');
        }
        break;
      }
      case 'hireFighters': {
        const why = hireFighters(this, cmd.faction);
        if (why) {
          this.addLog(why, 'warn');
        }
        break;
      }
      case 'tribute': {
        const why = payTribute(this, cmd.faction);
        if (why) {
          this.addLog(why, 'warn');
        }
        break;
      }
      case 'world': {
        const why = worldAction(this, cmd.action);
        if (why) {
          this.addLog(why, 'warn');
        }
        break;
      }
      case 'policy':
        if (cmd.rations) {
          this.village.rations = cmd.rations;
        }
        if (cmd.hours) {
          this.village.hours = cmd.hours;
        }
        if (cmd.restDays !== undefined) {
          this.village.restDays = cmd.restDays;
          updateRest(this);
        }
        if (cmd.hunting) {
          this.village.hunting = cmd.hunting;
          if (cmd.hunting === 'surplus') {
            keepBreedingPairs(this);
          }
        }
        break;
      case 'sellArt': {
        const why = sellArt(this, cmd.tile);
        if (why) {
          this.addLog(why, 'warn');
        }
        break;
      }
      case 'shipChoice':
        if (this.beacon.landed && !this.departed) {
          if (cmd.board) {
            // (Goals stop being checked once the colony has gone: "Meet the ship" is ticked off on the way out.)
            if (depart(this)) {
              this.checkObjectives();
            }
          } else {
            chooseToStay(this);
          }
        }
        break;
      case 'signal':
        this.beacon.silent = false;
        break;
      case 'build':
        for (const i of cmd.tiles) {
          this.placeBlueprint(i, cmd.feature);
        }
        break;
      case 'priority':
        if (
          Number.isFinite(cmd.value) &&
          this.colonists[cmd.colonist] &&
          canWork(this.colonists[cmd.colonist], cmd.work)
        ) {
          this.colonists[cmd.colonist].priorities[cmd.work] = Math.max(0, Math.min(4, Math.round(cmd.value)));
        }
        break;
      case 'schedule':
        this.colonists[cmd.colonist].schedule[cmd.hour] = cmd.slot;
        break;
      case 'bill':
        this.bills[cmd.recipe].target = Math.max(0, cmd.target);
        break;
      case 'draft': {
        const c = this.colonists[cmd.colonist];
        if (
          !c ||
          c.health.dead ||
          c.away ||
          (cmd.drafted && (c.health.downed || this.inMentalBreak(c) || c.age < DRAFT_AGE))
        ) {
          break;
        }
        this.endJob(c);
        c.drafted = cmd.drafted;
        c.draftTarget = -1;
        this.nextTactics.delete(c.id);
        this.ordered.delete(c.id);
        break;
      }
      case 'research': {
        const project = cmd.project === null ? undefined : researchDef(cmd.project);
        if (cmd.project === null || (project && isAvailable(this.research, project))) {
          this.research.current = cmd.project;
        }
        break;
      }
      case 'capture': {
        const { x0, y0, x1, y1 } = cmd.rect;
        for (const p of this.captives) {
          const x = w.xOf(p.tile);
          const y = w.yOf(p.tile);
          if (
            p.state === 'downed' &&
            x >= Math.min(x0, x1) &&
            x <= Math.max(x0, x1) &&
            y >= Math.min(y0, y1) &&
            y <= Math.max(y0, y1)
          ) {
            p.capture = cmd.add;
          }
        }
        break;
      }
      case 'release':
        release(this, cmd.captive);
        break;
      case 'execute':
        execute(this, cmd.captive);
        break;
      case 'lock':
        if (w.setLocked(cmd.tile, cmd.locked) && cmd.locked) {
          // Whoever stands in the doorway steps aside, and anything lying there is moved off it.
          this.pushColonistsOff(cmd.tile, true);
          if (w.itemType[cmd.tile] !== NONE) {
            const moved = w.pickUp(cmd.tile, w.itemCount[cmd.tile]);
            w.dropItemNear(cmd.tile, moved.item, moved.count, moved.fresh, moved.quality);
          }
          this.addLog(`The door at (${w.xOf(cmd.tile)}, ${w.yOf(cmd.tile)}) is locked: nobody gets through.`);
        }
        break;
      case 'forbid':
        this.forRect(cmd.rect, (i) => {
          if (w.itemType[i] !== NONE && w.forbidden[i] !== (cmd.on ? 1 : 0)) {
            w.forbidden[i] = cmd.on ? 1 : 0;
            w.markDirty(i);
          }
        });
        // Anyone already on their way to a stack just forbidden turns back (they took it anyway).
        if (cmd.on) {
          for (const c of this.living()) {
            const from = c.job?.source ?? -1;
            if (from >= 0 && w.forbidden[from] === 1 && c.reserved.includes(`i${from}`)) {
              this.endJob(c);
            }
          }
        }
        break;
      case 'hunt':
      case 'tame': {
        const { x0, y0, x1, y1 } = cmd.rect;
        const inside = this.animals.filter((a) => {
          const x = w.xOf(a.tile);
          const y = w.yOf(a.tile);
          return x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1);
        });
        // A hunt dragged over wild and tame animals alike spares the livestock; marking only tame
        // ones is a deliberate slaughter order.
        const spareTame = cmd.type === 'hunt' && cmd.add && inside.some((a) => !a.tame);
        for (const a of inside) {
          // One mark or the other: an animal marked for taming and then hunting is hunted, and the other way round
          // (a hunting mark left on an animal once tamed was a slaughter order for the new livestock).
          if (cmd.type === 'hunt') {
            a.hunted = cmd.add && !(spareTame && a.tame);
            if (a.hunted) {
              a.taming = false;
            }
          } else {
            // Already-tame animals have nothing left to tame, and the great boar and the great beast
            // won't be tamed.
            a.taming = cmd.add && !a.tame && !a.quarry && a.kind !== 'greatBeast';
            if (a.taming) {
              a.hunted = false;
            }
          }
        }
        if (cmd.type === 'hunt' && cmd.add) {
          keepBreedingPairs(this);
        }
        break;
      }
      case 'retire': {
        const c = this.colonists[cmd.colonist];
        if (c && !c.health.dead) {
          setRetired(this, c, cmd.retired);
        }
        break;
      }
      case 'stance': {
        const c = this.colonists[cmd.colonist];
        if (c) {
          c.stance = cmd.stance;
          // A new stance takes effect at once, not after finishing the last one's walk.
          if (
            c.drafted &&
            !this.ordered.has(c.id) &&
            c.path.length > 0 &&
            c.path[c.path.length - 1] === c.draftTarget
          ) {
            c.path = [];
            c.moveProgress = 0;
          }
        }
        break;
      }
      case 'focus': {
        const who = cmd.colonist >= 0 ? [this.colonists[cmd.colonist]] : this.living().filter((c) => c.drafted);
        for (const c of who) {
          if (c) {
            c.focus = cmd.enemy;
          }
        }
        break;
      }
      case 'move': {
        const c = this.colonists[cmd.colonist];
        if (!c?.drafted || c.health.downed || c.health.dead || cmd.tile < 0 || cmd.tile >= w.size) {
          break;
        }
        const goals = w.isPassable(cmd.tile) ? [cmd.tile] : w.neighbors(cmd.tile).filter((n) => w.isPassable(n));
        const path = this.pathfinder.find(c.tile, goals);
        if (path) {
          c.path = path;
          c.moveProgress = 0;
          c.draftTarget = path.at(-1) ?? c.tile;
          this.ordered.add(c.id);
        }
        break;
      }
    }
  }

  // ---- Queries used by the UI and renderer ----

  public isIndoors(i: number): boolean {
    this.ensureRegions();
    const room = this.rooms.room[i];
    return room >= 0 && this.rooms.enclosed[room];
  }

  public temperatureAt(i: number): number {
    this.ensureRegions();
    const room = this.doorway(i) ?? this.rooms.room[i];
    const base = room >= 0 && this.rooms.enclosed[room] ? this.roomTemps[room] : this.outdoorTemperature();
    // A fire's own warmth, as a heater's, tops out: beside a summer hearth it was 40°C and more.
    const fire = this.fireWarmth().get(i) ?? 0;
    return base + Math.min(fire, Math.max(0, HEATER_TARGET + FIRESIDE_EXTRA - base));
  }

  // A fire burning in the open warms the ground right around it (its full heat beside it, half two
  // tiles off), so colonists caught without shelter can huddle by it. Rebuilt when fires, fuel or walls
  // change.
  private fireWarmthCache = { structure: -1, features: -1, fuel: -1, warmth: new Map<number, number>() };
  private fireWarmth(): Map<number, number> {
    const w = this.world;
    const cache = this.fireWarmthCache;
    // (Looked up with every temperature: compared as numbers, nothing built.)
    if (
      cache.structure === w.structureVersion &&
      cache.features === w.featureVersion &&
      cache.fuel === this.fuelVersion
    ) {
      return cache.warmth;
    }
    this.refreshGrid();
    const warmth = new Map<number, number>();
    for (const f of this.fireTiles) {
      const def = featureDef(w.feature[f]);
      if (w.fuel[f] <= 0 || def.workbench || !(def.heater > 0)) {
        continue;
      }
      // Indoors the fire already warms the room; right beside it is warmer still, by half its heat, so
      // there's somewhere to huddle when the room can't keep up. Out in the open it's all there is: its full
      // heat beside it, half two tiles off.
      const indoors = this.isIndoors(f);
      const room = this.rooms.room[f];
      const reach = indoors ? 1 : 2;
      const x0 = w.xOf(f);
      const y0 = w.yOf(f);
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const x = x0 + dx;
          const y = y0 + dy;
          if (x < 0 || y < 0 || x >= w.width || y >= w.height) {
            continue;
          }
          const i = w.idx(x, y);
          // (Not through a wall: only its own room, or only outside.)
          if (indoors ? this.rooms.room[i] !== room : this.isIndoors(i)) {
            continue;
          }
          const heat = indoors
            ? def.heater / 2
            : Math.max(Math.abs(dx), Math.abs(dy)) <= 1
              ? def.heater
              : def.heater / 2;
          warmth.set(i, Math.max(warmth.get(i) ?? 0, heat));
        }
      }
    }
    this.fireWarmthCache = {
      structure: w.structureVersion,
      features: w.featureVersion,
      fuel: this.fuelVersion,
      warmth,
    };
    return warmth;
  }

  // A door belongs to the room it opens into: standing in the doorway is as warm (and as dry) as
  // just inside. Undefined for anything but a door into an enclosed room.
  private doorway(i: number): number | undefined {
    const f = this.world.feature[i];
    if (f === NONE || !featureDef(f).door) {
      return undefined;
    }
    for (const n of this.world.neighbors(i, false)) {
      const room = this.rooms.room[n];
      if (room >= 0 && this.rooms.enclosed[room]) {
        return room;
      }
    }
    return undefined;
  }

  public roomAt(i: number): RoomInfo | null {
    this.ensureRegions();
    const room = this.rooms.room[i];
    if (room < 0) {
      return null;
    }
    return describeRoom(room, this.rooms, this.contents()[room], this.temperatureAt(i));
  }

  public allRooms(): RoomInfo[] {
    this.ensureRegions();
    const contents = this.contents();
    return this.rooms.sizes.map((_, r) =>
      describeRoom(r, this.rooms, contents[r], this.rooms.enclosed[r] ? this.roomTemps[r] : this.outdoorTemperature()),
    );
  }

  public hasShelter(): boolean {
    this.ensureRegions();
    // The regions that hold an enclosed room of four tiles or more, worked out again only when walls change.
    if (this.shelterRegions.version !== this.world.structureVersion) {
      const regions = new Set<number>();
      const counted = new Set<number>();
      for (let i = 0; i < this.world.size; i++) {
        const room = this.rooms.room[i];
        if (room < 0 || counted.has(room) || !this.rooms.enclosed[room] || this.rooms.sizes[room] < 4) {
          continue;
        }
        counted.add(room);
        regions.add(this.regions.region[i]);
      }
      this.shelterRegions = { version: this.world.structureVersion, regions };
    }
    const { regions } = this.shelterRegions;
    return regions.size > 0 && this.living().some((c) => regions.has(this.regions.region[c.tile]));
  }

  private shelterRegions = { version: -1, regions: new Set<number>() };

  // How many features of any kind (trees and rock included) pass the test.
  public countFeature(test: (featureId: number) => boolean): number {
    let n = 0;
    for (const i of this.world.tilesWith('features')) {
      if (test(this.world.feature[i])) {
        n++;
      }
    }
    return n;
  }

  // How many built features (crops included; not trees or rock) pass the test: the same answer as
  // countFeature for anything a colonist builds, without wading through a big map's forests.
  public countBuilt(test: (featureId: number) => boolean): number {
    let n = 0;
    for (const i of this.buildingTiles()) {
      if (test(this.world.feature[i])) {
        n++;
      }
    }
    return n;
  }

  // Counted once a tick while the colony steps (stock checks come many times a tick: is there wood for the
  // fires, is a bill's target met); between ticks, for the interface, always counted afresh.
  private totalsCache: { tick: number; totals: { item: number; stored: number; total: number }[] } | null = null;
  private stepping = false;

  public resourceTotals(): { item: number; stored: number; total: number }[] {
    if (this.stepping && this.totalsCache?.tick === this.tick) {
      return this.totalsCache.totals;
    }
    const totals = this.countTotals();
    if (this.stepping) {
      this.totalsCache = { tick: this.tick, totals };
    }
    return totals;
  }

  private countTotals(): { item: number; stored: number; total: number }[] {
    const w = this.world;
    const totals = ITEMS.map((item) => ({ item: item.id, stored: 0, total: 0 }));
    for (const i of w.tilesWith('items')) {
      const type = w.itemType[i];
      if (type !== NONE) {
        const entry = totals[type - 1];
        entry.total += w.itemCount[i];
        if (this.isStockpile(i)) {
          entry.stored += w.itemCount[i];
        }
      }
    }
    for (const c of this.colonists) {
      for (const bundle of this.bundles(c)) {
        for (const part of bundle.mix ?? [bundle]) {
          totals[part.item - 1].total += part.count;
        }
      }
    }
    return totals;
  }

  public thoughtsOf(c: Colonist): { label: string; mood: number }[] {
    const traits = c.traits
      .filter((key) => TRAITS[key].mood)
      .map((key) => ({ label: TRAITS[key].label, mood: TRAITS[key].mood! }));
    const thoughts = [...this.situationalThoughts(c), ...c.thoughts.map((t) => t.key)].map((key) => ({
      label: THOUGHTS[key].label,
      mood: THOUGHTS[key].mood,
    }));
    return [...traits, ...thoughts, ...griefThoughts(this, c)];
  }

  public inMentalBreak(c: Colonist): boolean {
    return c.breakUntil > this.tick;
  }

  public describe(c: Colonist): string {
    if (c.health.dead) {
      return 'Dead';
    }
    if (c.health.downed) {
      return c.path.length > 0
        ? c.needs.food < CRAWL_HUNGRY && this.isFoodTile(c.path[c.path.length - 1])
          ? 'Crawling to some food'
          : 'Crawling to shelter'
        : 'Downed, waiting for a doctor';
    }
    if (c.drafted) {
      if (this.fighting.has(c.id)) {
        return 'Drafted: fighting';
      }
      return c.path.length > 0 ? 'Drafted: moving' : 'Drafted';
    }
    if (this.fighting.has(c.id)) {
      return 'Fighting back';
    }
    if (this.inMentalBreak(c)) {
      return BREAK_LABELS[c.breakKind ?? 'daze'];
    }
    const job = c.job;
    if (!job) {
      return 'Idle';
    }
    const w = this.world;
    const featureName = (i: number) => (w.feature[i] !== NONE ? featureDef(w.feature[i]).name.toLowerCase() : '');
    const blueprintName = (i: number) => (w.blueprint[i] !== NONE ? featureDef(w.blueprint[i]).name.toLowerCase() : '');
    switch (job.type) {
      case 'mine':
        return `Mining ${featureName(job.target)}`;
      case 'chop':
        return 'Chopping a tree';
      case 'forage':
        return 'Foraging berries';
      case 'construct':
        return `Building ${blueprintName(job.target)}`;
      case 'sculpt':
        return `Carving ${blueprintName(job.target)}`;
      case 'deconstruct':
        return `Deconstructing ${featureName(job.target)}`;
      case 'sow': {
        const crop = growZoneCrop(w.zone[job.target]);
        return crop !== NONE ? `Sowing ${featureDef(crop).name.toLowerCase()}` : 'Sowing';
      }
      case 'harvestCrop':
        return `Harvesting ${featureName(job.target)}`;
      case 'clean':
        return 'Cleaning';
      case 'capture': {
        const name = this.captives.find((p) => p.id === job.patient)?.name ?? 'a raider';
        return job.stage === 1 ? `Carrying ${name} to a cell` : `Going to capture ${name}`;
      }
      case 'warden': {
        const name = this.captives.find((p) => p.id === job.patient)?.name ?? 'a prisoner';
        return job.stage === 0 ? `Fetching food for ${name}` : `Visiting the prisoner ${name}`;
      }
      case 'haul':
        return `Hauling ${itemDef(job.item).name.toLowerCase()}`;
      case 'deliver':
        return `Delivering ${itemDef(job.item).name.toLowerCase()} to ${blueprintName(job.target)}`;
      case 'craft':
        return RECIPES[job.line].name;
      case 'eat':
        return job.stage === 2 ? 'Eating' : 'Getting something to eat';
      case 'joy':
        if (job.listening) {
          return 'Listening to a concert';
        }
        if (job.telling) {
          return 'Telling stories by the fire';
        }
        if (job.hearing) {
          return 'Listening to the old stories';
        }
        if (job.gathering && this.gathering) {
          return `At ${GATHERINGS[this.gathering.kind].name}`;
        }
        return job.target >= 0 && w.feature[job.target] !== NONE
          ? (featureDef(w.feature[job.target]).joy?.activity ?? 'Relaxing')
          : 'Going for a walk';
      case 'sleep':
        if (!c.sleeping) {
          return 'Going to bed';
        }
        return this.isIndoors(c.tile) ? 'Sleeping' : 'Sleeping outside';
      case 'wander':
        return 'Wandering';
      case 'lesson':
        return job.line === 1 ? 'Teaching the children' : 'At lessons';
      case 'soothe':
        return job.stage === 0
          ? 'Fetching medicine'
          : `Easing ${this.colonists[job.patient]?.name ?? 'an elder'}'s aches`;
      case 'tend': {
        const patient = this.colonists[job.patient];
        if (job.stage === 0) {
          return 'Fetching medicine';
        }
        return patient === c ? 'Tending own wounds' : `Tending ${patient?.name ?? 'a patient'}`;
      }
      case 'rest':
        return 'Resting in bed';
      case 'hunt': {
        const prey = this.animals.find((a) => a.id === job.patient);
        return prey ? `Hunting a ${animalName(prey).toLowerCase()}` : 'Hunting';
      }
      case 'equip':
        return itemDef(job.item).weapon
          ? `Picking up a ${itemDef(job.item).name.toLowerCase()}`
          : itemDef(job.item).armor
            ? `Putting on ${itemDef(job.item).name.toLowerCase()}`
            : `Changing into a ${itemDef(job.item).name.toLowerCase()}`;
      case 'shelter':
        return 'Taking shelter from the raiders';
      case 'warmUp':
        return c.health.hypothermia >= c.health.heatstroke ? 'Warming up' : 'Cooling off';
      case 'rescue': {
        const patient = this.colonists[job.patient];
        return job.stage === 1 ? `Carrying ${patient?.name} to safety` : `Rescuing ${patient?.name}`;
      }
      case 'refuel':
        return w.feature[job.target] !== NONE && featureDef(w.feature[job.target]).feeds
          ? 'Filling the trough'
          : 'Refuelling the generator';
      case 'fish':
        return 'Fishing';
      case 'extinguish':
        return 'Putting out a fire';
      case 'tame': {
        const animal = this.animals.find((a) => a.id === job.patient);
        return animal ? `Taming a ${animalName(animal).toLowerCase()}` : 'Taming';
      }
      case 'feed':
        return `Feeding ${this.colonists[job.patient]?.name ?? 'a patient'}`;
      case 'research': {
        const project = this.research.current ? researchDef(this.research.current) : undefined;
        return project ? `Researching ${project.name.toLowerCase()}` : 'Researching';
      }
    }
  }

  // Progress of the work a colonist is actively doing, for progress bars.
  public jobProgress(c: Colonist): { tile: number; ratio: number } | null {
    const job = c.job;
    if (!job || c.path.length > 0) {
      return null;
    }
    if (job.type === 'research' && this.research.current && this.isAtWorkSpot(c, job.target, false)) {
      const project = researchDef(this.research.current);
      if (project) {
        return {
          tile: job.target,
          ratio: Math.min(1, (this.research.progress[project.key] ?? 0) / researchCost(this.research, project)),
        };
      }
    }
    if ((job.type === 'tend' || job.type === 'soothe') && job.stage === 2) {
      return { tile: this.colonists[job.patient].tile, ratio: Math.min(1, job.progress / TEND_TICKS) };
    }
    if (job.type === 'craft' && job.stage === 1 && this.isAtWorkSpot(c, job.target, false)) {
      return { tile: job.target, ratio: Math.min(1, job.progress / RECIPES[job.line].work) };
    }
    if (job.type === 'warden' && job.stage === 2) {
      return { tile: c.tile, ratio: Math.min(1, job.progress / TALK_TICKS) };
    }
    if (job.type === 'clean' && c.tile === job.target) {
      return { tile: job.target, ratio: Math.min(1, job.progress / CLEAN_WORK) };
    }
    if (
      !WORK_JOBS.has(job.type) ||
      !this.workTargetValid(job) ||
      !this.isAtWorkSpot(c, job.target, standsOn(job.type))
    ) {
      return null;
    }
    return { tile: job.target, ratio: Math.min(1, this.world.progress[job.target] / this.workAmount(job)) };
  }

  // How many of an item the colony holds anywhere, including in hands.
  public stockOf(item: number): number {
    return this.resourceTotals()[item - 1].total;
  }

  // `story` marks moments worth keeping in the colony's history.
  public addLog(text: string, tone: LogEntry['tone'] = 'info', story = false): void {
    this.log.push({ tick: this.tick, text, tone });
    if (this.log.length > LOG_LIMIT) {
      this.log.shift();
    }
    if (story) {
      this.storyCount++;
      this.storyLog.push({ day: this.day, hour: Math.floor(this.hour), text, tone });
      if (this.storyLog.length > STORY_LIMIT) {
        this.storyLog.shift();
      }
    }
    // History worth keeping goes into the chronicle too (whether or not it made a card).
    const kind = chronicleKind(text);
    if (kind) {
      addToChronicle(this.chronicle, { day: this.day, kind, text: chronicleText(kind, text) });
    }
  }

  // ---- Internals: regions, rooms, climate ----

  private ensureRegions(): void {
    if (this.cachedVersion === this.world.structureVersion) {
      return;
    }
    this.cachedVersion = this.world.structureVersion;
    const oldRooms = this.rooms;
    const oldTemps = this.roomTemps;
    this.regions = computePassRegions(this.world);
    this.rooms = computeRooms(this.world);
    this.contentsVersion = '';
    // New rooms start at the average temperature of the tiles they cover.
    const outdoor = this.outdoorTemperature();
    const sums = this.rooms.sizes.map(() => 0);
    for (let i = 0; i < this.world.size; i++) {
      const room = this.rooms.room[i];
      if (room < 0) {
        continue;
      }
      const old = oldRooms?.room[i] ?? -1;
      sums[room] += old >= 0 && oldRooms.enclosed[old] && oldTemps[old] !== undefined ? oldTemps[old] : outdoor;
    }
    this.roomTemps = sums.map((sum, r) => sum / this.rooms.sizes[r]);
  }

  private contents(): ReturnType<typeof measureRooms> {
    this.ensureRegions();
    // Flowers fade in winter, so the season is part of what the room's beauty depends on, and so is
    // the mess on the floor. (Worked out from what's there now, so a loaded game sees the same.)
    const key = `${this.world.featureVersion}:${this.season === 'Winter'}:${this.world.filthVersion}:${this.fuelVersion}`;
    if (this.contentsVersion !== key) {
      this.contentsVersion = key;
      this.roomContents = measureRooms(this.world, this.rooms, (i) => this.beautyAt(i));
    }
    return this.roomContents;
  }

  // Restores room temperatures from per-tile values (used when loading a save).
  public setTileTemperatures(temps: ArrayLike<number>): void {
    this.ensureRegions();
    const sums = this.rooms.sizes.map(() => 0);
    for (let i = 0; i < this.world.size; i++) {
      const room = this.rooms.room[i];
      if (room >= 0) {
        sums[room] += temps[i];
      }
    }
    this.roomTemps = sums.map((sum, r) => sum / this.rooms.sizes[r]);
  }

  // Room temperatures exactly as they stand (rooms are rebuilt identically from the map on load).
  public roomTemperatures(): number[] {
    this.ensureRegions();
    return [...this.roomTemps];
  }

  public setRoomTemperatures(temps: number[]): void {
    this.ensureRegions();
    if (temps.length === this.roomTemps.length) {
      this.roomTemps = [...temps];
    }
  }

  public tileTemperatures(): Float64Array {
    const temps = new Float64Array(this.world.size);
    for (let i = 0; i < this.world.size; i++) {
      temps[i] = this.temperatureAt(i);
    }
    return temps;
  }

  private updateClimate(): void {
    const leak = (this.isResearched('insulation') ? 0.5 : 1) * (this.isResearched('doubleGlazing') ? 0.5 : 1);
    updateRoomTemperatures(
      this.roomTemps,
      this.rooms,
      this.contents(),
      this.outdoorTemperature(),
      leak,
      this.power.powered,
    );
  }

  // Hard frost freezes the shallows a little more each hour, starting at the shore; warmth thaws
  // them again. Deep water stays open.
  private updateIce(): void {
    const w = this.world;
    const t = this.outdoorTemperature();
    if (t > FREEZE && t < THAW) {
      return;
    }
    const freezing = t <= FREEZE;
    const hour = Math.floor(this.totalHours);
    let before = 0;
    const changes: number[] = [];
    if (this.waterTiles.version !== w.waterVersion) {
      const tiles: number[] = [];
      for (let i = 0; i < w.size; i++) {
        if (isFreezable(w.terrain[i])) {
          tiles.push(i);
        }
      }
      this.waterTiles = { version: w.waterVersion, tiles };
    }
    for (const i of this.waterTiles.tiles) {
      const terrain = w.terrain[i];
      if (terrain === ICE) {
        before++;
      }
      if (terrain !== (freezing ? SHALLOW_WATER : ICE) || hash2(i, hour, this.seed) > 0.3) {
        continue;
      }
      // Freezing spreads from land or existing ice; thawing starts anywhere.
      if (!freezing || w.neighbors(i).some((n) => !w.isOpenWater(n))) {
        changes.push(i);
      }
    }
    for (const i of changes) {
      w.setTerrain(i, freezing ? ICE : SHALLOW_WATER);
    }
    // Ice comes and goes with the weather all winter; only the first freeze and the spring thaw
    // are worth a mention.
    const year = yearOf(this.totalHours);
    if (freezing && before === 0 && changes.length > 0 && this.iceNoticeYear !== year) {
      this.iceNoticeYear = year;
      this.addLog('The shallows are freezing over. Colonists can walk across the ice.', 'info', true);
    } else if (!freezing && before > 0 && before === changes.length && this.season !== 'Winter') {
      this.addLog('The ice has melted.', 'info');
    }
  }

  // The shallows and ice, kept until a tile turns to or from water: what updateIce looks over.
  private waterTiles = { version: -1, tiles: [] as number[] };

  private growCrops(): void {
    const w = this.world;
    const hour = this.hour;
    const winter = this.season === 'Winter';
    const growing = !winter && hour >= NIGHT_END && hour < 20;
    const glassDay = this.isResearched('glassmaking') && hour >= NIGHT_END && hour < 20;
    const speed = this.isResearched('cropRotation') ? 1.25 : 1;
    const lit = this.litTiles();
    let frosted = 0;
    for (const i of this.buildingTiles()) {
      const f = w.feature[i];
      const crop = f !== NONE ? featureDef(f).crop : undefined;
      if (!crop) {
        continue;
      }
      const temp = this.temperatureAt(i);
      // Hard frost kills crops left in the field.
      // Hashed rather than drawn from the rng, so which crops die doesn't depend on list order.
      if (temp < FROST && !crop.hardy && hash2(i, this.tick, this.seed) < 0.05) {
        w.setFeature(i, NONE);
        frosted++;
        continue;
      }
      // Sun lamps let crops grow at night and through winter; under a roof they're the only light. Glass
      // (glassmaking) lights a field walled in as a room by day, winter or not: a warm greenhouse.
      const sunlit = (growing && w.roof[i] === NONE) || (glassDay && w.roof[i] === NONE && this.isIndoors(i));
      if ((!sunlit && !lit[i]) || w.growth[i] >= 1 || temp < CROP_MIN_TEMP) {
        continue;
      }
      const before = Math.floor(w.growth[i] * 3);
      const fertility = terrainDef(w.terrain[i]).fertility;
      // Rain helps and drought stunts crops in the open; walls keep the weather off.
      const weatherFactor = this.isRoofed(i) ? 1 : weatherDef(this).crops;
      w.growth[i] = Math.min(
        1,
        w.growth[i] + (SLOW_TICKS * fertility * speed * weatherFactor) / (crop.growDays * 14 * TICKS_PER_HOUR),
      );
      if (Math.floor(w.growth[i] * 3) !== before) {
        w.markDirty(i);
      }
    }
    if (frosted > 0) {
      this.frostLosses += frosted;
    }
  }

  // Fires burn through their wood; one that runs out goes cold and dark until it's refuelled.
  private burnFuel(hours: number): void {
    const w = this.world;
    for (const i of this.fireTiles) {
      const def = featureDef(w.feature[i]);
      const burns = def.burns!;
      // Kilns and smelters burn only while they're worked (see stepCraft).
      if (w.fuel[i] <= 0 || def.workbench) {
        continue;
      }
      w.fuel[i] = Math.max(0, w.fuel[i] - (burns.perDay / 24) * hours);
      if (w.fuel[i] <= 0) {
        this.fuelVersion++;
      }
    }
  }

  private refreshGrid(): void {
    const w = this.world;
    if (this.gridVersion === w.featureVersion) {
      return;
    }
    this.gridVersion = w.featureVersion;
    this.powerTiles = [];
    this.lampTiles = [];
    this.fishingSpots = [];
    this.fireTiles = [];
    for (let i = 0; i < w.size; i++) {
      const f = w.feature[i];
      if (f !== NONE && featureDef(f).burns) {
        this.fireTiles.push(i);
      }
      if (f !== NONE && featureDef(f).fishing) {
        this.fishingSpots.push(i);
      }
      if (f !== NONE && featureDef(f).power) {
        this.powerTiles.push(i);
        if (featureDef(f).growLight > 0) {
          this.lampTiles.push(i);
        }
      }
    }
  }

  // Tiles lit by a running sun lamp.
  public litTiles(): Uint8Array {
    this.refreshGrid();
    const key = `${this.gridVersion}:${this.power.powered}`;
    if (key === this.litKey) {
      return this.lit;
    }
    this.litKey = key;
    const w = this.world;
    this.lit = new Uint8Array(w.size);
    if (this.power.powered) {
      for (const lamp of this.lampTiles) {
        const r = featureDef(w.feature[lamp]).growLight;
        for (let y = w.yOf(lamp) - r; y <= w.yOf(lamp) + r; y++) {
          for (let x = w.xOf(lamp) - r; x <= w.xOf(lamp) + r; x++) {
            if (w.inBounds(x, y)) {
              this.lit[w.idx(x, y)] = 1;
            }
          }
        }
      }
    }
    return this.lit;
  }

  public isIcebox(i: number): boolean {
    const f = this.world.feature[i];
    return f !== NONE && featureDef(f).icebox;
  }

  // What a colonist's schedule says for this hour; on a day of rest, work time is free time.
  public slotOf(c: Colonist): ScheduleSlot {
    const slot = c.schedule[Math.floor(this.hour)];
    return restDay(this) && slot !== 'S' ? 'J' : slot;
  }

  public isHospitalBed(i: number): boolean {
    const f = this.world.feature[i];
    return f !== NONE && featureDef(f).hospital;
  }

  public isDryingRack(i: number): boolean {
    const f = this.world.feature[i];
    return f !== NONE && featureDef(f).dries;
  }

  public isShelf(i: number): boolean {
    const f = this.world.feature[i];
    return f !== NONE && featureDef(f).shelf > 0;
  }

  // Storage where food doesn't spoil: a running icebox, or a stockpile in a freezing room.
  public isColdStore(i: number): boolean {
    return this.isIcebox(i)
      ? this.power.powered || this.temperatureAt(i) <= 0
      : this.isStockpile(i) && this.isIndoors(i) && this.temperatureAt(i) <= 0;
  }

  // Perishable food loses freshness: fast when warm, slowly when cool, not at all when frozen
  // or in a running icebox. Stacks that run out rot away.
  private updateSpoilage(hours: number): void {
    const w = this.world;
    const preserving = this.isResearched('preserving');
    this.coldStores = this.storageTiles().filter((i) => this.isColdStore(i)).length;
    // Copied, because rotting food is removed from the list as it goes.
    for (const i of [...w.tilesWith('items')]) {
      const item = w.itemType[i];
      if (item === NONE || itemDef(item).shelfLife === undefined) {
        continue;
      }
      if (this.power.powered && this.isIcebox(i)) {
        continue;
      }
      // On a drying rack, food dries instead of rotting (slower in the rain), and keeps for months.
      const dried = this.isDryingRack(i) ? driedFrom(item) : undefined;
      if (dried !== undefined) {
        w.drying[i] += hours * (isWet(this, i) ? 0.5 : 1);
        if (w.drying[i] >= DRYING_HOURS) {
          w.drying[i] = 0;
          w.itemType[i] = dried;
          w.fresh[i] = itemDef(dried).shelfLife!;
          w.markDirty(i);
          this.produce(dried, w.itemCount[i]);
        }
        continue;
      }
      const temp = this.temperatureAt(i);
      const rate = (temp <= 0 ? 0 : temp <= 10 ? 0.5 : 1) * (preserving ? PRESERVING_RATE : 1);
      w.fresh[i] -= (rate * hours) / 24;
      if (w.fresh[i] <= 0) {
        this.rotted += w.itemCount[i];
        w.takeItem(i, w.itemCount[i]);
      }
    }
  }

  public get season(): Season {
    return seasonOf(this.totalHours);
  }

  public isResearched(key: string | undefined): boolean {
    return isResearched(this.research, key);
  }

  private forRect(rect: Rect, fn: (i: number) => void): void {
    const w = this.world;
    const x0 = Math.max(0, Math.min(rect.x0, rect.x1));
    const x1 = Math.min(w.width - 1, Math.max(rect.x0, rect.x1));
    const y0 = Math.max(0, Math.min(rect.y0, rect.y1));
    const y1 = Math.min(w.height - 1, Math.max(rect.y0, rect.y1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        fn(w.idx(x, y));
      }
    }
  }

  // Whether a blueprint for `feature` may go on tile `i`. Natural obstacles are allowed (they get
  // cleared first), and so is a different blueprint (it gets replaced, e.g. a door in a planned wall).
  public canPlaceBlueprint(i: number, feature: number): boolean {
    const w = this.world;
    if (!FEATURES[feature - 1]?.build || i < 0 || i >= w.size) {
      return false;
    }
    const def = featureDef(feature);
    // Bridges go over water, frozen or not; everything else needs solid ground.
    if (def.bridge ? !this.isWaterTile(w.terrain[i]) : !terrainDef(w.terrain[i]).buildable) {
      return false;
    }
    if (def.fishing && !w.neighbors(i).some((n) => this.isWaterTile(w.terrain[n]))) {
      return false;
    }
    if (!this.isResearched(featureDef(feature).research)) {
      return false;
    }
    const existing = w.feature[i];
    if (def.layer) {
      // Floors and roofs go under or over buildings (trees and rocks get cleared first), but
      // never push aside another building's blueprint, and not where they're already laid.
      const pending = w.blueprint[i];
      // Crops need the sun: no roof over a crop or a growing zone.
      if (def.layer === 'roof' && (w.zone[i] >= GROW_ZONE || (existing !== NONE && featureDef(existing).crop))) {
        return false;
      }
      return (
        w[def.layer][i] !== feature &&
        (pending === NONE || featureDef(pending).layer === def.layer) &&
        pending !== feature &&
        !(existing !== NONE && (featureDef(existing).bridge || (def.layer === 'floor' && featureDef(existing).crop)))
      );
    }
    // Building over a tree or a boulder clears it first; a mine shaft has to be taken down. A door can go into a
    // wall that's already built: the wall comes down and the door goes up in its place (a hut finished without one
    // used to stay shut, with whoever was inside, and the Door tool did nothing on its walls).
    return (
      w.blueprint[i] !== feature &&
      (existing === NONE ||
        (!!featureDef(existing).harvest && !featureDef(existing).shaft) ||
        (!!def.door && doorable(featureDef(existing))))
    );
  }

  private isWaterTile(terrain: number): boolean {
    return terrain === ICE || terrainDef(terrain).key.endsWith('Water');
  }

  // A building lost to fire or raiders goes straight back on the build list (true if it did).
  // Not if it was marked for taking down anyway (the mark goes with it), and not while raiders are
  // still about: builders would walk into the breach.
  public rebuild(i: number, feature: number): boolean {
    // A work of art is gone for good: nobody can carve the same piece again.
    if (featureDef(feature).art) {
      return false;
    }
    const w = this.world;
    if (w.designation[i] !== Designation.NONE) {
      const unwanted = w.designation[i] === Designation.DECONSTRUCT;
      w.designation[i] = Designation.NONE;
      w.markDirty(i);
      if (unwanted) {
        return false;
      }
    }
    if (this.raid) {
      this.pendingRebuilds.push([i, feature]);
      return true;
    }
    if (w.feature[i] === NONE && (w.blueprint[i] === NONE || !w.blueprintBlocks(i))) {
      this.placeBlueprint(i, feature);
      return true;
    }
    return false;
  }

  // Once a raid's over, the breaches go back on the build list.
  public rebuildAfterRaid(): void {
    const pending = this.pendingRebuilds;
    this.pendingRebuilds = [];
    for (const [i, feature] of pending) {
      this.rebuild(i, feature);
    }
  }

  private placeBlueprint(i: number, feature: number): void {
    const w = this.world;
    if (!this.canPlaceBlueprint(i, feature)) {
      return;
    }
    if (w.blueprint[i] !== NONE) {
      this.cancelBlueprint(i);
    }
    // A tree or rock in the way gets cleared first (a mine shaft is a building: floors and roofs go round it).
    const existing = w.feature[i] !== NONE ? featureDef(w.feature[i]) : undefined;
    const harvest = existing && !existing.shaft ? existing.harvest : undefined;
    if (harvest) {
      w.designation[i] = { mine: Designation.MINE, chop: Designation.CHOP, forage: Designation.FORAGE }[harvest.work];
    } else if (existing && featureDef(feature).door && doorable(existing)) {
      // A door into a standing wall: the wall is taken down first.
      w.designation[i] = Designation.DECONSTRUCT;
      w.progress[i] = 0;
    } else {
      w.progress[i] = 0;
    }
    w.blueprint[i] = feature;
    w.clearDelivered(i);
    w.markDirty(i);
  }

  private cancelBlueprint(i: number): void {
    const w = this.world;
    const cost = featureDef(w.blueprint[i]).build!.cost;
    const refunds = cost.map((c, line) => ({ item: c.item, count: w.deliveredAt(i, line) }));
    const layer = !!featureDef(w.blueprint[i]).layer;
    w.blueprint[i] = NONE;
    w.clearDelivered(i);
    if (w.feature[i] === NONE || layer) {
      w.progress[i] = 0;
    }
    w.markDirty(i);
    for (const refund of refunds) {
      if (refund.count > 0) {
        w.dropItemNear(i, refund.item, refund.count);
      }
    }
  }

  private onDawn(): void {
    let exposed = 0;
    this.noRescueUntil.clear();
    for (const c of this.living()) {
      rustSkills(c, this.tick);
      fadeRecentJoy(c);
    }
    fadeOpinions(this);
    checkMarriages(this);
    updateGrief(this);
    for (const c of this.colonists) {
      // Only colonists who were around for a good part of the night count (not late arrivals).
      if (c.nightTicks > TICKS_PER_HOUR * 2 && c.exposedTicks > c.nightTicks * 0.5) {
        exposed++;
      }
      c.nightTicks = 0;
      c.exposedTicks = 0;
    }
    if (this.firstNight === 'pending') {
      this.firstNight = exposed === 0 ? 'success' : 'failed';
      if (exposed > 0) {
        this.addLog(
          'The colony made it through the first night, but not everyone had shelter: that goal is missed. Nothing else is lost; get a roof over everyone before tonight.',
          'warn',
          true,
        );
      }
    }
    this.addLog(`Day ${this.day} begins.`);
    this.recordDay();
    if (this.rotted > 0) {
      this.addLog(`${this.rotted} food rotted. Iceboxes or a cold storeroom keep it fresh.`, 'warn');
      this.rotted = 0;
    }
    if (this.frostLosses > 0) {
      this.addLog(`Frost killed ${this.frostLosses} crops in the fields.`, 'warn', true);
      this.frostLosses = 0;
    }
    const season = this.season;
    if (this.lastSeason !== null && season !== this.lastSeason) {
      if (season === 'Spring' && this.living().length > 0) {
        this.addLog('Spring has come. The colony made it through the winter.', 'good', true);
        for (const c of this.living()) {
          this.addThought(c, 'winterSurvived');
        }
        this.stats.wintersSurvived++;
      } else if (season === 'Spring') {
        this.addLog('Spring has come.', 'info', true);
      } else if (season === 'Winter') {
        this.addLog('Winter has arrived. Crops will not grow until spring, except under sun lamps.', 'warn', true);
      } else {
        this.addLog(
          season === 'Autumn'
            ? `Autumn has arrived. Frosts are coming and winter starts in ${Math.ceil(daysUntilWinter(this.totalHours))} days: harvest what you can.`
            : `${season} has arrived.`,
          season === 'Autumn' ? 'warn' : 'info',
          true,
        );
      }
    }
    this.lastSeason = season;
    animalsAtDawn(this);
    spreadWildPlants(this);
    this.planDay();
  }

  // `currentOnly`: just the goals of the phase now open.
  private checkObjectives(currentOnly = false): void {
    const active = OBJECTIVES.filter((o) => !o.hidden?.(this));
    const open = PHASE_NAMES.findIndex((_, index) => !this.objectivesDone[`phase:${index + 1}`]) + 1;
    for (const objective of active) {
      if (currentOnly && objective.phase !== open) {
        continue;
      }
      if (!this.objectivesDone[objective.id] && objective.check(this)) {
        this.objectivesDone[objective.id] = true;
        this.addLog(`Goal complete: ${objective.label}`, 'good', true);
        this.events.push('goal');
      }
    }
    // A phase is over once every goal in it is done (or, like the first night, can't be any more).
    PHASE_NAMES.forEach((name, index) => {
      const key = `phase:${index + 1}`;
      const goals = active.filter((o) => o.phase === index + 1);
      // Phases close in order, so "Next" always points at an open phase.
      const previousDone = index === 0 || this.objectivesDone[`phase:${index}`];
      if (
        !this.objectivesDone[key] &&
        previousDone &&
        goals.every((o) => this.objectivesDone[o.id] || this.objectiveFailed(o.id))
      ) {
        this.objectivesDone[key] = true;
        const last = index === PHASE_NAMES.length - 1;
        this.addLog(
          last
            ? 'Every goal is complete. The colony is thriving: play on for as long as you like.'
            : `${name} goals complete. Next: ${PHASE_NAMES[index + 1]} goals.`,
          'good',
          true,
        );
      }
    });
  }

  public objectiveFailed(id: string): boolean {
    return id === 'night' && this.firstNight === 'failed';
  }

  // ---- Needs and mood ----

  public addThought(c: Colonist, key: string): void {
    const def = THOUGHTS[key];
    c.thoughts = c.thoughts.filter((t) => t.key !== key);
    c.thoughts.push({ key, expires: this.tick + (def.hours ?? 1) * TICKS_PER_HOUR });
  }

  private situationalThoughts(c: Colonist): string[] {
    const keys: string[] = [];
    const { food, rest, joy } = c.needs;
    const h = c.health;
    if (h.hypothermia > 0.5) {
      keys.push('hypothermic');
    } else if (h.hypothermia > 0.15) {
      keys.push('chilled');
    }
    if (h.heatstroke > 0.5) {
      keys.push('heatstroke');
    } else if (h.heatstroke > 0.15) {
      keys.push('overheated');
    }
    if (h.poisoned > 0) {
      keys.push('foodPoisoning');
    }
    if (isWet(this, c.tile)) {
      keys.push('rainedOn');
    }
    if (c.apparel && c.apparel.wear < TATTERED) {
      keys.push('tatteredApparel');
    }
    if (food <= 0) {
      keys.push('starving');
    } else if (food < 0.25) {
      keys.push('hungry');
    }
    if (rest <= 0.02) {
      keys.push('exhausted');
    } else if (rest < 0.25) {
      keys.push('tired');
    }
    if (joy < 0.25) {
      keys.push('bored');
    } else if (joy > 0.8) {
      keys.push('entertained');
    }
    // Variety is the spice of life.
    const recent = Object.values(c.recentJoy);
    const total = recent.reduce((a, b) => a + b, 0);
    const kinds = recent.filter((amount) => amount >= Math.max(VARIETY_MIN, VARIETY_SHARE * total)).length;
    // "Same old thing" only once the colony has built something for fun: a fresh landing has nothing
    // but walks.
    if (kinds >= 3) {
      keys.push('variedRecreation');
    } else if (total >= SAME_OLD_TOTAL && Math.max(...recent) >= SAME_OLD_SHARE * total && this.hasJoyBuilding()) {
      keys.push('sameOldThing');
    }
    // The dead: a memorial keeps them with us; one left unburied for days weighs on everyone.
    if (this.colonists.some((o) => o.health.dead)) {
      if (this.hasMemorial()) {
        keys.push('remembered');
      }
      if (this.unburied.some((f) => this.day - f.day <= UNBURIED_DAYS)) {
        keys.push('unburied');
      }
    }
    if (this.obsession?.colonist === c.id) {
      keys.push('obsessed');
    }
    if (c.health.injuries.some(isInfected)) {
      keys.push('infectedWound');
    }
    keys.push(...villageThoughts(this, c));
    // Expectations rise as the colony settles in: what pleased at the landing is taken for granted in
    // later years.
    const years = (this.day - 1) / DAYS_PER_YEAR;
    if (this.day <= LOW_EXPECTATION_DAYS) {
      keys.push('lowExpectations');
    } else if (years >= 4) {
      keys.push('veryHighExpectations');
    } else if (years >= 2) {
      keys.push('highExpectations');
    }
    if (inHospitalBed(this, c)) {
      keys.push('inHospital');
    }
    // What's around them: sculptures, flowers, fine floors and furniture lift the spirits; a bare
    // room with nothing pleasant in it drags a little.
    if (!c.sleeping) {
      const around = this.beautyAround(c.tile);
      if (around >= BEAUTIFUL_AROUND) {
        keys.push('beautifulSurroundings');
      } else if (around >= PLEASANT_AROUND) {
        keys.push('pleasantSurroundings');
      } else if (around <= 0 && this.isIndoors(c.tile)) {
        keys.push('drabSurroundings');
      }
      if (this.isIndoors(c.tile) && this.messAround(c.tile) >= FILTHY) {
        keys.push('filthyRoom');
      }
    }
    // Cold and heat as felt in what they're wearing.
    const temp = this.temperatureAt(c.tile);
    const comfort = comfortRange(c);
    if (temp < Math.min(0, comfort.min - 8)) {
      keys.push('freezing');
    } else if (temp < comfort.min) {
      keys.push('cold');
    } else if (temp > comfort.max) {
      keys.push('hot');
    }
    if (c.health.disease) {
      keys.push('sick');
    }
    if (painOf(c) > 0.15) {
      keys.push('inPain');
    }
    keys.push(...socialThoughts(this, c));
    keys.push(...ageThoughts(c));
    return keys;
  }

  private updateMood(c: Colonist): void {
    c.thoughts = c.thoughts.filter((t) => t.expires > this.tick);
    const target = 50 + this.thoughtsOf(c).reduce((sum, t) => sum + t.mood, 0);
    const clamped = Math.max(0, Math.min(100, target));
    c.mood += Math.max(-1, Math.min(1, clamped - c.mood));

    if (this.inMentalBreak(c) || c.health.downed) {
      return;
    }
    if (c.breakUntil > 0) {
      // A break just ended.
      c.breakUntil = 0;
      c.breakKind = undefined;
      this.addThought(c, 'recoveredFromBreak');
      this.addLog(`${c.name} has calmed down.`, 'info');
    }
    // (Not again within a day of the last: having let it all out, they hold together a while, however bad things
    // are. Grief stacked on grief had them breaking again and again within days.)
    const spent = c.thoughts.some((t) => t.key === 'recoveredFromBreak');
    // And never more than a third of the colony at once: someone has to keep the fires going. (A whole colony
    // sulking through a harsh winter froze.)
    const living = this.living();
    const breaking = living.filter((o) => this.inMentalBreak(o)).length;
    const held = breaking >= Math.max(1, Math.floor(living.length / 3));
    c.lowMoodTicks = c.mood < BREAK_THRESHOLD && !spent && !held ? c.lowMoodTicks + SLOW_TICKS : 0;
    if (c.lowMoodTicks > TICKS_PER_HOUR * 2 && this.rng.next() < 0.05) {
      c.lowMoodTicks = 0;
      this.startBreak(c, chooseBreak(this, c), this.rng.int(3, 5));
    }
  }

  // A colonist breaks down, in their own way, for some hours.
  public startBreak(c: Colonist, kind: BreakKind, hours: number): void {
    c.breakUntil = this.tick + hours * TICKS_PER_HOUR;
    c.breakKind = kind;
    c.drafted = false;
    this.endJob(c);
    this.addLog(breakLog(c, kind), kind === 'tantrum' ? 'danger' : 'warn');
  }

  private updateNeeds(c: Colonist): void {
    const n = c.needs;
    const caring = this.infants.some((i) => i.carer === c.id) ? CARER_HUNGER : 1;
    n.food = Math.max(
      0,
      n.food - FOOD_DECAY * traitFactor(c, 'foodDecay') * (c.sleeping ? 0.5 : 1) * caring * rationsHunger(this.village),
    );
    if (!c.sleeping) {
      n.joy = Math.max(0, n.joy - JOY_DECAY * traitFactor(c, 'joyDecay'));
    }
    // Lying still, asleep or downed, is resting.
    if (c.sleeping || c.health.downed) {
      const f = this.world.feature[c.tile];
      const bed = f !== NONE && featureDef(f).bed ? featureDef(f) : undefined;
      n.rest = Math.min(1, n.rest + (bed ? REST_GAIN_BED * bed.restGain : REST_GAIN_GROUND));
    } else {
      n.rest = Math.max(0, n.rest - REST_DECAY);
    }
    if (c.job?.type === 'joy' && c.job.target < 0 && c.path.length > 0) {
      // A walk among trees or by the water does more good than one across bare ground.
      const scenic = 1 + SCENIC_BONUS * this.scenery(c.tile);
      this.enjoy(c, 'outdoor', JOY_GAIN_WALK * this.joyEfficiency(c, 'outdoor') * scenic);
    }
  }

  // ---- Reservations ----

  private isReserved(key: string, c: Colonist): boolean {
    // Forbidden items count as taken: every search for an item checks its `i<tile>` key.
    if (key.charCodeAt(0) === 105 && this.world.forbidden[keyTile(key)] === 1) {
      return true;
    }
    // So does anything within reach of a siege camp, for anyone not drafted to fight.
    // (Checked first that a siege is on at all: this runs for every candidate in every search.)
    if (
      this.raid?.siege &&
      !this.raid.siege.attacking &&
      !c.drafted &&
      TILE_KEYS.has(key.charCodeAt(0)) &&
      this.nearSiegeCamp(keyTile(key))
    ) {
      return true;
    }
    const owner = this.reservations.get(key);
    return owner !== undefined && owner !== c.id;
  }

  // Notes how the colony stands this morning, for the history graphs.
  private recordDay(): void {
    const living = this.living();
    const mood = living.length > 0 ? living.reduce((sum, c) => sum + c.mood, 0) / living.length : 0;
    const food =
      this.resourceTotals().reduce((sum, t) => sum + itemDef(t.item).nutrition * t.total, 0) /
      (Math.max(1, living.length) * 1.4);
    this.history.push([
      this.day,
      living.length,
      Math.round(mood),
      Math.round(colonyWealth(this)),
      Math.round(food * 10) / 10,
    ]);
  }

  // Out of reach of the siege camp: to the nearest tile clear of it.
  private leaveSiegeZone(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    const spot = this.nearest(
      c.tile,
      (i) => this.world.isPassable(i) && this.regionOf(i) === region && !this.nearSiegeCamp(i),
      1,
    )[0];
    const path = spot === undefined ? null : this.pathfinder.find(c.tile, [spot]);
    if (!path || spot === undefined) {
      return false;
    }
    this.assign(c, this.makeJob('wander', spot), path);
    return true;
  }

  // Within bowshot (and a little more) of a siege party waiting in its camp.
  public nearSiegeCamp(tile: number): boolean {
    const siege = besieging(this);
    return !!siege && tile >= 0 && this.world.distance(tile, siege.camp) <= SIEGE_DANGER;
  }

  private reserve(c: Colonist, key: string): void {
    this.reservations.set(key, c.id);
    this.mirrorItem(key, c.id);
    c.reserved.push(key);
  }

  private release(c: Colonist, key: string): void {
    if (this.reservations.get(key) === c.id) {
      this.reservations.delete(key);
      this.mirrorItem(key, -1);
    }
    c.reserved = c.reserved.filter((k) => k !== key);
  }

  // Item reservations (`i<tile>`) are kept by tile as well, so a search over every item needn't build a
  // key for each one.
  private readonly itemOwners = new Map<number, number>();
  private mirrorItem(key: string, owner: number): void {
    if (key.charCodeAt(0) !== 105) {
      return;
    }
    const tile = keyTile(key);
    if (Number.isNaN(tile)) {
      return;
    }
    if (owner < 0) {
      this.itemOwners.delete(tile);
    } else {
      this.itemOwners.set(tile, owner);
    }
  }

  // isReserved(`i${tile}`, c), without the key: forbidden, by a siege camp, or someone else's.
  private itemTaken(tile: number, c: Colonist): boolean {
    if (this.world.forbidden[tile] === 1) {
      return true;
    }
    if (this.raid?.siege && !this.raid.siege.attacking && !c.drafted && this.nearSiegeCamp(tile)) {
      return true;
    }
    const owner = this.itemOwners.get(tile);
    return owner !== undefined && owner !== c.id;
  }

  public endJob(c: Colonist): void {
    if ((c.job?.type === 'sleep' || c.job?.type === 'rest') && c.sleeping) {
      this.wakeUp(c);
    }
    // A craft abandoned halfway: set down what was gathered (a mixed bundle part by part) so it's
    // back within everyone's reach.
    if (c.job?.type === 'craft' && (c.carrying?.extra?.length || c.carrying?.mix)) {
      this.dropCarried(c);
    }
    for (const key of c.reserved) {
      if (this.reservations.get(key) === c.id) {
        this.reservations.delete(key);
        this.mirrorItem(key, -1);
      }
    }
    c.reserved = [];
    c.job = null;
    c.path = [];
    c.moveProgress = 0;
    c.sleeping = false;
  }

  private assign(c: Colonist, job: Job, path: number[]): void {
    c.job = job;
    c.path = path;
    c.moveProgress = 0;
  }

  private makeJob(type: JobType, target: number, extra: Partial<Job> = {}): Job {
    return {
      type,
      target,
      source: -1,
      item: NONE,
      count: 0,
      line: 0,
      stage: 0,
      progress: 0,
      wait: 0,
      patient: -1,
      ...extra,
    };
  }

  // ---- Colonist behaviour ----

  private updateColonist(c: Colonist): void {
    this.updateNeeds(c);
    if (this.isNight()) {
      c.nightTicks++;
      if (!this.isIndoors(c.tile)) {
        c.exposedTicks++;
      }
    }
    if (c.health.downed) {
      this.crawlToShelter(c);
      return;
    }
    // A drafted colonist on the way somewhere they were sent (by the player, or by their stance)
    // gets there before they stop to shoot; otherwise fighting takes the whole tick.
    const sent = c.drafted && c.path.length > 0 && c.path[c.path.length - 1] === c.draftTarget;
    if (c.drafted && c.path.length === 0) {
      this.ordered.delete(c.id);
    }
    // On the way somewhere, they still hit back at anyone right next to them.
    const adjacent = this.enemies.some((e) => e.hp > 0 && this.world.distance(e.tile, c.tile) < 1.5);
    const cornered = sent && adjacent;
    // Undrafted and caught outside: running for shelter comes before trading shots, unless a raider
    // is already on top of them. (Failed searches are throttled inside tryShelter.)
    // Already on the way to shelter counts too: otherwise self-defence would cancel the run each
    // tick and they'd stand frozen between the two.
    const running =
      !c.drafted && !adjacent && (c.job?.type === 'shelter' || (this.raidersNear(c) && this.tryShelter(c)));
    if (!running && (!sent || cornered) && colonistCombat(this, c)) {
      this.fighting.add(c.id);
      if (c.drafted) {
        this.draftedTactics(c);
      }
      return;
    }
    this.fighting.delete(c.id);
    if (c.drafted) {
      if (!sent) {
        this.draftedTactics(c);
      }
      // Nothing to shoot at and dangerously cold (or hot): head for shelter.
      if (c.path.length === 0 && (c.health.hypothermia > 0.5 || c.health.heatstroke > 0.5)) {
        this.tryWarmUp(c);
      }
      if (c.path.length > 0) {
        this.move(c);
      }
      return;
    }

    if (this.tick % SLOW_TICKS === 0 && this.raidersNear(c) && this.tryShelter(c)) {
      // Running for cover.
    } else if (
      this.tick % SLOW_TICKS === 0 &&
      c.job &&
      !SIEGE_EXEMPT.has(c.job.type) &&
      (this.nearSiegeCamp(c.job.target) || this.nearSiegeCamp(c.path[c.path.length - 1] ?? -1))
    ) {
      // Work that would take them within reach of a siege camp waits (not bringing in or tending the hurt).
      this.endJob(c);
    } else if (this.tick % SLOW_TICKS === 0 && !c.job && this.nearSiegeCamp(c.tile) && this.leaveSiegeZone(c)) {
      // Caught within reach of the camp with nothing to do: get clear.
    } else if (this.inMentalBreak(c)) {
      const allowed = c.job && ['wander', 'warmUp', 'shelter', ...(c.breakKind === 'binge' ? ['eat'] : [])];
      // A sulk lasts the whole break: one in a freezing (or sweltering) bed gives up for somewhere bearable,
      // as a daze does, if there's anywhere to go.
      const exposedSulk =
        c.job?.stage === SULK_STAGE &&
        (c.health.hypothermia > 0.5 || c.health.heatstroke > 0.5) &&
        (this.nextWarmSearch.get(c.id) ?? 0) <= this.tick;
      if ((c.job && !allowed!.includes(c.job.type)) || exposedSulk) {
        this.endJob(c);
      }
      if (this.stepOutOfFire(c)) {
        return;
      }
    } else {
      const slot = this.slotOf(c);
      // Doctors get out of bed (or drop their work) for someone who is bleeding or collapsed.
      if (
        this.tick % SLOW_TICKS === 0 &&
        c.job?.type !== 'tend' &&
        c.job?.type !== 'rescue' &&
        c.job?.type !== 'feed' &&
        c.job?.type !== 'eat' &&
        c.priorities.doctor > 0 &&
        // (Not the retired, nor a child: they don't doctor, so mustn't be pulled out of bed for it.)
        canWork(c, 'doctor') &&
        c.health.hypothermia <= 0.5 &&
        c.health.heatstroke <= 0.5 &&
        this.urgentPatient(c)
      ) {
        this.endJob(c);
        if (!(this.exposedPatient(c) && this.tryRescue(c)) && !this.tryTend(c)) {
          this.tryRescue(c);
        }
      }
      // Someone lying helpless and starving gets fed: by a doctor, who drops what they're doing, or by
      // anyone at all when no doctor is on their feet. (A failed search waits a while before the next.)
      if (
        this.tick % SLOW_TICKS === 0 &&
        !c.job?.type.match(/^(tend|rescue|feed|eat)$/) &&
        !c.drafted &&
        canWork(c, 'doctor') &&
        (c.priorities.doctor > 0 || !this.doctorStanding()) &&
        c.health.hypothermia <= 0.5 &&
        c.health.heatstroke <= 0.5 &&
        (this.nextFeedSearch.get(c.id) ?? 0) <= this.tick &&
        this.starvingPatient(c)
      ) {
        if (this.findFeed(c, STARVING_PATIENT)) {
          this.endJob(c);
          this.tryFeed(c, STARVING_PATIENT);
        } else {
          this.nextFeedSearch.set(c.id, this.tick + TICKS_PER_HOUR);
        }
      }
      const job = c.job?.type;
      // Starving colonists drop everything, sleep included, to eat. A failed food search is
      // retried a little later rather than every tick.
      // Freezing (or heatstroke) kills in hours, while hunger only grinds the mood down: someone in
      // danger from the weather looks for shelter first.
      const exposed = c.health.hypothermia > 0.5 || c.health.heatstroke > 0.5;
      const starving = c.needs.food < 0.1 && job !== 'eat' && !(exposed && job === 'warmUp');
      if (starving && (this.nextFoodSearch.get(c.id) ?? 0) <= this.tick) {
        if (!this.tryEat(c)) {
          this.nextFoodSearch.set(c.id, this.tick + SLOW_TICKS);
        }
      }
      // Dangerously cold (or hot) and still getting worse: drop the task and find shelter.
      // Sleepers are handled on their own; someone helping a patient keeps at it until they're close
      // to collapsing themselves, and so does someone sitting down to eat. But a walk out to food in
      // the freezing cold can wait: hunger takes days, the cold hours.
      const task = c.job?.type;
      const helping = task === 'rescue' || task === 'tend' || task === 'feed';
      const nearCollapse = Math.max(c.health.hypothermia, c.health.heatstroke) > 0.75;
      if (
        exposed &&
        this.tick % SLOW_TICKS === 0 &&
        task !== undefined &&
        task !== 'warmUp' &&
        task !== 'sleep' &&
        (task !== 'eat' || (nearCollapse && c.path.length > 0)) &&
        (!helping || nearCollapse) &&
        this.exposedHere(c) &&
        (this.nextWarmSearch.get(c.id) ?? 0) <= this.tick
      ) {
        this.endJob(c);
        this.tryWarmUp(c);
      }
      // A fire near home: ordinary work stops for it, and the smoke wakes anyone sleeping close by.
      const now = c.job?.type;
      if (
        this.burning.size > 0 &&
        this.tick % SLOW_TICKS === 0 &&
        ((c.priorities.hauling > 0 && canWork(c, 'hauling')) ||
          (c.priorities.construction > 0 && canWork(c, 'construction'))) &&
        now !== undefined &&
        (FIRE_INTERRUPTS.has(now) || (now === 'sleep' && this.fireWithin(c.tile, Simulation.SMOKE_WAKES)))
      ) {
        const found = this.findFire(c);
        if (found) {
          this.endJob(c);
          this.startFirefight(c, found.fire, found.path);
        }
      }
      if (this.stepOutOfFire(c)) {
        return;
      }
      if (c.job?.type === 'eat') {
        // Eating comes first.
      } else if (job === 'sleep') {
        // Too cold (or hot) to sleep on: get up and find somewhere better, if there's anywhere to go.
        const exposed =
          (c.health.hypothermia > 0.35 || c.health.heatstroke > 0.35) &&
          (this.nextWarmSearch.get(c.id) ?? 0) <= this.tick;
        if ((slot !== 'S' && c.needs.rest >= 0.9) || exposed) {
          this.endJob(c);
        }
      } else if (
        // An evening party, concert or story circle runs on past bedtime to its end (an hour or so); only
        // exhaustion breaks it up. (Cut off at bedtime, nobody got anything from it.)
        ((slot === 'S' && c.needs.rest < 0.98 && !this.inEveningCompany(c)) || c.needs.rest < 0.1) &&
        // (Not while stepping out of a fire.)
        this.world.fire[c.tile] <= 0 &&
        job !== 'rest' &&
        job !== 'tend' &&
        job !== 'warmUp' &&
        job !== 'rescue' &&
        job !== 'shelter' &&
        // Woken to fight a fire or to feed someone bedridden: that comes first.
        job !== 'extinguish' &&
        job !== 'feed'
      ) {
        this.endJob(c);
        this.startSleep(c);
      }
    }

    if (c.path.length > 0) {
      this.move(c);
      return;
    }
    if (!c.job) {
      this.findJob(c);
      return;
    }
    this.stepJob(c);
  }

  // How far along the current step a colonist moves per tick (renderers use it to interpolate).
  public moveRate(c: Colonist): number {
    const w = this.world;
    const next = c.path[0];
    if (next === undefined || !w.isPassable(next)) {
      return 0;
    }
    const diagonal = w.xOf(next) !== w.xOf(c.tile) && w.yOf(next) !== w.yOf(c.tile);
    const hunger = starving(c) ? STARVING_MOVE : 1;
    return (
      (MOVE_SPEED * armorOf(c).speed * hunger * agePace(c).move * scarMove(c, this.isResearched('prosthetics'))) /
      (w.moveCost(next) * (diagonal ? Math.SQRT2 : 1))
    );
  }

  private move(c: Colonist): void {
    const next = c.path[0];
    if (!this.world.isPassable(next)) {
      this.endJob(c);
      return;
    }
    c.moveProgress += this.moveRate(c);
    if (c.moveProgress >= 1) {
      this.trackDirt(c.tile, next);
      c.tile = next;
      c.path.shift();
      c.moveProgress = 0;
      if (c.job?.type === 'capture' && c.job.stage === 1) {
        const captive = this.captives.find((p) => p.id === c.job!.patient);
        if (captive) {
          captive.tile = next;
        }
      }
      if (c.job?.type === 'rescue' && c.job.stage === 1) {
        const patient = this.colonists[c.job.patient];
        if (patient?.health.downed) {
          patient.tile = next;
        }
      }
      if (this.world.isWading(next)) {
        this.addThought(c, 'soaked');
      }
    }
  }

  // Coming in off bare ground, feet carry dirt onto floors (more of it when the ground is wet).
  private trackDirt(from: number, to: number): void {
    const w = this.world;
    if (w.floor[to] === NONE || w.floor[from] !== NONE || w.isOpenWater(from)) {
      return;
    }
    const chance = weatherDef(this).wet ? TRACK_DIRT_WET : TRACK_DIRT;
    if (hash2(to, this.tick, this.seed) < chance) {
      w.addFilth(to, Filth.DIRT);
    }
  }

  // Out in the open, weather wears mess away in a day or two (rain much faster).
  private weatherFilth(): void {
    const w = this.world;
    const chance = weatherDef(this).wet ? 0.3 : 1 / 24;
    for (const i of [...w.tilesWith('filth')]) {
      if (!this.isRoofed(i) && hash2(i, this.tick, this.seed + 7) < chance) {
        w.cleanFilth(i);
      }
    }
  }

  private findJob(c: Colonist): void {
    if (this.inMentalBreak(c)) {
      // Even in a daze, someone freezing stumbles somewhere warmer.
      if ((c.health.hypothermia > 0.5 || c.health.heatstroke > 0.5) && this.tryWarmUp(c)) {
        return;
      }
      if (c.breakKind === 'binge' && this.tryEat(c)) {
        return;
      }
      if (c.breakKind === 'sulk' && this.startSulk(c)) {
        return;
      }
      if (c.breakKind === 'tantrum' && this.startTantrum(c)) {
        return;
      }
      this.startWander(c);
      return;
    }
    if (c.carrying && this.tryStash(c)) {
      return;
    }
    const slot = this.slotOf(c);
    const food = c.needs.food;
    const h = c.health;
    if ((h.hypothermia > 0.5 || h.heatstroke > 0.5) && this.tryWarmUp(c)) {
      return;
    }
    // The frail wait for their meals to be brought, and only fetch their own when nobody has.
    const cared = needsCare(c);
    // (Not while someone is already on the way with a meal for them.)
    const bringing = cared && (this.reservations.get(`fd${c.id}`) ?? c.id) !== c.id;
    if (
      ((food < rationsEatBelow(this.village) && slot !== 'W' && !cared) || (food < 0.15 && !bringing)) &&
      this.tryEat(c)
    ) {
      if (cared) {
        this.addThought(c, 'leftToFend');
      }
      return;
    }
    if ((h.hypothermia > 0.3 || h.heatstroke > 0.3) && this.tryWarmUp(c)) {
      return;
    }
    if (this.tryEquip(c)) {
      return;
    }
    if (this.tryDress(c)) {
      return;
    }
    if (this.tryTakeTool(c)) {
      return;
    }
    if (needsBedRest(c)) {
      // The walking wounded patch up others (or, failing that, themselves) before lying down.
      if (
        c.priorities.doctor > 0 &&
        canWork(c, 'doctor') &&
        (this.urgentPatient(c) || needsTending(this, c)) &&
        this.tryTend(c)
      ) {
        return;
      }
      this.startRest(c);
      return;
    }
    // A day of rest isn't a day off from keeping everyone alive: patients and prisoners are still fed and
    // tended, and fires that are about to go out are still fed.
    if (slot === 'J' && restDay(this) && this.tryEssentialWork(c)) {
      return;
    }
    // School in the morning: children to their lessons, and the teacher to teach them.
    if (slot !== 'J' && tryLesson(this, c)) {
      return;
    }
    if ((slot === 'J' || (slot === 'A' && c.needs.joy < 0.3)) && c.needs.joy < 0.95 && this.tryJoy(c)) {
      return;
    }
    // An obsessed artist works on nothing but their vision, when there's anything to do for it (after
    // seeing to their own needs).
    if (slot !== 'J' && this.obsession?.colonist === c.id && this.tryLegend(c)) {
      return;
    }
    if (slot !== 'J' && this.tryWorkByPriority(c)) {
      return;
    }
    // A child at a loose end goes to find the others to play with.
    if (trySeekPlaymate(this, c)) {
      return;
    }
    this.startWander(c);
  }

  // For modules: sends a colonist to the nearest reachable tile of `goals` to do a job there.
  public sendTo(c: Colonist, type: JobType, goals: number[], extra: Partial<Job> = {}): boolean {
    const path = goals.length > 0 ? this.pathfinder.find(c.tile, goals) : null;
    if (!path) {
      return false;
    }
    this.assign(c, this.makeJob(type, path.length > 0 ? path[path.length - 1] : c.tile, extra), path);
    return true;
  }

  private tryEssentialWork(c: Colonist): boolean {
    for (const work of ['doctor', 'warden'] as const) {
      if (c.priorities[work] > 0 && canWork(c, work) && this.tryWorkType(c, work)) {
        return true;
      }
    }
    return c.priorities.hauling > 0 && canWork(c, 'hauling') && this.tryRefuel(c, true);
  }

  private tryWorkByPriority(c: Colonist): boolean {
    // After a few harvests in a row, clear up the mess before cutting more.
    if (c.priorities.hauling > 0 && canWork(c, 'hauling') && c.workStreak >= 3 && this.tryHaul(c)) {
      return true;
    }
    // A fire near home comes before everything: anyone who hauls or builds turns out for it.
    if (
      ((c.priorities.hauling > 0 && canWork(c, 'hauling')) ||
        (c.priorities.construction > 0 && canWork(c, 'construction'))) &&
      this.tryFirefight(c)
    ) {
      return true;
    }
    // A generator about to run dry takes priority over everything else a hauler might do.
    if (c.priorities.hauling > 0 && canWork(c, 'hauling') && this.generatorRunningLow() && this.tryRefuel(c, true)) {
      return true;
    }
    // Food running short: the colony's provider (or two, in a big colony) fishes or hunts before anything
    // else. (Hunting comes late in the order; an island colony starved beside its lake, everyone busy with
    // everything but the fishing spots. Sending everyone was worse: nothing got built or hauled.)
    // (Fishing first: a catch is surer than a chase after scarce game.)
    if (this.providers().includes(c.id) && (this.tryFish(c) || this.tryHunt(c))) {
      return true;
    }
    const order = this.workOrder();
    for (let p = 1; p <= 4; p++) {
      for (const work of order) {
        if (c.priorities[work] === p && canWork(c, work) && this.tryWorkType(c, work)) {
          return true;
        }
      }
    }
    // A mine shaft is never done, so miners only dig it when there's nothing else for them to do.
    return c.priorities.mining > 0 && canWork(c, 'mining') && this.tryDesignations(c, [Designation.MINE], true);
  }

  // Work types in the order colonists consider them at equal priority. Normally the fixed order the
  // Work screen shows; but when builders are waiting on stone and not on wood, mining comes before
  // plant cutting, so a big chop order doesn't hold up the stove for days.
  private workOrder(): readonly WorkTypeKey[] {
    if (this.tick >= this.workOrderAt) {
      this.workOrderAt = this.tick + SLOW_TICKS;
      const short = (key: string) => {
        const item = itemId(key);
        let needed = 0;
        for (const i of this.world.tilesWith('blueprints')) {
          for (const need of this.world.blueprintNeeds(i)) {
            if (need.item === item) {
              needed += need.count;
            }
          }
        }
        return needed > this.stockOf(item);
      };
      const stoneFirst = short('stone') && !short('wood');
      this.cachedWorkOrder = stoneFirst ? STONE_FIRST_ORDER : WORK_TYPES;
    }
    return this.cachedWorkOrder;
  }
  private workOrderAt = 0;

  // Who goes for food first while it's short: the best with animals among those who hunt (two in a colony
  // of seven or more). None while there's enough.
  private providers(): readonly number[] {
    if (this.tick >= this.providersAt) {
      this.providersAt = this.tick + SLOW_TICKS;
      // (Not before there's a roof to sleep under: the first hut comes before the fishing.)
      if (foodDays(this) >= PROVIDE_BELOW_DAYS || !this.hasShelter()) {
        this.providerIds = [];
      } else {
        const able = this.living()
          .filter(
            (c) =>
              c.priorities.hunting > 0 &&
              canWork(c, 'hunting') &&
              !c.drafted &&
              !c.health.downed &&
              !c.sleeping &&
              !needsBedRest(c) &&
              !this.inMentalBreak(c),
          )
          .sort((a, b) => b.skills.animals - a.skills.animals || a.id - b.id);
        this.providerIds = able.slice(0, this.living().length >= 7 ? 2 : 1).map((c) => c.id);
      }
    }
    return this.providerIds;
  }
  private providersAt = 0;
  private providerIds: number[] = [];
  private cachedWorkOrder: readonly WorkTypeKey[] = WORK_TYPES;

  private tryWorkType(c: Colonist, work: WorkTypeKey): boolean {
    switch (work) {
      case 'doctor':
        // Someone freezing (or overheating) gets carried to shelter before anyone is tended.
        // Bleeding first, then a starving patient's meal, then the rest of the tending, rescues, and
        // bringing food to anyone downed and hungry.
        return (
          (this.exposedPatient(c) && this.tryRescue(c)) ||
          this.tryTend(c, true) ||
          this.tryFeed(c, STARVING_PATIENT) ||
          this.tryTend(c) ||
          this.tryRescue(c) ||
          this.tryFeed(c) ||
          this.trySoothe(c)
        );
      case 'construction':
        return this.tryConstruct(c) || this.tryDeliver(c) || this.tryDesignations(c, [Designation.DECONSTRUCT]);
      case 'growing':
        return this.tryHarvestCrop(c) || this.trySow(c);
      case 'mining':
        return this.tryDesignations(c, [Designation.MINE]);
      case 'plantCutting':
        return this.tryDesignations(c, [Designation.CHOP, Designation.FORAGE]);
      case 'hunting':
        return this.tryHunt(c) || this.tryFish(c);
      case 'handling':
        return this.tryTame(c);
      case 'research':
        return this.tryResearch(c);
      case 'cooking':
        return this.tryBill(c, 'cooking') || this.tryBill(c, 'mill');
      case 'crafting':
        return (
          this.tryBill(c, 'crafting') ||
          this.tryBill(c, 'stonecutting') ||
          this.tryBill(c, 'kiln') ||
          this.tryBill(c, 'smelter')
        );
      case 'art':
        return this.trySculpt(c) || this.tryDeliver(c, true);
      case 'hauling':
        return this.tryRefuel(c) || this.tryHaul(c) || this.tryChill(c, this.regionOf(c.tile));
      case 'warden':
        return this.tryCapture(c) || this.tryWarden(c);
      case 'cleaning':
        return this.tryClean(c);
    }
  }

  private stepJob(c: Colonist): void {
    const job = c.job!;
    switch (job.type) {
      case 'mine':
      case 'chop':
      case 'forage':
      case 'construct':
      case 'sculpt':
      case 'deconstruct':
      case 'sow':
      case 'harvestCrop':
        this.stepWork(c, job);
        break;
      case 'deliver':
        this.stepDeliver(c, job);
        break;
      case 'clean':
        this.stepClean(c, job);
        break;
      case 'capture':
        this.stepCapture(c, job);
        break;
      case 'warden':
        this.stepWarden(c, job);
        break;
      case 'haul':
        this.stepHaul(c, job);
        break;
      case 'craft':
        this.stepCraft(c, job);
        break;
      case 'eat':
        this.stepEat(c, job);
        break;
      case 'joy':
        this.stepJoy(c, job);
        break;
      case 'sleep':
        this.lieDown(c, job);
        break;
      case 'rest':
        this.lieDown(c, job);
        if (!needsBedRest(c) || --job.wait <= 0) {
          this.endJob(c);
        }
        break;
      case 'tend':
      case 'soothe':
        this.stepTend(c, job);
        break;
      case 'feed':
        this.stepFeed(c, job);
        break;
      case 'warmUp':
        this.stepWarmUp(c, job);
        break;
      case 'rescue':
        this.stepRescue(c, job);
        break;
      case 'tame':
        this.stepTame(c, job);
        break;
      case 'extinguish':
        this.stepExtinguish(c, job);
        break;
      case 'shelter':
        this.stepShelter(c, job);
        break;
      case 'hunt':
        this.stepHunt(c, job);
        break;
      case 'equip':
        this.stepEquip(c, job);
        break;
      case 'research':
        this.stepResearch(c, job);
        break;
      case 'refuel':
        this.stepRefuel(c, job);
        break;
      case 'fish':
        this.stepFish(c, job);
        break;
      case 'lesson':
        stepLesson(this, c);
        break;
      case 'wander':
        // A rage ends with something broken.
        if (job.stage === TANTRUM_STAGE && this.inMentalBreak(c) && this.isAtWorkSpot(c, job.target, false)) {
          this.smash(c, job.target);
          this.endJob(c);
          break;
        }
        // A sulk lasts as long as the break, no longer.
        if (job.wait-- <= 0 || (job.stage === SULK_STAGE && !this.inMentalBreak(c))) {
          this.endJob(c);
        }
        break;
    }
  }

  // Sulking: off to bed (or somewhere indoors) to stew for the rest of the break.
  private startSulk(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const spot =
      this.nearestIn(
        'buildings',
        c.tile,
        (i) => featureDef(w.feature[i]).bed && this.regions.region[i] === region && !this.isReserved(`b${i}`, c),
        1,
      )[0] ??
      this.nearest(c.tile, (i) => w.isPassable(i) && this.isIndoors(i) && this.regions.region[i] === region, 1)[0];
    const path = spot !== undefined ? this.pathfinder.find(c.tile, [spot]) : null;
    if (spot === undefined || !path) {
      return false;
    }
    this.assign(
      c,
      this.makeJob('wander', spot, { wait: Math.max(60, c.breakUntil - this.tick), stage: SULK_STAGE }),
      path,
    );
    return true;
  }

  // A rage: storm over to a nearby piece of furniture and break it.
  private startTantrum(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    const [target] = this.nearestIn(
      'buildings',
      c.tile,
      (i) =>
        smashable(this, i) && this.world.distance(c.tile, i) <= TANTRUM_RANGE && this.hasWorkSpot(i, false, region),
      1,
    );
    const path = target !== undefined ? this.pathfinder.find(c.tile, this.workSpots(target, false, region)) : null;
    if (target === undefined || !path) {
      return false;
    }
    this.assign(c, this.makeJob('wander', target, { wait: 20, stage: TANTRUM_STAGE }), path);
    return true;
  }

  private smash(c: Colonist, i: number): void {
    const w = this.world;
    const f = w.feature[i];
    if (!smashable(this, i)) {
      return;
    }
    const name = featureDef(f).name.toLowerCase();
    // One thing broken, and the rage burns out into a daze for the rest of the break.
    c.breakKind = 'daze';
    w.setFeature(i, NONE);
    w.addFilth(i, Filth.RUBBLE, 2);
    const again = this.rebuild(i, f);
    this.stats.smashed = (this.stats.smashed ?? 0) + 1;
    this.addLog(
      `${c.name} smashed ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name} in a rage.${again ? " It's marked for rebuilding." : ''}`,
      'warn',
      true,
    );
  }

  // ---- Obsessions ----

  // A spot for a legendary piece: open ground near the middle of the colony.
  public legendSite(): number | undefined {
    const home = this.homeTile() ?? this.living()[0]?.tile;
    if (home === undefined) {
      return undefined;
    }
    // (The middle of the colony may be a wall or a stove, in no region at all: the walkable tile nearest it.)
    const region = this.regionOf(this.world.isPassable(home) ? home : (this.world.nearestPassable(home) ?? home));
    return this.nearest(
      home,
      (i) =>
        this.world.feature[i] === NONE &&
        this.world.blueprint[i] === NONE &&
        this.world.itemType[i] === NONE &&
        this.regions.region[i] === region &&
        this.canPlaceBlueprint(i, LEGEND) &&
        this.world.neighbors(i).every((n) => this.world.feature[n] === NONE),
      1,
    )[0];
  }

  public planLegend(tile: number): void {
    this.placeBlueprint(tile, LEGEND);
  }

  public dropLegend(tile: number): void {
    if (this.world.blueprint[tile] === LEGEND) {
      this.cancelBlueprint(tile);
    }
  }

  public itemName(item: number): string {
    return itemDef(item).name.toLowerCase();
  }

  // The obsessed artist: carve the vision if everything's there, or fetch what's missing.
  private tryLegend(c: Colonist): boolean {
    const tile = this.obsession!.tile;
    const region = this.regionOf(c.tile);
    if (this.constructable(tile) && !this.isReserved(`w${tile}`, c) && this.hasWorkSpot(tile, false, region)) {
      return this.startWorkJob(c, 'sculpt', [tile], region);
    }
    return this.tryDeliver(c, true);
  }

  // Up to `limit` tiles passing `test`, nearest first. `bias` adds to a tile's distance.
  public nearest(from: number, test: (i: number) => boolean, limit = 4, bias?: (i: number) => number): number[] {
    const w = this.world;
    if (bias) {
      const best: { i: number; d: number }[] = [];
      for (let i = 0; i < w.size; i++) {
        const d = w.distance(from, i) + bias(i);
        // Distance is cheap and the test often isn't: only test tiles that could make the cut.
        if (this.couldRank(best, i, d, limit) && test(i)) {
          this.rank(best, i, d, limit);
        }
      }
      return best.map((b) => b.i);
    }
    // Without a bias, search ever bigger squares around `from`: once the square holds `limit` tiles all
    // no farther than its edge, nothing outside it can do better (distance is never less than the
    // larger of dx and dy), so the answer is the same as a scan of the whole map, for far less work.
    const fx = w.xOf(from);
    const fy = w.yOf(from);
    for (let r = 8; ; r *= 2) {
      const best: { i: number; d: number }[] = [];
      const x0 = Math.max(0, fx - r);
      const x1 = Math.min(w.width - 1, fx + r);
      const y0 = Math.max(0, fy - r);
      const y1 = Math.min(w.height - 1, fy + r);
      for (let y = y0; y <= y1; y++) {
        const dy = Math.abs(y - fy);
        for (let x = x0; x <= x1; x++) {
          const i = y * w.width + x;
          // w.distance(from, i), worked out from the coordinates already in hand.
          const dx = Math.abs(x - fx);
          const d = Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
          if (this.couldRank(best, i, d, limit) && test(i)) {
            this.rank(best, i, d, limit);
          }
        }
      }
      const wholeMap = x0 === 0 && y0 === 0 && x1 === w.width - 1 && y1 === w.height - 1;
      if (wholeMap || (best.length === limit && best[limit - 1].d <= r)) {
        return best.map((b) => b.i);
      }
    }
  }

  // The same search over just one kind of tile ('storage' is zones plus buildings, which covers
  // stockpiles and iceboxes). Much cheaper than scanning a big map.
  public nearestIn(
    kind: TileKind | 'storage' | 'buildings',
    from: number,
    test: (i: number) => boolean,
    limit = 4,
    bias?: (i: number) => number,
  ): number[] {
    const w = this.world;
    const best: { i: number; d: number }[] = [];
    const search = (tiles: Iterable<number>) => {
      for (const i of tiles) {
        const d = w.distance(from, i) + (bias ? bias(i) : 0);
        if (this.couldRank(best, i, d, limit) && test(i)) {
          this.rank(best, i, d, limit);
        }
      }
    };
    if (kind === 'storage') {
      search(this.storageTiles());
    } else if (kind === 'buildings') {
      search(this.buildingTiles());
    } else {
      search(w.tilesWith(kind));
    }
    return best.map((b) => b.i);
  }

  // The same search over a given list of tiles (in any order: the ranking breaks ties by tile index).
  private nearestAmong(
    tiles: readonly number[],
    from: number,
    test: (i: number) => boolean,
    limit = 4,
    bias?: (i: number) => number,
  ): number[] {
    const w = this.world;
    const best: { i: number; d: number }[] = [];
    for (const i of tiles) {
      const d = w.distance(from, i) + (bias ? bias(i) : 0);
      if (this.couldRank(best, i, d, limit) && test(i)) {
        this.rank(best, i, d, limit);
      }
    }
    return best.map((b) => b.i);
  }

  // Whether a tile at distance `d` would get into a full list of the `limit` best.
  private couldRank(best: { i: number; d: number }[], i: number, d: number, limit: number): boolean {
    if (best.length < limit) {
      return true;
    }
    const last = best[best.length - 1];
    return last.d > d || (last.d === d && last.i > i);
  }

  // Keeps `best` sorted by distance, ties broken by tile index, at most `limit` long.
  private rank(best: { i: number; d: number }[], i: number, d: number, limit: number): void {
    const worse = (b: { i: number; d: number }) => b.d > d || (b.d === d && b.i > i);
    if (best.length === limit && !worse(best[best.length - 1])) {
      return;
    }
    let k = best.length;
    while (k > 0 && worse(best[k - 1])) {
      k--;
    }
    best.splice(k, 0, { i, d });
    if (best.length > limit) {
      best.pop();
    }
  }

  public regionOf(i: number): number {
    this.ensureRegions();
    return this.regions.region[i];
  }

  // Tiles a colonist can stand on to work on `target`.
  private workSpots(target: number, standOn: boolean, region: number): number[] {
    const w = this.world;
    const spots = w.neighbors(target).filter((n) => w.isPassable(n) && this.regions.region[n] === region);
    if (standOn && w.isPassable(target) && this.regions.region[target] === region) {
      spots.push(target);
    }
    return spots;
  }

  private hasWorkSpot(target: number, standOn: boolean, region: number): boolean {
    if (standOn && this.regions.region[target] === region) {
      return true;
    }
    for (const n of this.world.neighbors(target)) {
      if (this.regions.region[n] === region) {
        return true;
      }
    }
    return false;
  }

  private isAtWorkSpot(c: Colonist, target: number, standOn: boolean): boolean {
    const w = this.world;
    if (c.tile === target) {
      return standOn;
    }
    return Math.max(Math.abs(w.xOf(c.tile) - w.xOf(target)), Math.abs(w.yOf(c.tile) - w.yOf(target))) === 1;
  }

  private designationValid(i: number): boolean {
    const w = this.world;
    const d = w.designation[i];
    if (d === Designation.DECONSTRUCT) {
      return this.deconstructTarget(i) !== NONE;
    }
    const f = w.feature[i];
    if (d === Designation.NONE || f === NONE) {
      return false;
    }
    return featureDef(f).harvest?.work === JOB_FOR_DESIGNATION[d];
  }

  private constructable(i: number): boolean {
    const w = this.world;
    const bp = w.blueprint[i];
    if (bp === NONE || w.blueprintNeeds(i).length > 0) {
      return false;
    }
    // A floor or roof can go in around a building, but a tree or rock has to be cleared first.
    const f = w.feature[i];
    const layer = featureDef(bp).layer;
    return (
      f === NONE ||
      (!!layer && (!featureDef(f).harvest || featureDef(f).shaft) && !(layer === 'floor' && featureDef(f).crop))
    );
  }

  // What deconstructing this tile takes down: the building, else the roof, else the floor. A crop or
  // tree under a roof stays put while the roof comes off.
  private deconstructTarget(i: number): number {
    const w = this.world;
    const f = w.feature[i];
    if (f !== NONE && featureDef(f).build) {
      return f;
    }
    return w.roof[i] !== NONE ? w.roof[i] : f === NONE ? w.floor[i] : NONE;
  }

  // Whether this tile keeps the weather off: an enclosed room, or a built roof.
  public isRoofed(i: number): boolean {
    return this.world.roof[i] !== NONE || this.isIndoors(i) || this.doorway(i) !== undefined;
  }

  private sowable(i: number): boolean {
    const w = this.world;
    return (
      growZoneCrop(w.zone[i]) !== NONE &&
      w.feature[i] === NONE &&
      w.floor[i] === NONE &&
      w.roof[i] === NONE &&
      w.blueprint[i] === NONE &&
      w.itemType[i] === NONE &&
      terrainDef(w.terrain[i]).fertility > 0
    );
  }

  private harvestable(i: number): boolean {
    const f = this.world.feature[i];
    return f !== NONE && !!featureDef(f).crop && this.world.growth[i] >= 1;
  }

  // Walls and doors go up before what goes inside them: a closed room by nightfall beats beds in the open.
  private readonly enclosureFirst = (i: number): number =>
    featureDef(this.world.blueprint[i]).blocksRoom ? -ENCLOSURE_FIRST : 0;

  private tryConstruct(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    const targets = this.nearestIn(
      'blueprints',
      c.tile,
      (i) =>
        !featureDef(this.world.blueprint[i]).art &&
        this.constructable(i) &&
        !this.isReserved(`w${i}`, c) &&
        this.hasWorkSpot(i, false, region),
      4,
      this.enclosureFirst,
    );
    return this.startWorkJob(c, 'construct', targets, region);
  }

  // Artists carve sculptures in place once the materials are there.
  // Mess worth cleaning: indoors, or out around the colony's buildings, on ground someone can reach.
  private tryClean(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const home = this.homeTile();
    // Mess isn't worth going out into weather they're not dressed for.
    const bearable = (i: number) => this.bearable(c, i);
    // A few of the nearest, in case one can't be reached after all.
    const tiles = this.nearestIn(
      'filth',
      c.tile,
      (i) =>
        this.regions.region[i] === region &&
        w.fire[i] === 0 &&
        (this.isRoofed(i) || w.floor[i] !== NONE || (home !== undefined && w.distance(home, i) <= CLEAN_RANGE)) &&
        bearable(i) &&
        !this.isReserved(`c${i}`, c),
      4,
      // Indoors first, where mess spoils meals, tending and moods.
      (i) => (this.isRoofed(i) ? 0 : 10),
    );
    const path = tiles.length > 0 ? this.pathfinder.find(c.tile, tiles) : null;
    if (!path) {
      return false;
    }
    const tile = path.length > 0 ? path[path.length - 1] : c.tile;
    this.reserve(c, `c${tile}`);
    this.assign(c, this.makeJob('clean', tile), path);
    return true;
  }

  // Scrubbing at a tile, a layer of mess at a time, until it's clean.
  private stepClean(c: Colonist, job: Job): void {
    const w = this.world;
    const t = job.target;
    if (w.filthAmount(t) === 0) {
      this.endJob(c);
      return;
    }
    if (c.tile !== t) {
      const path = this.pathfinder.find(c.tile, [t]);
      if (path && path.length > 0) {
        c.path = path;
      } else {
        this.endJob(c);
      }
      return;
    }
    const mood = c.mood < 25 ? 0.85 : c.mood > 70 ? 1.1 : 1;
    job.progress += traitFactor(c, 'workSpeed') * healthFactor(c) * mood;
    if (job.progress >= CLEAN_WORK) {
      job.progress = 0;
      w.cleanFilth(t);
      if (w.filthAmount(t) === 0) {
        this.endJob(c);
      }
    }
  }

  private trySculpt(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    const targets = this.nearestIn(
      'blueprints',
      c.tile,
      (i) =>
        featureDef(this.world.blueprint[i]).art &&
        (this.world.blueprint[i] !== LEGEND || this.obsession?.colonist === c.id) &&
        this.constructable(i) &&
        !this.isReserved(`w${i}`, c) &&
        this.hasWorkSpot(i, false, region),
    );
    return this.startWorkJob(c, 'sculpt', targets, region);
  }

  // A finished sculpture: its quality from the artist's skill, a subject from the colony's story.
  private finishArtwork(c: Colonist, tile: number, name: string): void {
    const legend = this.world.feature[tile] === LEGEND && this.obsession?.tile === tile;
    const quality = legend ? LEGEND_QUALITY : rollQuality(this, c);
    const memorial = featureDef(this.world.feature[tile]).key === 'memorial';
    const fallen = this.colonists.filter((o) => o.health.dead);
    const title = memorial ? memorialTitle(fallen.map((o) => o.name)) : titleFor(this, c);
    this.artworks.set(tile, {
      quality,
      title,
      artist: c.name,
      day: this.day,
      ...(memorial ? { honors: fallen.map((o) => o.id) } : {}),
    });
    if (memorial) {
      // A memorial eases grief for everyone.
      for (const o of this.living()) {
        this.easeGrief(o);
      }
      this.stats.memorials = (this.stats.memorials ?? 0) + 1;
    }
    // Room beauty was worked out before the quality was known.
    this.contentsVersion = '';
    this.stats.sculptures = (this.stats.sculptures ?? 0) + 1;
    this.stats.bestArt = Math.max(this.stats.bestArt ?? 0, quality);
    const label = qualityLabel(quality).toLowerCase();
    const what = `${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label} ${name.toLowerCase()}`;
    if (legend) {
      this.obsession = null;
      // (A legend can only be carved as someone's vision.)
      this.stats.legends = (this.stats.legends ?? 0) + 1;
      this.addThought(c, 'createdLegend');
      for (const o of this.living()) {
        if (o !== c) {
          this.addThought(o, 'colonyLegend');
        }
      }
      this.addLog(`${c.name} has finished their vision: a legendary sculpture, “${title}”.`, 'good', true);
    } else if (quality >= MASTERWORK) {
      this.addThought(c, 'madeMasterwork');
      this.addLog(`${c.name} has carved a masterwork: ${name.toLowerCase()}, “${title}”.`, 'good', true);
    } else {
      this.addThought(c, 'madeArt');
      this.addLog(
        `${c.name} finished ${what}, “${title}”.`,
        quality >= EXCELLENT ? 'good' : 'info',
        quality >= EXCELLENT,
      );
    }
  }

  // The most impressive enclosed room in the colony.
  public bestImpressiveness(): number {
    this.ensureRegions();
    const contents = this.contents();
    let best = 0;
    for (let r = 0; r < this.rooms.sizes.length; r++) {
      if (this.rooms.enclosed[r]) {
        best = Math.max(best, describeRoom(r, this.rooms, contents[r], 0).impressiveness);
      }
    }
    return best;
  }

  // Beauty within two tiles: buildings and floors, and indoors only what's in the same room.
  public beautyAround(tile: number): number {
    this.ensureRegions();
    const w = this.world;
    const room = this.rooms.room[tile];
    const indoors = room >= 0 && this.rooms.enclosed[room];
    const x0 = w.xOf(tile);
    const y0 = w.yOf(tile);
    let total = 0;
    for (let y = y0 - SURROUNDINGS; y <= y0 + SURROUNDINGS; y++) {
      for (let x = x0 - SURROUNDINGS; x <= x0 + SURROUNDINGS; x++) {
        if (!w.inBounds(x, y)) {
          continue;
        }
        const i = w.idx(x, y);
        if (indoors && this.rooms.room[i] !== room && !w.blocksRoom(i)) {
          continue;
        }
        total += this.beautyAt(i) + (w.floor[i] !== NONE ? featureDef(w.floor[i]).beauty : 0) + w.filthBeauty(i);
      }
    }
    return total;
  }

  // Levels of mess within two tiles, counted like beauty (indoors, only in the same room).
  public messAround(tile: number): number {
    const w = this.world;
    if (w.tilesWith('filth').size === 0) {
      return 0;
    }
    this.ensureRegions();
    const room = this.rooms.room[tile];
    const indoors = room >= 0 && this.rooms.enclosed[room];
    let total = 0;
    for (let y = w.yOf(tile) - SURROUNDINGS; y <= w.yOf(tile) + SURROUNDINGS; y++) {
      for (let x = w.xOf(tile) - SURROUNDINGS; x <= w.xOf(tile) + SURROUNDINGS; x++) {
        if (!w.inBounds(x, y)) {
          continue;
        }
        const i = w.idx(x, y);
        if (w.filth[i] !== 0 && (!indoors || this.rooms.room[i] === room)) {
          total += w.filthAmount(i);
        }
      }
    }
    return total;
  }

  // The finished sculpture on a tile, if there is one.
  public artworkAt(i: number): Artwork | undefined {
    const f = this.world.feature[i];
    return f !== NONE && featureDef(f).art ? this.artworks.get(i) : undefined;
  }

  // What a building on a tile adds to beauty: a sculpture by its quality, flowers by the season.
  public beautyAt(i: number): number {
    const f = this.world.feature[i];
    if (f === NONE) {
      return 0;
    }
    const def = featureDef(f);
    if (def.art) {
      return def.beauty * artBeauty(this.artworks.get(i)?.quality ?? 6);
    }
    if (def.flowers && this.season === 'Winter') {
      return def.beauty * WINTER_FLOWERS;
    }
    return def.beauty;
  }

  private tryHarvestCrop(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    const targets = this.nearestIn(
      'buildings',
      c.tile,
      (i) => this.harvestable(i) && !this.isReserved(`w${i}`, c) && this.regions.region[i] === region,
    );
    return this.startWorkJob(c, 'harvestCrop', targets, region);
  }

  private trySow(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const lit = this.litTiles();
    const untilWinter = daysUntilWinter(this.totalHours);
    const speed = this.isResearched('cropRotation') ? 1.25 : 1;
    // Only sow where the crop can ripen: under a sun lamp, or outdoors with enough season left.
    const earlySpring = this.season === 'Spring' && seasonDay(this.totalHours) <= 2;
    const glass = this.isResearched('glassmaking');
    const canRipen = (i: number) => {
      if (this.temperatureAt(i) < CROP_MIN_TEMP) {
        return false;
      }
      // A sun lamp indoors beats the calendar, and so does a glass greenhouse (a field walled in as a room,
      // open to the sky: see growCrops); outdoors the night frost still kills.
      if ((lit[i] || (glass && w.roof[i] === NONE)) && this.isIndoors(i)) {
        return true;
      }
      // Early spring frosts kill seedlings; and leave a day's margin before winter.
      if (earlySpring) {
        return false;
      }
      const crop = featureDef(growZoneCrop(w.zone[i])).crop!;
      return untilWinter > crop.growDays / (terrainDef(w.terrain[i]).fertility * speed) + 1;
    };
    const targets = this.nearestIn(
      'zones',
      c.tile,
      (i) => this.sowable(i) && !this.isReserved(`w${i}`, c) && this.regions.region[i] === region && canRipen(i),
    );
    return this.startWorkJob(c, 'sow', targets, region);
  }

  private isShaftDig(i: number): boolean {
    const f = this.world.feature[i];
    return this.world.designation[i] === Designation.MINE && f !== NONE && featureDef(f).shaft;
  }

  // `shafts`: dig mine shafts (which never run out) rather than everything else.
  private tryDesignations(c: Colonist, kinds: number[], shafts = false): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const targets = this.nearestIn(
      'designations',
      c.tile,
      (i) =>
        kinds.includes(w.designation[i]) &&
        this.isShaftDig(i) === shafts &&
        this.designationValid(i) &&
        !this.isReserved(`w${i}`, c) &&
        this.hasWorkSpot(i, standsOn(JOB_FOR_DESIGNATION[w.designation[i]]), region),
      4,
      // Clear whatever stands in the way of a planned building first.
      (i) => (w.blueprint[i] !== NONE ? -30 : 0),
    );
    for (const t of targets) {
      if (this.startWorkJob(c, JOB_FOR_DESIGNATION[w.designation[t]], [t], region)) {
        return true;
      }
    }
    return false;
  }

  private startWorkJob(c: Colonist, type: JobType, targets: number[], region: number): boolean {
    const standOn = standsOn(type);
    for (const t of targets) {
      const path = this.pathfinder.find(c.tile, this.workSpots(t, standOn, region));
      if (path) {
        this.reserve(c, `w${t}`);
        this.assign(c, this.makeJob(type, t), path);
        return true;
      }
    }
    return false;
  }

  private workTargetValid(job: Job): boolean {
    switch (job.type) {
      case 'construct':
      case 'sculpt':
        return this.constructable(job.target);
      case 'sow':
        return this.sowable(job.target);
      case 'harvestCrop':
        return this.harvestable(job.target);
      default:
        // Still the work the tile is marked for (a shaft switched from digging to taking down, or back,
        // sends whoever was at it away).
        return (
          JOB_FOR_DESIGNATION[this.world.designation[job.target]] === job.type && this.designationValid(job.target)
        );
    }
  }

  private workAmount(job: Job): number {
    const w = this.world;
    switch (job.type) {
      case 'construct':
      case 'sculpt':
        return featureDef(w.blueprint[job.target]).build!.work;
      case 'sow':
        return featureDef(growZoneCrop(w.zone[job.target])).crop!.sowWork;
      case 'harvestCrop':
        return featureDef(w.feature[job.target]).crop!.harvestWork;
      case 'deconstruct':
        return featureDef(this.deconstructTarget(job.target)).build!.work * 0.5;
      default: {
        const def = featureDef(w.feature[job.target]);
        return def.shaft ? digWork(shaftAt(this, job.target)) : def.harvest!.amount;
      }
    }
  }

  private workSpeed(c: Colonist, type: JobType | 'cooking' | 'crafting' | 'doctor'): number {
    const s = c.skills;
    const plants = ![
      'mine',
      'cooking',
      'crafting',
      'doctor',
      'construct',
      'sculpt',
      'deconstruct',
      'research',
      'fish',
    ].includes(type);
    const skill =
      type === 'research'
        ? s.research
        : type === 'mine'
          ? s.mining
          : type === 'cooking'
            ? s.cooking
            : type === 'crafting'
              ? s.crafting
              : type === 'doctor'
                ? s.medicine
                : type === 'sculpt'
                  ? s.artistic
                  : type === 'construct' || type === 'deconstruct'
                    ? s.construction
                    : type === 'fish'
                      ? s.animals
                      : s.plants;
    const moodFactor = c.mood < 25 ? 0.85 : c.mood > 70 ? 1.1 : 1;
    const traits = traitFactor(c, 'workSpeed') * (plants ? traitFactor(c, 'plantSpeed') : 1);
    const tools = c.tool && TOOL_WORK.has(type as JobType) ? 1 + TOOL_BONUS * qualityFactor(c.tool.quality) : 1;
    const inspired = c.thoughts.some((t) => t.key === 'inspired') ? INSPIRED_SPEED : 1;
    return (
      skillFactor(skill) *
      moodFactor *
      traits *
      healthFactor(c) *
      tools *
      inspired *
      agePace(c).work *
      scarWork(c, this.isResearched('prosthetics')) *
      hoursSpeed(this.village) *
      (type === 'construct' && this.isResearched('masonry') ? MASONRY_SPEED : 1) *
      ((type === 'mine' || type === 'chop') && this.isResearched('steelmaking') ? STEEL_SPEED : 1) *
      (1 + FURTHER_STUDY_SPEED * Math.min(FURTHER_STUDY_ROUNDS, this.research.further ?? 0))
    );
  }

  private stepWork(c: Colonist, job: Job): void {
    const w = this.world;
    const t = job.target;
    if (!this.workTargetValid(job)) {
      this.endJob(c);
      return;
    }
    const standOn = standsOn(job.type);
    if (!this.isAtWorkSpot(c, t, standOn)) {
      const path = this.pathfinder.find(c.tile, this.workSpots(t, standOn, this.regionOf(c.tile)));
      if (path && path.length > 0) {
        c.path = path;
      } else {
        this.endJob(c);
      }
      return;
    }
    w.progress[t] += this.workSpeed(c, job.type);
    learn(this, c, skillFor(job.type));
    this.wearTool(c, job.type);
    w.markDirty(t);
    if (w.progress[t] >= this.workAmount(job)) {
      this.completeWork(c, job);
    }
  }

  // A tick of tool work wears the kit down; worn through, it falls apart.
  private wearTool(c: Colonist, type: JobType): void {
    if (!c.tool || !TOOL_WORK.has(type)) {
      return;
    }
    c.tool.wear -= 1 / (TICKS_PER_HOUR * TOOL_HOURS);
    if (c.tool.wear <= 0) {
      c.tool = null;
      this.addLog(`${c.name}'s tool kit has worn out.`, 'warn');
    }
  }

  // Someone who does physical work and has no tool kit fetches one from storage.
  private tryTakeTool(c: Colonist): boolean {
    const p = c.priorities;
    if (
      c.tool ||
      (p.mining <= 0 && p.construction <= 0 && p.growing <= 0 && p.plantCutting <= 0) ||
      this.resourceTotals()[TOOL_KIT - 1].total === 0
    ) {
      return false;
    }
    const w = this.world;
    const region = this.regionOf(c.tile);
    const kit = this.nearestIn(
      'items',
      c.tile,
      (i) => w.itemType[i] === TOOL_KIT && this.regions.region[i] === region && !this.itemTaken(i, c),
      1,
    )[0];
    const path = kit !== undefined ? this.pathfinder.find(c.tile, [kit]) : null;
    if (kit === undefined || !path) {
      return false;
    }
    this.reserve(c, `i${kit}`);
    this.assign(c, this.makeJob('equip', -1, { source: kit, item: TOOL_KIT }), path);
    return true;
  }

  private produce(item: number, count: number): void {
    const key = itemDef(item).key;
    this.stats.produced[key] = (this.stats.produced[key] ?? 0) + count;
  }

  private completeWork(c: Colonist, job: Job): void {
    const w = this.world;
    const t = job.target;
    switch (job.type) {
      case 'mine':
      case 'chop':
      case 'forage': {
        if (featureDef(w.feature[t]).shaft) {
          digDeeper(this, c, t);
          break;
        }
        const harvest = featureDef(w.feature[t]).harvest!;
        w.setFeature(t, NONE);
        w.designation[t] = Designation.NONE;
        w.dropItemNear(t, harvest.item, harvest.count);
        this.produce(harvest.item, harvest.count);
        if (job.type === 'mine') {
          w.addFilth(t, Filth.RUBBLE);
        }
        c.workStreak++;
        break;
      }
      case 'harvestCrop': {
        const crop = featureDef(w.feature[t]).crop!;
        w.setFeature(t, NONE);
        // Set the harvest down beside the field, not on it, so the tile can be sown again.
        const region = this.regionOf(t);
        const offField = this.nearest(
          t,
          (i) => w.zone[i] < GROW_ZONE && w.canHoldItem(i, crop.item) && this.regions.region[i] === region,
          1,
        )[0];
        // (Irrigation's quarter more, as an extra unit a quarter of the time on small harvests.)
        const more =
          (this.isResearched('irrigation') ? crop.count * IRRIGATION_YIELD : crop.count) *
          (this.isResearched('plantBreeding') ? BREEDING_YIELD : 1) *
          (this.story.difficulty === 'peaceful' ? PEACEFUL_YIELD : 1);
        const yieldCount = Math.floor(more) + (more % 1 > 0 && this.rng.next() < more % 1 ? 1 : 0);
        w.dropItemNear(offField ?? t, crop.item, yieldCount);
        this.produce(crop.item, yieldCount);
        // The stalks of a grain field, bundled into hay for the troughs.
        if (crop.straw) {
          w.dropItemNear(offField ?? t, HAY, crop.straw);
          this.produce(HAY, crop.straw);
        }
        if (this.season === 'Winter') {
          this.stats.winterHarvests = (this.stats.winterHarvests ?? 0) + 1;
        }
        c.workStreak++;
        break;
      }
      case 'sow':
        w.setFeature(t, growZoneCrop(w.zone[t]));
        break;
      case 'deconstruct': {
        const target = this.deconstructTarget(t);
        const def = featureDef(target);
        const build = def.build!;
        // The fuel still in a generator's hopper comes out with it. (A trough's feed is a mix of foods, counted
        // but not told apart, so it isn't given back.)
        const hopper = !def.layer && def.power?.fuel ? Math.floor(w.fuel[t]) : 0;
        if (def.layer) {
          w.setLayer(def.layer, t, NONE);
        } else {
          w.setFeature(t, NONE);
        }
        w.designation[t] = Designation.NONE;
        // A dismantled bridge leaves deep water behind: move whatever was on it to dry land.
        if (!w.isPassable(t)) {
          const type = w.itemType[t];
          if (type !== NONE) {
            const taken = w.pickUp(t, w.itemCount[t]);
            w.dropItemNear(t, type, taken.count, taken.fresh, taken.quality);
          }
        }
        this.rescueStranded();
        for (const cost of build.cost) {
          w.dropItemNear(t, cost.item, refund(cost.count));
        }
        if (hopper > 0) {
          w.dropItemNear(t, def.power!.fuel!.item, hopper);
        }
        if (!def.layer) {
          w.addFilth(t, Filth.RUBBLE);
        }
        break;
      }
      case 'construct':
      case 'sculpt': {
        const f = w.blueprint[t];
        w.blueprint[t] = NONE;
        w.clearDelivered(t);
        const layer = featureDef(f).layer;
        if (layer) {
          // Laid around whatever's here: nothing needs to move. A floor laid over another gives
          // back most of the old one.
          const old = w[layer][t];
          if (old !== NONE) {
            for (const cost of featureDef(old).build!.cost) {
              w.dropItemNear(t, cost.item, refund(cost.count));
            }
          }
          w.setLayer(layer, t, f);
          this.stats.built++;
          break;
        }
        // Anything lying on the tile gets pushed aside.
        const displaced = w.itemType[t] !== NONE ? w.pickUp(t, w.itemCount[t]) : null;
        w.setFeature(t, f);
        if (displaced && displaced.count > 0) {
          w.dropItemNear(t, displaced.item, displaced.count, displaced.fresh, displaced.quality);
        }
        this.pushColonistsOff(t);
        this.stats.built++;
        const def = featureDef(f);
        // A new shaft starts at the surface, marked for digging (Cancel it to stop the miners). One rebuilt
        // where a shaft stood (after a raid, say) goes back down the hole that's already there.
        if (def.shaft) {
          const shaft = (this.shafts[t] ??= { depth: 0, cavern: false });
          w.progress[t] = 0;
          // ...unless the digging had been stopped before it came down.
          if (!shaft.stopped) {
            w.designation[t] = Designation.MINE;
            w.markDirty(t);
          }
        }
        if (def.art) {
          this.finishArtwork(c, t, def.name);
          break;
        }
        if (!def.blocksRoom || def.door) {
          const name = def.name.toLowerCase();
          this.addLog(`${c.name} built ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}.`);
        }
        break;
      }
    }
    this.endJob(c);
  }

  // Anyone left in deep water or marooned on a scrap of bridge (after part of it was taken down)
  // scrambles back to the nearest dry ground.
  private rescueStranded(): void {
    const w = this.world;
    const stranded = (i: number) => !w.isPassable(i) || !w.neighbors(i).some((n) => w.isPassable(n));
    for (const body of [...this.living(), ...this.enemies, ...this.allies, ...this.animals]) {
      if (!stranded(body.tile)) {
        continue;
      }
      const safe = w.nearestPassable(body.tile);
      if (safe === undefined) {
        continue;
      }
      body.tile = safe;
      body.path = [];
      body.moveProgress = 0;
      if ('job' in body) {
        this.endJob(body);
      }
    }
  }

  // `sides`: a door just locked on whoever stood in the doorway puts them on their own side, the colony's people,
  // prisoners and livestock in and everyone else out (the first open neighbour in a fixed order put a raider
  // locked out inside the room). Otherwise (something built where they stood), the first open neighbour.
  private pushColonistsOff(t: number, sides = false): void {
    const w = this.world;
    if (w.isPassable(t)) {
      return;
    }
    // A free neighbour, or failing that (walled in on all sides) the nearest open tile.
    const open = w.neighbors(t).filter((n) => w.isPassable(n));
    const any = open[0] ?? w.nearestPassable(t);
    const inside = sides ? (open.find((n) => this.isIndoors(n)) ?? any) : any;
    const outside = sides ? (open.find((n) => !this.isIndoors(n)) ?? any) : any;
    for (const other of this.living()) {
      if (other.tile === t) {
        if (inside !== undefined) {
          other.tile = inside;
        }
        this.endJob(other);
      }
    }
    for (const p of this.captives) {
      if (p.tile === t && inside !== undefined) {
        p.tile = inside;
      }
    }
    // (An envoy, waiting or on the way home, too: one shut in a locked door stayed there until answered.)
    const theirs = [
      ...this.enemies,
      ...this.allies,
      ...this.animals,
      ...(this.caravan?.visitors ?? []),
      ...(this.diplomacy.envoy?.visitor ? [this.diplomacy.envoy.visitor] : []),
      ...(this.diplomacy.departing ?? []),
    ];
    for (const e of theirs) {
      const to = 'tame' in e && e.tame ? inside : outside;
      if (e.tile === t && to !== undefined) {
        e.tile = to;
        e.path = [];
        e.moveProgress = 0;
      }
    }
  }

  // ---- Construction deliveries ----

  // Brings materials to a blueprint (only to sculptures, for an artist fetching their own).
  private tryDeliver(c: Colonist, artOnly = false): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    // Only consider blueprints whose missing materials actually exist, so a cluster of blueprints
    // waiting on something unavailable can't hide others that could be supplied.
    const available = this.availableItems(c, region);
    const blueprints = this.nearestIn(
      'blueprints',
      c.tile,
      (i) =>
        w.blueprint[i] !== NONE &&
        (!artOnly || featureDef(w.blueprint[i]).art) &&
        w.blueprintNeeds(i).some((need) => available.has(need.item)) &&
        !this.isReserved(`d${i}`, c) &&
        this.hasWorkSpot(i, false, region),
      6,
      this.enclosureFirst,
    );
    const sourceCache = new Map<number, number | undefined>();
    for (const bp of blueprints) {
      for (const need of w.blueprintNeeds(bp)) {
        if (!sourceCache.has(need.item)) {
          sourceCache.set(
            need.item,
            this.nearestIn(
              'items',
              c.tile,
              (i) => w.itemType[i] === need.item && !this.itemTaken(i, c) && this.regions.region[i] === region,
              1,
            )[0],
          );
        }
        const source = sourceCache.get(need.item);
        if (source === undefined) {
          continue;
        }
        const path = this.pathfinder.find(c.tile, [source]);
        if (!path) {
          continue;
        }
        this.reserve(c, `d${bp}`);
        this.reserve(c, `i${source}`);
        this.assign(c, this.makeJob('deliver', bp, { source, item: need.item, line: need.line }), path);
        return true;
      }
    }
    return false;
  }

  private tryDeliverCarried(c: Colonist): boolean {
    const w = this.world;
    const item = c.carrying!.item;
    const region = this.regionOf(c.tile);
    const needLine = (i: number) => w.blueprintNeeds(i).find((need) => need.item === item);
    const blueprints = this.nearestIn(
      'blueprints',
      c.tile,
      (i) =>
        w.blueprint[i] !== NONE && !!needLine(i) && !this.isReserved(`d${i}`, c) && this.hasWorkSpot(i, false, region),
    );
    for (const bp of blueprints) {
      const path = this.pathfinder.find(c.tile, this.workSpots(bp, false, region));
      if (path) {
        this.reserve(c, `d${bp}`);
        this.assign(c, this.makeJob('deliver', bp, { item, line: needLine(bp)!.line, stage: 1 }), path);
        return true;
      }
    }
    return false;
  }

  private lineNeed(bp: number, line: number): number {
    return this.world.blueprintNeeds(bp).find((need) => need.line === line)?.count ?? 0;
  }

  private stepDeliver(c: Colonist, job: Job): void {
    const w = this.world;
    if (job.stage === 0) {
      if (c.tile !== job.source || w.itemType[job.source] !== job.item || c.carrying) {
        this.endJob(c);
        return;
      }
      const taken = w.takeItem(job.source, Math.min(this.lineNeed(job.target, job.line), itemDef(job.item).stackLimit));
      this.release(c, `i${job.source}`);
      if (taken <= 0) {
        this.endJob(c);
        return;
      }
      c.carrying = { item: job.item, count: taken };
      job.stage = 1;
      const path = this.pathfinder.find(c.tile, this.workSpots(job.target, false, this.regionOf(c.tile)));
      if (!path) {
        this.endJob(c);
        return;
      }
      c.path = path;
      return;
    }

    const bp = w.blueprint[job.target];
    const need = this.lineNeed(job.target, job.line);
    if (!c.carrying || need <= 0 || bp === NONE || featureDef(bp).build!.cost[job.line].item !== c.carrying.item) {
      this.endJob(c);
      return;
    }
    if (!this.isAtWorkSpot(c, job.target, false)) {
      this.endJob(c);
      return;
    }
    const given = Math.min(need, c.carrying.count);
    w.addDelivered(job.target, job.line, given);
    c.carrying.count -= given;
    if (c.carrying.count <= 0) {
      c.carrying = null;
    }
    this.endJob(c);
  }

  // ---- Hauling ----

  // Every stockpile tile and running-or-not icebox: zones plus buildings, without double counting.
  // Every tile that stores items (stockpile zones and iceboxes). Hauling asks for this constantly,
  // so it's kept until a zone or a building changes.
  // Every stockpile tile and storage building (cached until buildings or zones change).
  public storageTiles(): number[] {
    const w = this.world;
    // (Only storage buildings and zones change it, not every tree felled or rock mined.)
    const key = `${w.storageVersion}/${this.zoneVersion}`;
    if (key === this.storageKey) {
      return this.storageCache;
    }
    const zones = w.tilesWith('zones');
    const tiles = [...zones].filter((i) => this.isStockpile(i));
    for (const i of w.tilesWith('features')) {
      if (!zones.has(i) && this.isStockpile(i)) {
        tiles.push(i);
      }
    }
    this.storageKey = key;
    this.storageCache = tiles;
    return tiles;
  }

  // Everything built (crops included): what most searches for a bench, bed or table want, without
  // wading through every tree and rock on the map. Kept until a building changes.
  public buildingTiles(): readonly number[] {
    const w = this.world;
    if (this.buildingVersion !== w.builtVersion) {
      this.buildingVersion = w.builtVersion;
      this.buildingCache = [...w.tilesWith('features')].filter((i) => !featureDef(w.feature[i]).natural);
    }
    return this.buildingCache;
  }

  private buildingVersion = -1;
  private buildingCache: readonly number[] = [];
  private storageKey = '';
  private storageCache: number[] = [];
  // Bumped whenever zones change.
  private zoneVersion = 0;

  public isStockpile(i: number): boolean {
    const zone = this.world.zone[i];
    return (zone !== 0 && zone < GROW_ZONE) || this.isIcebox(i) || this.isShelf(i) || this.isDryingRack(i);
  }

  // Whether storage on this tile takes this item (its stockpile's settings allow it).
  public storesItem(i: number, item: number): boolean {
    return this.isStockpile(i) && zoneAccepts(this.world.zone[i], item);
  }

  // How good a home this tile is for an item: its stockpile's priority, and a little more for food that
  // rots when it's cold storage. Items only ever move to somewhere strictly better, so nothing shuttles.
  public storeValue(i: number, item: number): number {
    if (!this.storesItem(i, item)) {
      return 0;
    }
    // A drying rack takes only what dries, and nothing beats putting it there.
    if (this.isDryingRack(i)) {
      return driedFrom(item) !== undefined ? MAX_STORE_VALUE : 0;
    }
    const zone = this.world.zone[i];
    const rank = isStockpileZone(zone) ? priorityRank(zone) : 2;
    return rank * 2 + (itemDef(item).shelfLife !== undefined && this.isColdStore(i) ? 1 : 0);
  }

  // The best place to put an item: the highest-value storage that takes it, nearest first. Only
  // places better than `above` count (an item already stored moves only to somewhere better).
  private stockpileSpot(
    item: number,
    near: number,
    region: number,
    c: Colonist,
    coldOnly = false,
    above = 0,
  ): number | undefined {
    const w = this.world;
    return this.nearestIn(
      'storage',
      near,
      (i) =>
        (!coldOnly || this.isColdStore(i)) &&
        this.storeValue(i, item) > above &&
        this.regions.region[i] === region &&
        w.canHoldItem(i, item) &&
        !this.isReserved(`s${i}`, c),
      1,
      // Better storage first, then topping up existing stacks of the same item.
      (i) => (MAX_STORE_VALUE - this.storeValue(i, item)) * 1000 + (w.itemType[i] === item ? 0 : 3),
    )[0];
  }

  // Moves perishable food from ordinary stockpiles into cold storage (running iceboxes or a
  // freezing room) with room.
  private tryChill(c: Colonist, region: number): boolean {
    const w = this.world;
    if (this.coldStores === 0) {
      return false;
    }
    const sources = this.nearestIn(
      'items',
      c.tile,
      (i) =>
        w.itemType[i] !== NONE &&
        itemDef(w.itemType[i]).shelfLife !== undefined &&
        this.isStockpile(i) &&
        !this.isColdStore(i) &&
        this.regions.region[i] === region &&
        !this.itemTaken(i, c),
      3,
    );
    for (const source of sources) {
      const item = w.itemType[source];
      const dest = this.stockpileSpot(item, source, region, c, true, this.storeValue(source, item));
      const path = dest !== undefined ? this.pathfinder.find(c.tile, [source]) : null;
      if (dest === undefined || !path) {
        continue;
      }
      this.reserve(c, `i${source}`);
      this.reserve(c, `s${dest}`);
      // Only carry what fits, so the rest isn't hauled straight back.
      const room = w.capacity(dest, item) - (w.itemType[dest] === item ? w.itemCount[dest] : 0);
      this.assign(c, this.makeJob('haul', dest, { source, item, stage: 0, count: room }), path);
      return true;
    }
    return false;
  }

  // Keeps fuelled generators and fires topped up.
  // Wood the colony's fires burn in a day (kilns and smelters only burn while worked, so they don't count).
  public firewoodPerDay(): number {
    this.refreshGrid();
    const w = this.world;
    return this.fireTiles.reduce((sum, i) => {
      const def = featureDef(w.feature[i]);
      return sum + (def.burns && !def.workbench && def.burns.item === WOOD ? def.burns.perDay : 0);
    }, 0);
  }

  // Cold out and wood short: what's left is kept for the fires, not burned in generators.
  public woodForFiresOnly(): boolean {
    return (
      this.outdoorTemperature() < COLD_FOR_FIRES &&
      this.stockOf(WOOD) < Math.max(20, this.firewoodPerDay() * FIREWOOD_RESERVE_DAYS)
    );
  }

  private generatorRunningLow(): boolean {
    const w = this.world;
    this.refreshGrid();
    return [...this.powerTiles, ...this.fireTiles].some((i) => {
      const fuel = w.feature[i] !== NONE ? fuelOf(featureDef(w.feature[i])) : undefined;
      return !!fuel && w.fuel[i] < fuel.capacity * 0.2;
    });
  }

  private tryRefuel(c: Colonist, urgentOnly = false): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const keepWood = this.woodForFiresOnly();
    const fuelAt = (i: number) => (w.feature[i] !== NONE ? fuelOf(featureDef(w.feature[i])) : undefined);
    // Only somewhere whose fuel is to be had: an empty trough with no potatoes about mustn't keep the hauler
    // from the fires. (Looked up once per kind of fuel.)
    const onHand = new Map<number, boolean>();
    // (A trough takes more than one kind of feed.)
    const takes = (fuel: { item: number; also?: number[] }, item: number) =>
      item === fuel.item || !!fuel.also?.includes(item);
    const find = (test: (item: number) => boolean) =>
      this.nearestIn(
        'items',
        c.tile,
        (i) => test(w.itemType[i]) && this.regions.region[i] === region && !this.itemTaken(i, c),
        1,
      )[0];
    // A trough gets hay first, so the animals don't eat what people could; while the colony's own food is
    // short, hay or nothing (people eat before the animals do).
    const foodShort = foodDays(this) < TROUGH_FOOD_DAYS;
    const sourceFor = (fuel: { item: number; also?: number[] }) => {
      if (!takes(fuel, HAY)) {
        return find((item) => takes(fuel, item));
      }
      return find((item) => item === HAY) ?? (foodShort ? undefined : find((item) => takes(fuel, item)));
    };
    const toHand = (fuel: { item: number; also?: number[] }) => {
      if (!onHand.has(fuel.item)) {
        onHand.set(fuel.item, sourceFor(fuel) !== undefined);
      }
      return onHand.get(fuel.item)!;
    };
    const generator = this.nearestIn(
      'buildings',
      c.tile,
      (i) => {
        const fuel = fuelAt(i);
        return (
          !!fuel &&
          // In the cold, the fires come first: a generator only gets wood they can spare.
          !(featureDef(w.feature[i]).power && fuel.item === WOOD && keepWood) &&
          w.fuel[i] < fuel.capacity * (urgentOnly ? 0.2 : 0.5) &&
          !this.isReserved(`f${i}`, c) &&
          this.hasWorkSpot(i, false, region) &&
          toHand(fuel)
        );
      },
      1,
    )[0];
    if (generator === undefined) {
      return false;
    }
    const fuel = fuelAt(generator)!;
    const source = sourceFor(fuel);
    const path = source !== undefined ? this.pathfinder.find(c.tile, [source]) : null;
    if (source === undefined || !path) {
      return false;
    }
    this.reserve(c, `f${generator}`);
    this.reserve(c, `i${source}`);
    this.assign(c, this.makeJob('refuel', generator, { source, item: w.itemType[source] }), path);
    return true;
  }

  private stepRefuel(c: Colonist, job: Job): void {
    const w = this.world;
    const fuel = w.feature[job.target] !== NONE ? fuelOf(featureDef(w.feature[job.target])) : undefined;
    if (!fuel) {
      this.endJob(c);
      return;
    }
    if (job.stage === 0) {
      if (c.tile !== job.source || w.itemType[job.source] !== job.item || c.carrying) {
        this.endJob(c);
        return;
      }
      const wanted = Math.ceil(fuel.capacity - w.fuel[job.target]);
      c.carrying = { item: job.item, count: w.takeItem(job.source, wanted) };
      this.release(c, `i${job.source}`);
      job.stage = 1;
      const path = this.pathfinder.find(c.tile, this.workSpots(job.target, false, this.regionOf(c.tile)));
      if (!path) {
        this.endJob(c);
        return;
      }
      c.path = path;
      return;
    }
    if (c.carrying && c.carrying.item === job.item && this.isAtWorkSpot(c, job.target, false)) {
      // A cold fire lit again warms its room.
      if (w.fuel[job.target] <= 0) {
        this.fuelVersion++;
      }
      const added = Math.min(c.carrying.count, Math.ceil(fuel.capacity - w.fuel[job.target]));
      w.fuel[job.target] = Math.min(fuel.capacity, w.fuel[job.target] + added);
      c.carrying.count -= added;
      if (c.carrying.count <= 0) {
        c.carrying = null;
      }
    }
    this.endJob(c);
  }

  // Item types lying unreserved somewhere in `region`.
  private availableItems(c: Colonist, region: number): Set<number> {
    const w = this.world;
    const items = new Set<number>();
    for (const i of w.tilesWith('items')) {
      if (w.itemType[i] !== NONE && this.regions.region[i] === region && !this.itemTaken(i, c)) {
        items.add(w.itemType[i]);
      }
    }
    return items;
  }

  private tryHaul(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    // Item types lying loose that have somewhere to go, so a full stockpile for one item doesn't
    // block the rest. One pass finds the loose types; only those get a (full-map) space check.
    // Loose items, and stored ones that could be somewhere better (a stockpile that no longer takes
    // them, or a higher priority one): the value of where each sits now.
    const storage = this.storageTiles();
    if (storage.length === 0) {
      return false;
    }
    const best = new Map<number, number>();
    const bestFor = (item: number) => {
      let v = best.get(item);
      if (v === undefined) {
        v = 0;
        for (const i of storage) {
          if (this.regions.region[i] === region && w.canHoldItem(i, item)) {
            v = Math.max(v, this.storeValue(i, item));
          }
        }
        best.set(item, v);
      }
      return v;
    };
    const misplaced = (i: number) => this.storeValue(i, w.itemType[i]) < bestFor(w.itemType[i]);
    const sources = this.nearestIn(
      'items',
      c.tile,
      (i) => this.regions.region[i] === region && !this.itemTaken(i, c) && misplaced(i),
      4,
    );
    for (const source of sources) {
      const item = w.itemType[source];
      const dest = this.stockpileSpot(item, source, region, c, false, this.storeValue(source, item));
      if (dest === undefined) {
        continue;
      }
      const path = this.pathfinder.find(c.tile, [source]);
      if (!path) {
        continue;
      }
      this.reserve(c, `i${source}`);
      this.reserve(c, `s${dest}`);
      this.assign(c, this.makeJob('haul', dest, { source, item, stage: 0 }), path);
      return true;
    }
    return false;
  }

  // Puts away whatever the colonist is holding: a blueprint that needs it, a stockpile, or the floor.
  private tryStash(c: Colonist): boolean {
    // Half-gathered recipe ingredients: set them down for the haulers (a stockpile would take a
    // mixed bundle as all one kind).
    if (c.carrying?.extra?.length || c.carrying?.mix) {
      this.dropCarried(c);
      return false;
    }
    if (this.tryDeliverCarried(c)) {
      return true;
    }
    const carried = c.carrying!;
    const region = this.regionOf(c.tile);
    const dest = this.stockpileSpot(carried.item, c.tile, region, c);
    if (dest !== undefined) {
      const path = this.pathfinder.find(c.tile, [dest]);
      if (path) {
        this.reserve(c, `s${dest}`);
        this.assign(c, this.makeJob('haul', dest, { item: carried.item, stage: 1 }), path);
        return true;
      }
    }
    this.dropCarried(c);
    return false;
  }

  public dropCarried(c: Colonist): void {
    if (c.carrying) {
      for (const bundle of [c.carrying, ...(c.carrying.extra ?? [])]) {
        for (const part of bundle.mix ?? [bundle]) {
          this.world.dropItemNear(c.tile, part.item, part.count, part.fresh, part.quality);
        }
      }
      c.carrying = null;
    }
  }

  // The ingredient bundles a crafter is carrying, in recipe order.
  private bundles(c: Colonist): Carried[] {
    return c.carrying ? [c.carrying, ...(c.carrying.extra ?? [])] : [];
  }

  private setBundles(c: Colonist, bundles: Carried[]): void {
    const [first, ...rest] = bundles.map((b) => ({ ...b, extra: undefined }));
    c.carrying = first ? { ...first, extra: rest.length > 0 ? rest : undefined } : null;
  }

  private stepHaul(c: Colonist, job: Job): void {
    const w = this.world;
    if (job.stage === 0) {
      if (c.tile !== job.source || w.itemType[job.source] !== job.item || c.carrying) {
        this.endJob(c);
        return;
      }
      c.carrying = w.pickUp(job.source, job.count > 0 ? job.count : itemDef(job.item).stackLimit);
      this.release(c, `i${job.source}`);
      job.stage = 1;
      const path = this.pathfinder.find(c.tile, [job.target]);
      if (!path) {
        this.endJob(c);
        return;
      }
      c.path = path;
      return;
    }

    if (!c.carrying || c.tile !== job.target || !this.isStockpile(job.target)) {
      this.endJob(c);
      return;
    }
    const before = c.carrying.count;
    const leftover = w.addItem(job.target, c.carrying.item, before, c.carrying.fresh, c.carrying.quality);
    this.stats.hauled += before - leftover;
    c.workStreak = 0;
    c.carrying.count = leftover;
    if (leftover <= 0) {
      c.carrying = null;
    }
    this.endJob(c);
  }

  // ---- Production bills ----

  private tryBill(c: Colonist, bench: BenchType): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    // Counted once for every recipe below (a full pass over the map's items).
    let totals: ReturnType<Simulation['resourceTotals']> | undefined;
    // The nearest free bench of this kind is the same for every recipe; found on first need.
    let station: number | undefined | null = null;
    for (const recipe of RECIPES) {
      if (
        recipe.bench !== bench ||
        !this.isResearched(recipe.research) ||
        c.skills[benchSkill(bench)] < recipe.minSkill
      ) {
        continue;
      }
      // Mending runs while it's switched on; everything else until the stock reaches the target.
      if (recipe.mend) {
        if (this.bills[recipe.id].target <= 0) {
          continue;
        }
      } else {
        totals ??= this.resourceTotals();
        if (totals[recipe.product.item - 1].total >= this.bills[recipe.id].target) {
          continue;
        }
      }
      if (station === null) {
        station = this.nearestIn(
          'buildings',
          c.tile,
          (i) =>
            w.feature[i] !== NONE &&
            featureDef(w.feature[i]).workbench === bench &&
            // A kiln or smelter needs wood in it.
            (!featureDef(w.feature[i]).burns || w.fuel[i] > 0) &&
            !this.isReserved(`w${i}`, c) &&
            this.hasWorkSpot(i, false, region),
          1,
        )[0];
      }
      if (station === undefined) {
        return false;
      }
      // Every ingredient must be on hand (possibly spread over several small stacks) before
      // starting; the crafter gathers them in order.
      const source = this.ingredientSource(c, recipe.ingredients[0], region);
      if (
        source === undefined ||
        !recipe.ingredients.slice(1).every((ing) => this.ingredientSource(c, ing, region) !== undefined)
      ) {
        continue;
      }
      const path = this.pathfinder.find(c.tile, [source]);
      if (!path) {
        continue;
      }
      this.reserve(c, `w${station}`);
      this.reserve(c, `i${source}`);
      this.dropCarried(c);
      this.assign(
        c,
        this.makeJob('craft', station, { source, item: w.itemType[source], line: recipe.id, count: 0 }),
        path,
      );
      return true;
    }
    return false;
  }

  // Where to start gathering `ing`, if there's enough of it about in total (any mix of matching
  // stacks: five berries and five potatoes make a meal). Food that will spoil soonest goes first.
  private ingredientSource(c: Colonist, ing: Ingredient, region: number): number | undefined {
    const w = this.world;
    const usable = (i: number) => this.ingredientUsable(c, ing, region, i);
    // Building comes first: materials that blueprints are waiting for aren't crafted away.
    let available = ing.item !== undefined ? -this.blueprintDemand(ing.item, region) : 0;
    for (const i of w.tilesWith('items')) {
      if (usable(i)) {
        available += w.itemCount[i];
      }
    }
    if (available < ing.count) {
      return undefined;
    }
    return this.nearestIn('items', c.tile, usable, 1, (i) => this.stalenessBias(i))[0];
  }

  // How much of an item the blueprints builders here can get at still need delivered.
  private blueprintDemand(item: number, region: number): number {
    const w = this.world;
    let need = 0;
    for (const i of w.tilesWith('blueprints')) {
      const cost = featureDef(w.blueprint[i]).build!.cost;
      if (!cost.some((c) => c.item === item) || !this.hasWorkSpot(i, false, region)) {
        continue;
      }
      cost.forEach((cost, line) => {
        if (cost.item === item) {
          need += Math.max(0, cost.count - w.deliveredAt(i, line));
        }
      });
    }
    return need;
  }

  private ingredientUsable(c: Colonist, ing: Ingredient, region: number, i: number): boolean {
    const w = this.world;
    return (
      w.itemType[i] !== NONE &&
      matchesIngredient(w.itemType[i], ing) &&
      (!ing.worn || w.fresh[i] < MENDABLE) &&
      this.regions.region[i] === region &&
      !this.itemTaken(i, c)
    );
  }

  // Perishables about to turn count as nearer, so they're used before they rot.
  private stalenessBias(i: number): number {
    const def = itemDef(this.world.itemType[i]);
    return def.shelfLife !== undefined ? Math.min(def.shelfLife, this.world.fresh[i]) * 2 : 0;
  }

  private stepCraft(c: Colonist, job: Job): void {
    const w = this.world;
    const recipe = RECIPES[job.line];
    const stationOk = w.feature[job.target] !== NONE && featureDef(w.feature[job.target]).workbench === recipe.bench;
    if (job.stage === 0) {
      const ing = recipe.ingredients[job.count];
      const bundles = this.bundles(c);
      const held = bundles[job.count];
      if (
        c.tile !== job.source ||
        w.itemType[job.source] !== job.item ||
        !matchesIngredient(job.item, ing) ||
        bundles.length < job.count ||
        !stationOk
      ) {
        this.endJob(c);
        return;
      }
      const taken = w.pickUp(job.source, Math.max(0, ing.count - (held?.count ?? 0)));
      this.release(c, `i${job.source}`);
      if (held) {
        // Freshness and quality average over everything gathered.
        const total = held.count + taken.count;
        const mix = (a = 0, b = 0) => (a * held.count + b * taken.count) / total;
        const parts =
          held.item === taken.item && !held.mix ? undefined : [...(held.mix ?? [{ ...held, mix: undefined }]), taken];
        bundles[job.count] = {
          item: held.item,
          count: total,
          fresh: held.fresh === undefined ? undefined : mix(held.fresh, taken.fresh),
          quality: mix(held.quality, taken.quality),
          mix: parts,
        };
      } else {
        bundles[job.count] = taken;
      }
      this.setBundles(c, bundles);
      const region = this.regionOf(c.tile);
      let next: number | undefined;
      if (bundles[job.count].count < ing.count) {
        // Not enough here: on to the next stack of the same thing.
        // Not enough here: on to the next stack that will do (it may be a different kind of food;
        // the bundle keeps the first kind's name and averages the rest in).
        next = this.nearestIn(
          'items',
          c.tile,
          (i) => this.ingredientUsable(c, ing, region, i),
          1,
          (i) => this.stalenessBias(i),
        )[0];
      } else if (job.count + 1 < recipe.ingredients.length) {
        // This ingredient's done: start on the next one.
        job.count++;
        next = this.ingredientSource(c, recipe.ingredients[job.count], region);
      }
      if (next !== undefined) {
        const path = this.pathfinder.find(c.tile, [next]);
        if (!path) {
          this.endJob(c);
          return;
        }
        this.reserve(c, `i${next}`);
        job.source = next;
        job.item = w.itemType[next];
        c.path = path;
        return;
      }
      if (bundles.length < recipe.ingredients.length || bundles[job.count].count < ing.count) {
        // Something ran out while gathering.
        this.endJob(c);
        return;
      }
      job.stage = 1;
      const path = this.pathfinder.find(c.tile, this.workSpots(job.target, false, this.regionOf(c.tile)));
      if (!path) {
        this.endJob(c);
        return;
      }
      c.path = path;
      return;
    }

    if (!stationOk || !c.carrying || !this.isAtWorkSpot(c, job.target, false)) {
      this.endJob(c);
      return;
    }
    const bench = benchSkill(recipe.bench);
    // A kiln or smelter burns wood while it's worked, and work stops when the fire's out.
    const burns = featureDef(w.feature[job.target]).burns;
    if (burns) {
      if (w.fuel[job.target] <= 0) {
        this.endJob(c);
        return;
      }
      w.fuel[job.target] = Math.max(0, w.fuel[job.target] - burns.perDay / 24 / TICKS_PER_HOUR);
    }
    job.progress += this.workSpeed(c, bench);
    learn(this, c, bench);
    if (job.progress >= recipe.work) {
      const used = this.bundles(c);
      c.carrying = null;
      if (recipe.mend) {
        // The same garment back, as good as new (its quality doesn't change).
        const garment = used[0];
        w.dropItemNear(c.tile, garment.item, 1, 1, garment.quality);
        this.addLog(`${c.name} mended a ${itemDef(garment.item).name.toLowerCase()}.`);
        this.endJob(c);
        return;
      }
      const product = recipe.product.item;
      // Cooking buys perishable food time, but not much from ingredients already on the turn.
      const shelfLife = itemDef(product).shelfLife;
      const perishable = used.filter((b) => b.fresh !== undefined);
      const weight = perishable.reduce((sum, b) => sum + b.count, 0);
      const fresh =
        shelfLife !== undefined && weight > 0
          ? Math.min(shelfLife, Math.max(1, (2 * perishable.reduce((sum, b) => sum + b.fresh! * b.count, 0)) / weight))
          : undefined;
      // Meals carry the cook's skill (which decides how safe they are); clothes and bows get a
      // quality roll.
      const skill = bench === 'cooking' ? c.skills.cooking : c.skills.crafting;
      const made = itemDef(product);
      const rolled = !!made.apparel || !!made.weapon || !!made.armor || product === TOOL_KIT;
      // A meal cooked amid mess comes out worse, and so less safe to eat.
      const taint = bench === 'cooking' ? Math.min(MAX_KITCHEN_TAINT, this.messAround(job.target)) : 0;
      // (Precision tools: about two points of quality, half a grade.)
      const tools = this.isResearched('precisionTools') ? 2 : 0;
      const quality = rolled
        ? Math.max(0, Math.min(20, skill + tools + this.rng.int(-2, 2)))
        : Math.max(0, skill - taint);
      w.dropItemNear(c.tile, product, recipe.product.count, fresh, quality);
      this.produce(product, recipe.product.count);
      if (rolled) {
        this.stats.bestCraft = Math.max(this.stats.bestCraft ?? 0, quality);
      }
      if (rolled) {
        this.addLog(`${c.name} made a ${qualityLabel(quality).toLowerCase()} ${itemDef(product).name.toLowerCase()}.`);
      }
      this.endJob(c);
    }
  }

  // ---- Eating ----

  private tryEat(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const source = this.nearestIn(
      'items',
      c.tile,
      (i) =>
        w.itemType[i] !== NONE && isFood(w.itemType[i]) && this.regions.region[i] === region && !this.itemTaken(i, c),
      1,
      // Walk a bit further for a cooked meal.
      (i) => (itemDef(w.itemType[i]).category === 'meal' ? 0 : 10),
    )[0];
    if (source === undefined) {
      return false;
    }
    const path = this.pathfinder.find(c.tile, [source]);
    if (!path) {
      return false;
    }
    this.endJob(c);
    this.dropCarried(c);
    this.reserve(c, `i${source}`);
    this.assign(c, this.makeJob('eat', -1, { source, item: w.itemType[source] }), path);
    return true;
  }

  private stepEat(c: Colonist, job: Job): void {
    const w = this.world;
    if (job.stage === 0) {
      if (c.tile !== job.source || w.itemType[job.source] !== job.item) {
        this.endJob(c);
        return;
      }
      const def = itemDef(job.item);
      const wanted = def.category === 'meal' ? 1 : Math.max(1, Math.ceil((1 - c.needs.food) / def.nutrition));
      c.carrying = w.pickUp(job.source, wanted);
      this.release(c, `i${job.source}`);
      this.headToTable(c, job);
      return;
    }

    if (++job.progress < EAT_TICKS) {
      return;
    }
    if (c.carrying) {
      const def = itemDef(c.carrying.item);
      c.needs.food = Math.min(1, c.needs.food + def.nutrition * c.carrying.count);
      this.maybePoison(c, c.carrying.item, c.carrying.quality ?? NORMAL_QUALITY);
      if (c.carrying.fresh !== undefined && c.carrying.fresh < 1) {
        this.addThought(c, 'ateSpoiled');
      }
      if (def.fine) {
        this.addThought(c, 'ateFineMeal');
      } else if (def.category === 'meal') {
        this.addThought(c, 'ateMeal');
      } else if (def.rawPenalty && !traitValue(c, 'ignoresRawFood')) {
        this.addThought(c, 'ateRaw');
      }
      c.carrying = null;
    }
    const atTable = job.target >= 0 && this.isAtWorkSpot(c, job.target, false);
    if (!atTable) {
      this.addThought(c, 'ateWithoutTable');
    } else if ((this.roomAt(c.tile)?.impressiveness ?? 0) >= NICE_ROOM) {
      this.addThought(c, 'niceDining');
    }
    this.endJob(c);
    // A small stack of raw food may not be enough: still hungry, they go for another bite.
    if (c.needs.food < STILL_HUNGRY) {
      this.tryEat(c);
    }
  }

  // Food in hand: off to the nearest table to eat it (or eaten where they stand, with no table near).
  private headToTable(c: Colonist, job: Job): void {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const table = this.nearestIn(
      'buildings',
      c.tile,
      (i) => w.feature[i] !== NONE && featureDef(w.feature[i]).table && this.hasWorkSpot(i, false, region),
      1,
    )[0];
    const path =
      table !== undefined && w.distance(c.tile, table) < 30
        ? this.pathfinder.find(c.tile, this.workSpots(table, false, region))
        : null;
    job.target = path ? table : -1;
    job.stage = 2;
    c.path = path ?? [];
  }

  // Jobs aren't saved: whether a colonist loaded holding food was eating it. They're hungry, and hold no more
  // than they'd have taken for a meal (a hauler with a stack of berries, or someone fed and carrying a meal
  // to a patient, wasn't).
  private eatingWhenSaved(c: Colonist): boolean {
    const held = c.carrying;
    if (!held || !isFood(held.item) || c.drafted || c.needs.food >= Math.max(rationsEatBelow(this.village), 0.15)) {
      return false;
    }
    const def = itemDef(held.item);
    const wanted = def.category === 'meal' ? 1 : Math.max(1, Math.ceil((1 - c.needs.food) / def.nutrition));
    return held.count <= wanted;
  }

  // A badly cooked meal, raw meat or fish can make someone sick for a while. Skilled cooks rarely
  // poison anyone.
  private maybePoison(c: Colonist, item: number, quality: number): void {
    const def = itemDef(item);
    // Even a novice cook's meal is about as safe as raw berries; raw meat is the real gamble.
    const chance = def.category === 'meal' ? Math.max(0.003, 0.02 - quality * 0.0015) : def.rawPenalty ? 0.04 : 0.01;
    if (c.health.poisoned > 0 || !this.rng.chance(chance)) {
      return;
    }
    c.health.poisoned = POISONING_HOURS;
    this.addLog(`${c.name} has food poisoning.`, 'warn');
  }

  // ---- Recreation ----

  // Picks the most rewarding recreation in reach: each option is worth what the colonist would get out
  // of it (less for a kind they've had a lot of lately, much less for a game with nobody to play), less
  // a little for the walk there. A walk is always an option.
  private tryJoy(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    // A concert under way is the best night out there is.
    if (this.tryAttendConcert(c, region)) {
      return true;
    }
    let best: { spot: number; seat: number; path: number[] } | undefined;
    let bestScore = -Infinity;
    const options = this.nearestIn(
      'buildings',
      c.tile,
      (i) => w.feature[i] !== NONE && !!featureDef(w.feature[i]).joy && this.joyOpen(i, c, region),
      6,
    );
    for (const spot of options) {
      const joy = featureDef(w.feature[spot]).joy!;
      const seat = this.freeSeat(spot, joy.seats, c);
      if (seat < 0) {
        continue;
      }
      // Joining someone already at a game beats starting one; starting one is worth it when someone
      // else is free to come and play; with nobody about, it's a poor game alone.
      const company = !joy.company
        ? 1
        : this.playersAt(spot, c).length > 0
          ? 1.1
          : this.someoneFreeToPlay(c, region)
            ? 0.9
            : COMPANY_ALONE;
      const score =
        (this.joyEfficiency(c, joy.kind) * company) / joy.hoursToFull - w.distance(c.tile, spot) * JOY_DISTANCE_COST;
      if (score <= bestScore) {
        continue;
      }
      const path = this.pathfinder.find(c.tile, joy.beside ? this.workSpots(spot, false, region) : [spot]);
      if (path) {
        best = { spot, seat, path };
        bestScore = score;
      }
    }
    const walkScore = this.joyEfficiency(c, 'outdoor') / WALK_HOURS_TO_FULL;
    if (best && bestScore >= walkScore) {
      this.reserve(c, `j${best.spot}.${best.seat}`);
      this.assign(c, this.makeJob('joy', best.spot, { wait: TICKS_PER_HOUR * 2 }), best.path);
      return true;
    }
    // Go for a walk, outdoors if possible.
    const x = w.xOf(c.tile);
    const y = w.yOf(c.tile);
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = x + this.rng.int(-10, 10);
      const ty = y + this.rng.int(-10, 10);
      if (
        !w.inBounds(tx, ty) ||
        this.regions.region[w.idx(tx, ty)] !== region ||
        !this.bearable(c, w.idx(tx, ty), JOY_CHILL)
      ) {
        continue;
      }
      const path = this.pathfinder.find(c.tile, [w.idx(tx, ty)]);
      if (path && path.length > 4) {
        this.assign(c, this.makeJob('joy', -1), path);
        return true;
      }
    }
    return false;
  }

  // Whether a joy building can be used right now: reachable, a telescope only on a clear night under
  // the open sky, and not a table a rival is already sitting at.
  private joyOpen(spot: number, c: Colonist, region: number): boolean {
    const joy = featureDef(this.world.feature[spot]).joy!;
    if (!this.hasWorkSpot(spot, !joy.beside, region) || !this.bearable(c, spot, JOY_CHILL)) {
      return false;
    }
    if (joy.stargazing && !this.starsOut(spot)) {
      return false;
    }
    return !this.playersAt(spot, c).some((o) => relationLabel(c, o) === 'Rival');
  }

  // Whether a spot is within what a colonist's clothes can take: nobody goes out to tidy up into cold
  // or heat that hurts. For fun, or idling, they'll put up with a bit of a chill (`margin` degrees).
  private bearable(c: Colonist, i: number, margin = 0): boolean {
    const { min, max } = comfortRange(c);
    const t = this.temperatureAt(i);
    return t >= min - margin && t <= max + margin;
  }

  private starsOut(spot: number): boolean {
    return this.isNight() && !this.weatherIsOvercast() && !this.isRoofed(spot);
  }

  private freeSeat(spot: number, seats: number, c: Colonist): number {
    for (let seat = 0; seat < seats; seat++) {
      if (!this.isReserved(`j${spot}.${seat}`, c)) {
        return seat;
      }
    }
    return -1;
  }

  // Whether a memorial stone stands (cached until buildings change).
  private hasMemorial(): boolean {
    if (this.memorialVersion !== this.world.featureVersion) {
      this.memorialVersion = this.world.featureVersion;
      const memorial = featureId('memorial');
      this.memorialStands = this.countBuilt((f) => f === memorial) > 0;
    }
    return this.memorialStands;
  }
  private memorialVersion = -1;
  private memorialStands = false;

  // Whether the colony has built anything for recreation (cached until buildings change).
  private hasJoyBuilding(): boolean {
    if (this.joyBuiltVersion !== this.world.featureVersion) {
      this.joyBuiltVersion = this.world.featureVersion;
      this.joyBuilt = this.countBuilt((f) => !!featureDef(f).joy) > 0;
    }
    return this.joyBuilt;
  }
  private joyBuiltVersion = -1;
  private joyBuilt = false;

  // Whether anyone else in reach is off duty and could do with some recreation.
  private someoneFreeToPlay(c: Colonist, region: number): boolean {
    return this.living().some(
      (o) =>
        o !== c &&
        !o.drafted &&
        !o.sleeping &&
        !o.health.downed &&
        o.needs.joy < 0.9 &&
        (this.slotOf(o) === 'J' || (this.slotOf(o) === 'A' && o.needs.joy < 0.3)) &&
        (!o.job || o.job.type === 'joy' || o.job.type === 'wander') &&
        this.regions.region[o.tile] === region,
    );
  }

  // Others using a joy building (on their way there or already at it).
  private playersAt(spot: number, c: Colonist): Colonist[] {
    return this.living().filter((o) => o !== c && o.job?.type === 'joy' && o.job.target === spot);
  }

  // How much a colonist gets out of a kind of recreation: full value for a fair share, then less the
  // more of it they've had lately.
  public joyEfficiency(c: Colonist, kind: JoyKind): number {
    const had = c.recentJoy[kind] ?? 0;
    return Math.max(MIN_JOY_EFFICIENCY, Math.min(1, (1 + TOLERANCE * FREE_JOY) / (1 + TOLERANCE * had)));
  }

  // Fills the recreation need and notes what kind of recreation it was.
  private enjoy(c: Colonist, kind: JoyKind, amount: number): void {
    const gained = Math.min(amount, 1 - c.needs.joy);
    c.needs.joy += gained;
    c.recentJoy[kind] = (c.recentJoy[kind] ?? 0) + gained;
  }

  // Trees, bushes and water within a step make a walk more refreshing: 0 (bare ground) to 1.
  private scenery(i: number): number {
    const w = this.world;
    let n = 0;
    for (const t of [i, ...w.neighbors(i)]) {
      const f = w.feature[t];
      if ((f !== NONE && featureDef(f).natural && featureDef(f).passable) || this.isWaterTile(w.terrain[t])) {
        n++;
      }
    }
    return Math.min(1, n / 3);
  }

  private stepJoy(c: Colonist, job: Job): void {
    if (job.listening) {
      this.stepListen(c, job);
      return;
    }
    if (job.telling || job.hearing) {
      this.stepStories(c, job);
      return;
    }
    if (job.gathering) {
      this.stepGather(c, job);
      return;
    }
    const w = this.world;
    const spot = job.target;
    const joy = spot >= 0 && w.feature[spot] !== NONE ? featureDef(w.feature[spot]).joy : undefined;
    const there = joy && (joy.beside ? this.isAtWorkSpot(c, spot, false) : c.tile === spot);
    if (!joy || !there || (joy.stargazing && !this.starsOut(spot))) {
      this.endJob(c);
      return;
    }
    const partners = joy.company
      ? this.playersAt(spot, c).filter((o) => o.path.length === 0 && this.isAtWorkSpot(o, spot, false))
      : [];
    const alone = joy.company && partners.length === 0;
    this.enjoy(
      c,
      joy.kind,
      (this.joyEfficiency(c, joy.kind) * (alone ? COMPANY_ALONE : 1)) / (TICKS_PER_HOUR * joy.hoursToFull),
    );
    // Talk over the game: about one exchange every three quarters of an hour.
    if (partners.length > 0) {
      job.progress++;
      if (this.rng.chance(1 / (TICKS_PER_HOUR * 0.75))) {
        converse(this, c, this.rng.pick(partners));
      }
    }
    if (joy.instrument) {
      this.playMusic(c, job, spot);
      // A concert goes on until it's over, however the player is feeling.
      if (this.concert?.player === c.id) {
        if (this.tick >= this.concert.endsAt) {
          this.finishConcert(c);
          this.finishJoy(c, job, joy);
        }
        return;
      }
    }
    const slot = this.slotOf(c);
    if (c.needs.joy >= 0.99 || --job.wait <= 0 || (slot !== 'J' && c.needs.joy > 0.9)) {
      this.finishJoy(c, job, joy);
    }
  }

  // ---- Music ----

  // A colonist at an instrument: practice, music for anyone in earshot, and in the evening, with
  // others free to listen, a skilled player may strike up a concert.
  private playMusic(c: Colonist, job: Job, spot: number): void {
    learn(this, c, 'artistic');
    if (this.tick % SLOW_TICKS === 0) {
      const fine = c.skills.artistic >= FINE_MUSIC_SKILL;
      // The harp, the finest instrument a colony can make, carries a quarter more.
      const finest = featureDef(this.world.feature[spot]).key === 'harp' ? HARP_GAIN : 1;
      for (const o of this.living()) {
        if (o === c || o.sleeping || o.health.downed || !this.inEarshot(spot, o.tile)) {
          continue;
        }
        this.enjoy(o, 'music', LISTEN_GAIN * SLOW_TICKS * musicQuality(c) * finest * this.joyEfficiency(o, 'music'));
        this.addThought(o, fine ? 'heardFineMusic' : 'heardMusic');
      }
    }
    const hour = Math.floor(this.hour);
    if (
      !this.concert &&
      // (Not while an elder is telling stories: the audience is round the fire.)
      !this.storyCircle &&
      // Not if a gathering is on, or due before the concert would end.
      !(this.gathering && this.gathering.startsAt < this.tick + CONCERT_TICKS) &&
      c.skills.artistic >= CONCERT_SKILL &&
      hour >= CONCERT_FROM &&
      hour < CONCERT_UNTIL &&
      this.someoneFreeToPlay(c, this.regionOf(c.tile)) &&
      this.rng.chance(1 / TICKS_PER_HOUR)
    ) {
      this.concert = { player: c.id, tile: spot, endsAt: this.tick + CONCERT_TICKS };
      job.wait = CONCERT_TICKS + TICKS_PER_HOUR;
      const name = featureDef(this.world.feature[spot])
        .name.toLowerCase()
        .replace(/ stand$/, '');
      this.addLog(`${c.name} is giving a concert on the ${name}. Anyone free is welcome to listen.`, 'good');
      this.events.push('concert');
      // Whoever is off duty and doing something for fun (or nothing much) comes along.
      const region = this.regionOf(c.tile);
      for (const o of this.living()) {
        const job = o.job?.type;
        if (
          o !== c &&
          !o.drafted &&
          !o.sleeping &&
          !o.health.downed &&
          (job === 'joy' || job === 'wander' || !job) &&
          !o.job?.listening &&
          !o.job?.gathering &&
          !o.job?.telling &&
          !o.job?.hearing &&
          !this.inMentalBreak(o) &&
          this.slotOf(o) !== 'W' &&
          this.slotOf(o) !== 'S'
        ) {
          const was = o.job;
          this.endJob(o);
          if (!this.tryAttendConcert(o, region) && was) {
            // Couldn't get there: they carry on with whatever they were doing next.
            this.findJob(o);
          }
        }
      }
    }
  }

  // Sound carries six tiles; indoors, only within the same room.
  private inEarshot(from: number, to: number): boolean {
    const w = this.world;
    if (Math.max(Math.abs(w.xOf(from) - w.xOf(to)), Math.abs(w.yOf(from) - w.yOf(to))) > HEARING) {
      return false;
    }
    const here = this.roomAt(from);
    const there = this.roomAt(to);
    const enclosed = (r: RoomInfo | null) => !!r && r.enclosed;
    if (enclosed(here) || enclosed(there)) {
      return here?.id === there?.id;
    }
    return true;
  }

  // At a party, concert or story circle (giving or listening).
  private inEveningCompany(c: Colonist): boolean {
    const j = c.job;
    return !!j && (!!j.gathering || !!j.listening || !!j.telling || !!j.hearing || this.concert?.player === c.id);
  }

  private finishConcert(c: Colonist): void {
    this.concert = null;
    this.stats.concerts = (this.stats.concerts ?? 0) + 1;
    this.addThought(c, 'gaveConcert');
    this.addLog(`${c.name}'s concert is over.`, 'info');
  }

  // ---- Stories by the fire ----

  // Each slow tick in the evening: an elder off duty may gather whoever's free round a lit fire.
  private checkStories(): void {
    const circle = this.storyCircle;
    if (circle) {
      const teller = this.colonists[circle.teller];
      // Over, or the teller's been called away: everyone drifts off.
      if (!teller || teller.health.dead || !teller.job?.telling || this.tick >= circle.endsAt) {
        this.storyCircle = null;
      }
      return;
    }
    const hour = this.hour;
    if (
      hour < STORIES_FROM ||
      hour >= STORIES_UNTIL ||
      this.concert ||
      this.gathering ||
      this.raid ||
      this.tick < (this.story.storiesAt ?? 0) ||
      // (Soon after dusk, most evenings it's due: the gap between them does the spacing.)
      !this.rng.chance(0.25)
    ) {
      return;
    }
    const offDuty = (c: Colonist) =>
      !c.drafted &&
      !c.sleeping &&
      !c.health.downed &&
      !this.inMentalBreak(c) &&
      this.slotOf(c) !== 'W' &&
      this.slotOf(c) !== 'S' &&
      (!c.job || c.job.type === 'joy' || c.job.type === 'wander') &&
      !c.job?.listening &&
      !c.job?.gathering;
    const elders = this.living().filter((c) => c.age >= ELDER && offDuty(c));
    if (elders.length === 0) {
      return;
    }
    const teller = this.rng.pick(elders);
    const region = this.regionOf(teller.tile);
    const w = this.world;
    const fire = this.nearestIn(
      'buildings',
      teller.tile,
      (i) => {
        const def = featureDef(w.feature[i]);
        return def.heater > 0 && !!def.burns && w.fuel[i] > 0 && this.hasWorkSpot(i, false, region);
      },
      1,
    )[0];
    const listeners = this.living().filter((o) => o !== teller && offDuty(o) && this.regions.region[o.tile] === region);
    if (fire === undefined || listeners.length === 0) {
      return;
    }
    const spots = this.workSpots(fire, false, region);
    const path = this.pathfinder.find(teller.tile, spots);
    if (!path) {
      return;
    }
    this.endJob(teller);
    this.assign(teller, this.makeJob('joy', fire, { telling: true, wait: STORY_TICKS + TICKS_PER_HOUR }), path);
    this.storyCircle = { teller: teller.id, fire, endsAt: this.tick + STORY_TICKS };
    this.story.storiesAt = this.tick + STORY_GAP_TICKS;
    const fireName = featureDef(w.feature[fire]).name.toLowerCase();
    this.addLog(`${teller.name} is telling the old stories by the ${fireName}. Anyone free is welcome.`, 'good');
    for (const o of listeners) {
      const was = o.job;
      this.endJob(o);
      const there = this.pathToGather(o, fire, region);
      if (there) {
        this.reserve(o, `l${there.at(-1) ?? o.tile}`);
        this.assign(o, this.makeJob('joy', fire, { hearing: true, wait: STORY_TICKS + TICKS_PER_HOUR }), there);
      } else if (was) {
        this.findJob(o);
      }
    }
  }

  // The teller's best craft: what the children listening pick up.
  private bestSkill(c: Colonist): SkillKey {
    return SKILL_KEYS.reduce((best, k) => (c.skills[k] > c.skills[best] ? k : best), SKILL_KEYS[0]);
  }

  // Telling, or listening: company by the fire, and for the young, a lesson in the teller's craft.
  private stepStories(c: Colonist, job: Job): void {
    const circle = this.storyCircle;
    const teller = circle ? this.colonists[circle.teller] : undefined;
    const done = !circle || !teller || circle.fire !== job.target || this.tick >= circle.endsAt;
    if (done || --job.wait <= 0) {
      if (job.progress >= TICKS_PER_HOUR / 2) {
        this.addThought(c, job.telling ? 'toldStories' : 'heardStories');
        if (job.telling) {
          this.stats.storyNights = (this.stats.storyNights ?? 0) + 1;
        }
      }
      if (job.telling && circle?.teller === c.id) {
        this.storyCircle = null;
      }
      this.endJob(c);
      return;
    }
    // (On the way there, nothing yet.)
    if (c.path.length > 0) {
      return;
    }
    job.progress++;
    this.enjoy(c, 'social', this.joyEfficiency(c, 'social') / (TICKS_PER_HOUR * STORY_HOURS_TO_FULL));
    if (job.hearing && teller && c.age < ADULT) {
      learn(this, c, this.bestSkill(teller), STORY_LESSON);
    }
  }

  // A concert stops if the player stops playing (drafted, collapsed, called away).
  private checkConcert(): void {
    const concert = this.concert;
    if (!concert) {
      return;
    }
    const p = this.colonists[concert.player];
    if (!p || p.health.dead || p.job?.type !== 'joy' || p.job.target !== concert.tile || p.job.listening) {
      this.concert = null;
    }
  }

  // Off-duty colonists gather round a concert, within a few tiles of the player.
  private tryAttendConcert(c: Colonist, region: number): boolean {
    const concert = this.concert;
    // (The instrument's own tile isn't walkable; each listening spot is checked for reach below.)
    if (!concert || concert.player === c.id) {
      return false;
    }
    const path = this.pathToGather(c, concert.tile, region);
    if (!path) {
      return false;
    }
    this.reserve(c, `l${path.at(-1) ?? c.tile}`);
    this.assign(c, this.makeJob('joy', concert.tile, { listening: true, wait: CONCERT_TICKS + TICKS_PER_HOUR }), path);
    return true;
  }

  // A way to a free spot within a few tiles of `center` (and within earshot of it), or null.
  private pathToGather(c: Colonist, center: number, region: number): number[] | null {
    const w = this.world;
    const x0 = w.xOf(center);
    const y0 = w.yOf(center);
    const spots: number[] = [];
    for (let y = y0 - CONCERT_RADIUS; y <= y0 + CONCERT_RADIUS; y++) {
      for (let x = x0 - CONCERT_RADIUS; x <= x0 + CONCERT_RADIUS; x++) {
        const i = w.inBounds(x, y) ? w.idx(x, y) : -1;
        if (
          i >= 0 &&
          i !== center &&
          w.isPassable(i) &&
          this.regions.region[i] === region &&
          !this.isReserved(`l${i}`, c) &&
          this.inEarshot(center, i)
        ) {
          spots.push(i);
        }
      }
    }
    return spots.length > 0 ? this.pathfinder.find(c.tile, spots) : null;
  }

  // In the audience: music at its best, and a word with whoever's listening alongside.
  private stepListen(c: Colonist, job: Job): void {
    const concert = this.concert;
    const player = concert ? this.colonists[concert.player] : undefined;
    if (!concert || !player || concert.tile !== job.target || --job.wait <= 0) {
      if (job.progress >= TICKS_PER_HOUR / 2) {
        this.addThought(c, 'attendedConcert');
      }
      this.endJob(c);
      return;
    }
    job.progress++;
    this.enjoy(
      c,
      'music',
      (musicQuality(player) * this.joyEfficiency(c, 'music')) / (TICKS_PER_HOUR * CONCERT_HOURS_TO_FULL),
    );
    if (this.rng.chance(1 / TICKS_PER_HOUR)) {
      const others = this.living().filter((o) => o !== c && o.job?.listening && o.job.target === concert.tile);
      if (others.length > 0) {
        converse(this, c, this.rng.pick(others));
      }
    }
  }

  // The lasting impressions of a session: a good game with company, the stars, a fine room.
  private finishJoy(c: Colonist, job: Job, joy: JoySpec): void {
    if (joy.company && job.progress >= TICKS_PER_HOUR / 2) {
      this.addThought(c, 'goodGame');
      if (featureDef(this.world.feature[job.target]).key === 'chessTable') {
        this.stats.chessGames = (this.stats.chessGames ?? 0) + 1;
      }
    }
    if (joy.stargazing) {
      this.addThought(c, 'stargazed');
    }
    const room = this.roomAt(c.tile);
    if (room && (room.role === 'Recreation room' || room.role === 'Gallery') && room.impressiveness >= NICE_ROOM) {
      this.addThought(c, 'niceRecRoom');
    }
    this.endJob(c);
  }

  // ---- Gatherings: parties, festivals, weddings, funerals ----

  // Every couple of seconds of game time: start, end or cancel the gathering, plan a funeral or a
  // party when the moment is right, and bring people along.
  private updateGathering(): void {
    // A grave taken down loses its record, so one rebuilt there later starts empty.
    if (this.gravesCheckedVersion !== this.world.featureVersion) {
      this.gravesCheckedVersion = this.world.featureVersion;
      for (const i of [...this.graves.keys()]) {
        this.graveAt(i);
      }
    }
    const g = this.gathering;
    if (!g) {
      this.planFuneral();
      this.planParty();
      return;
    }
    // A raid calls it off, planned or under way.
    if (this.raid) {
      this.endGathering(true);
      return;
    }
    if (this.tick < g.startsAt) {
      return;
    }
    // A raid, or the people it's for being unable to come, calls it off.
    const away = (id: number | undefined) => {
      const c = id === undefined ? undefined : this.colonists[id];
      return !c || c.health.dead || c.health.downed || c.drafted || !!c.away;
    };
    // A wedding needs both of them, and still in love.
    const [one, two] = (g.couple ?? []).map((id) => this.colonists[id]);
    if (g.kind === 'wedding' && (away(one?.id) || away(two?.id) || one.lover !== two.id)) {
      this.endGathering(true);
      return;
    }
    if (!g.started) {
      g.started = true;
      this.events.push('gathering');
      const opening: Record<string, string> = {
        party: `${this.colonists[g.host]?.name ?? 'Someone'} is throwing a party. Anyone off duty, come along!`,
        plantingDay: 'Planting Day: the colony gathers to welcome the growing season.',
        harvestFestival: 'The harvest festival has begun. Off-duty colonists gather to feast.',
        midwinter: 'The midwinter bonfire is lit. Off-duty colonists gather round to sing.',
        wedding: `The wedding of ${this.coupleNames(g)} is beginning.`,
        funeral: `The colony gathers to bury ${this.fallenName(g.honoree)}.`,
      };
      this.addLog(opening[g.kind], 'good');
    }
    if (this.tick >= g.endsAt) {
      this.endGathering(false);
      return;
    }
    this.inviteGuests(g);
  }

  // Everyone who may come to a gathering under way and isn't there yet heads for it.
  private inviteGuests(g: Gathering): void {
    const def = GATHERINGS[g.kind];
    for (const c of this.living()) {
      if (c.job?.gathering || !this.mayAttend(c, def.rite)) {
        continue;
      }
      const region = this.regionOf(c.tile);
      const path = this.pathToGather(c, g.tile, region);
      if (!path) {
        // Can't get there (cut off, or no room left): don't keep trying every couple of seconds.
        this.noGatherUntil.set(c.id, this.tick + TICKS_PER_HOUR / 2);
        continue;
      }
      this.endJob(c);
      this.reserve(c, `l${path.at(-1) ?? c.tile}`);
      this.assign(
        c,
        this.makeJob('joy', g.tile, { gathering: true, wait: g.endsAt - this.tick + TICKS_PER_HOUR }),
        path,
      );
    }
  }

  // Who comes: anyone off duty and doing nothing much for fun; for a rite, anyone not dealing
  // with an emergency (asleep, hurt, starving, fighting, rescuing, doctoring or in a break).
  private mayAttend(c: Colonist, rite: boolean): boolean {
    const h = c.health;
    if (
      c.drafted ||
      c.sleeping ||
      h.downed ||
      this.inMentalBreak(c) ||
      c.needs.food < 0.15 ||
      h.hypothermia > 0.5 ||
      h.heatstroke > 0.5 ||
      needsBedRest(c) ||
      (this.noGatherUntil.get(c.id) ?? 0) > this.tick
    ) {
      return false;
    }
    const job = c.job?.type;
    if (rite) {
      return !job || !BUSY_FOR_RITES.has(job);
    }
    // (Not from a concert, or from stories by the fire: a party waits for those to finish.)
    return (
      this.slotOf(c) !== 'W' &&
      (!job || job === 'wander' || (job === 'joy' && !c.job?.listening && !c.job?.telling && !c.job?.hearing))
    );
  }

  // At a gathering: company and good cheer, and talk with whoever else is there.
  private stepGather(c: Colonist, job: Job): void {
    const g = this.gathering;
    if (!g || g.tile !== job.target || this.tick < g.startsAt || --job.wait <= 0) {
      this.endJob(c);
      return;
    }
    if (c.path.length > 0) {
      return;
    }
    job.progress++;
    g.attended ??= {};
    g.attended[c.id] = (g.attended[c.id] ?? 0) + 1;
    this.enjoy(c, 'social', this.joyEfficiency(c, 'social') / (TICKS_PER_HOUR * GATHERING_HOURS_TO_FULL));
    if (this.rng.chance(1 / (TICKS_PER_HOUR * 0.75))) {
      const others = this.living().filter((o) => o !== c && o.job?.gathering && o.path.length === 0);
      if (others.length > 0) {
        converse(this, c, this.rng.pick(others));
      }
    }
  }

  // The end of a gathering (or its cancellation): what everyone who stayed takes away from it.
  private endGathering(cancelled: boolean): void {
    const g = this.gathering!;
    const def = GATHERINGS[g.kind];
    const there = this.living().filter((c) => c.job?.gathering && c.job.target === g.tile);
    // Whoever is there at the end and spent long enough at it (across a save and load, too).
    const stayed = there.filter((c) => (g.attended?.[c.id] ?? 0) >= ATTENDED_TICKS);
    this.gathering = null;
    for (const c of there) {
      this.endJob(c);
    }
    if (cancelled) {
      if (g.started || g.kind === 'wedding' || g.kind === 'funeral') {
        this.addLog(`${capitalize(def.name)} has been called off.`, 'warn');
      }
      return;
    }
    if (g.kind === 'harvestFestival') {
      this.holdFeast(stayed);
    } else if (g.kind === 'wedding') {
      this.marry(g, stayed);
    } else if (g.kind === 'funeral') {
      this.bury(g, stayed);
    } else {
      for (const c of stayed) {
        this.addThought(c, def.thought);
      }
      if (g.kind === 'party' && stayed.length > 1) {
        this.stats.parties = (this.stats.parties ?? 0) + 1;
      }
      this.addLog(`${capitalize(def.name)} is over. ${stayed.length} came along.`, 'good');
    }
  }

  // A meal from the stores for everyone at the harvest festival, the finest first, if there's one.
  private holdFeast(guests: Colonist[]): void {
    const w = this.world;
    const meals = [itemId('fineMeal'), itemId('meal')];
    let fed = 0;
    for (const c of guests) {
      const tile = meals
        .map((m) =>
          [...w.tilesWith('items')].find((i) => w.itemType[i] === m && this.isStockpile(i) && !w.forbidden[i]),
        )
        .find((i) => i !== undefined);
      if (tile !== undefined) {
        const def = itemDef(w.itemType[tile]);
        w.takeItem(tile, 1);
        c.needs.food = Math.min(1, c.needs.food + def.nutrition);
        this.addThought(c, 'harvestFeast');
        fed++;
      } else {
        this.addThought(c, 'harvestFestival');
      }
    }
    if (fed > 0) {
      this.stats.feasts = (this.stats.feasts ?? 0) + 1;
      this.addLog(`The harvest festival is over: ${fed} feasted on meals from the stores.`, 'good', true);
    } else {
      this.addLog('The harvest festival is over. There were no meals in store to feast on.', 'info', true);
    }
  }

  private marry(g: Gathering, guests: Colonist[]): void {
    const [a, b] = (g.couple ?? []).map((id) => this.colonists[id]);
    if (!a || !b || a.lover !== b.id || !guests.includes(a) || !guests.includes(b)) {
      this.addLog('The wedding ended without the couple both there. It will have to wait.', 'warn');
      return;
    }
    a.spouse = b.id;
    b.spouse = a.id;
    // A new marriage starts without a rough patch, whatever the last one left (a widow's lingers otherwise).
    a.strainedSince = undefined;
    b.strainedSince = undefined;
    this.addThought(a, 'gotMarried');
    this.addThought(b, 'gotMarried');
    for (const c of guests) {
      if (c !== a && c !== b) {
        this.addThought(c, 'attendedWedding');
      }
    }
    this.stats.weddings = (this.stats.weddings ?? 0) + 1;
    this.addLog(`${a.name} and ${b.name} are married!`, 'good', true);
  }

  // Into the grave: it now bears their name, and the mourners' grief eases.
  private bury(g: Gathering, mourners: Colonist[]): void {
    const fallen = this.unburied.find((f) => f.id === g.honoree);
    const w = this.world;
    if (!fallen || w.feature[g.tile] !== featureId('grave') || this.graveAt(g.tile)) {
      return;
    }
    this.graves.set(g.tile, fallen);
    this.unburied = this.unburied.filter((f) => f !== fallen);
    for (const c of mourners) {
      this.addThought(c, 'saidGoodbye');
      this.easeGrief(c);
    }
    this.stats.funerals = (this.stats.funerals ?? 0) + 1;
    this.addLog(`${fallen.name} has been laid to rest.`, 'info', true);
  }

  // Grief from a death fades in half the time.
  private easeGrief(c: Colonist): void {
    for (const t of c.thoughts) {
      if (GRIEF.includes(t.key) && t.expires > this.tick) {
        t.expires = this.tick + Math.ceil((t.expires - this.tick) / 2);
      }
    }
  }

  // A funeral, by day, once there's an empty grave for someone waiting to be buried.
  private planFuneral(): void {
    const hour = Math.floor(this.hour);
    const fallen = this.unburied[0];
    if (!fallen || this.raid || hour < FUNERAL_FROM || hour >= FUNERAL_UNTIL || this.living().length === 0) {
      return;
    }
    const grave = this.emptyGrave();
    if (grave === undefined) {
      return;
    }
    // On the next hour but one, so mourners have time to come.
    const start = this.tick + Math.round((Math.floor(this.hour) + 2 - this.hour) * TICKS_PER_HOUR);
    this.gathering = {
      kind: 'funeral',
      tile: grave,
      startsAt: start,
      endsAt: start + GATHERINGS.funeral.hours * TICKS_PER_HOUR,
      host: -1,
      honoree: fallen.id,
    };
    this.addLog(
      `${fallen.name} will be buried at ${String((Math.floor(this.hour) + 2) % 24).padStart(2, '0')}:00.`,
      'info',
    );
  }

  // Who lies in the grave on a tile (nobody if it's empty, or the grave is gone). A record left by a
  // grave that was taken down is dropped, so a new grave there starts empty.
  public graveAt(i: number): Fallen | undefined {
    const lies = this.graves.get(i);
    if (lies && this.world.feature[i] !== featureId('grave')) {
      this.graves.delete(i);
      return undefined;
    }
    return lies;
  }

  // A grave nobody lies in yet, that the living can reach. Worked out again only when buildings
  // change, since a funeral may wait days for a grave.
  public emptyGrave(): number | undefined {
    const home = this.living()[0];
    if (!home) {
      return undefined;
    }
    const region = this.regionOf(home.tile);
    if (this.emptyGraveVersion !== this.world.featureVersion) {
      this.emptyGraveVersion = this.world.featureVersion;
      const grave = featureId('grave');
      this.graveTiles = [...this.world.tilesWith('features')].filter((i) => this.world.feature[i] === grave);
    }
    return this.graveTiles.find((i) => !this.graveAt(i) && this.regions.region[i] === region);
  }
  private emptyGraveVersion = -1;
  private gravesCheckedVersion = -1;
  private graveTiles: number[] = [];

  // Now and then on an evening, someone in good spirits throws a party in the best room for it.
  private planParty(): void {
    const hour = Math.floor(this.hour);
    if (
      this.gathering ||
      this.raid ||
      this.concert ||
      hour < PARTY_FROM ||
      hour >= PARTY_UNTIL ||
      this.tick < this.nextPartyTick ||
      this.living().length < 3 ||
      !this.rng.chance(SLOW_TICKS / (TICKS_PER_HOUR * 6))
    ) {
      return;
    }
    const host = this.living().find(
      (c) => c.mood >= PARTY_MOOD && !c.drafted && !c.sleeping && !c.health.downed && !this.inMentalBreak(c),
    );
    const spot = this.bestRoomSpot(['Dining room', 'Recreation room', 'Gallery']) ?? this.homeSpot();
    if (!host || spot === undefined) {
      return;
    }
    this.nextPartyTick = this.tick + PARTY_GAP_TICKS;
    this.gathering = {
      kind: 'party',
      tile: spot,
      startsAt: this.tick,
      endsAt: this.tick + GATHERINGS.party.hours * TICKS_PER_HOUR,
      host: host.id,
    };
  }

  // At dawn: today's festival, if it's a festival day, and perhaps a wedding this evening.
  private planDay(): void {
    if (this.gathering || this.living().length < 2) {
      return;
    }
    const day = seasonDay(this.totalHours);
    const festival = FESTIVALS.find((f) => f.season === this.season && f.day === day);
    if (festival && this.story.festivals !== false) {
      const spot = festival.kind === 'midwinter' ? this.bonfireSpot() : this.homeSpot();
      if (spot !== undefined) {
        this.scheduleToday(festival.kind, spot, festival.hour);
        const when = `${festival.hour}:00`;
        const what: Record<string, string> = {
          plantingDay: `It's Planting Day: the colony will gather at ${when} to welcome the growing season.`,
          harvestFestival: `The harvest festival is tonight at ${when}. Meals in store will make it a feast.`,
          midwinter: `The midwinter bonfire will be lit tonight at ${when}.`,
        };
        this.addLog(what[festival.kind], 'good', true);
        return;
      }
    }
    // Devoted lovers may decide to marry.
    for (const a of this.living()) {
      const b = a.lover >= 0 ? this.colonists[a.lover] : undefined;
      if (
        !b ||
        b.health.dead ||
        // (Both at home for it.)
        !!b.away ||
        a.id > b.id ||
        a.spouse === b.id ||
        mutualOpinion(a, b) < WEDDING_OPINION ||
        !this.rng.chance(0.25)
      ) {
        continue;
      }
      const spot = this.bestRoomSpot() ?? this.homeSpot();
      if (spot === undefined) {
        return;
      }
      this.scheduleToday('wedding', spot, WEDDING_HOUR);
      this.gathering!.couple = [a.id, b.id];
      this.addLog(`${a.name} and ${b.name} are to be married this evening at ${WEDDING_HOUR}:00.`, 'good', true);
      return;
    }
  }

  private scheduleToday(kind: GatheringKind, tile: number, hour: number): void {
    const start = this.tick + Math.max(0, Math.round((hour - this.hour) * TICKS_PER_HOUR));
    this.gathering = { kind, tile, startsAt: start, endsAt: start + GATHERINGS[kind].hours * TICKS_PER_HOUR, host: -1 };
  }

  // A walkable tile near the middle of the most impressive room (of the given roles), if any.
  private bestRoomSpot(roles?: string[]): number | undefined {
    this.ensureRegions();
    const contents = this.contents();
    let best = -1;
    let bestScore = -1;
    for (let r = 0; r < this.rooms.sizes.length; r++) {
      if (!this.rooms.enclosed[r] || this.rooms.sizes[r] < 6) {
        continue;
      }
      const info = describeRoom(r, this.rooms, contents[r], 0);
      if ((!roles || roles.includes(info.role)) && info.impressiveness > bestScore) {
        best = r;
        bestScore = info.impressiveness;
      }
    }
    if (best < 0) {
      return undefined;
    }
    const w = this.world;
    const tiles: number[] = [];
    for (let i = 0; i < w.size; i++) {
      if (this.rooms.room[i] === best) {
        tiles.push(i);
      }
    }
    const cx = tiles.reduce((s, i) => s + w.xOf(i), 0) / tiles.length;
    const cy = tiles.reduce((s, i) => s + w.yOf(i), 0) / tiles.length;
    return tiles
      .filter((i) => w.isPassable(i))
      .sort((a, b) => Math.hypot(w.xOf(a) - cx, w.yOf(a) - cy) - Math.hypot(w.xOf(b) - cx, w.yOf(b) - cy))[0];
  }

  // Open ground near the heart of the colony.
  private homeSpot(): number | undefined {
    const home = this.homeTile() ?? this.living()[0]?.tile;
    return home === undefined
      ? undefined
      : this.nearest(home, (i) => this.world.isPassable(i) && !this.isIndoors(i), 1)[0];
  }

  // Beside a campfire or hearth if there is one; otherwise anywhere near home.
  private bonfireSpot(): number | undefined {
    const w = this.world;
    const home = this.homeTile() ?? this.living()[0]?.tile;
    if (home === undefined) {
      return undefined;
    }
    const fire = this.nearest(home, (i) => w.feature[i] !== NONE && featureDef(w.feature[i]).heater > 0, 1)[0];
    return fire ?? this.homeSpot();
  }

  private coupleNames(g: Gathering): string {
    return (g.couple ?? []).map((id) => this.colonists[id]?.name ?? '?').join(' and ');
  }

  private fallenName(id: number | undefined): string {
    return this.colonists.find((c) => c.id === id)?.name ?? 'the fallen';
  }

  // What the colony has to look forward to (or is doing now), for the side panel.
  public gatheringNotice(): string | null {
    const g = this.gathering;
    if (!g) {
      return null;
    }
    const name = g.kind === 'wedding' ? `The wedding of ${this.coupleNames(g)}` : capitalize(GATHERINGS[g.kind].name);
    if (this.tick < g.startsAt) {
      const hour = Math.floor(((this.totalHours + (g.startsAt - this.tick) / TICKS_PER_HOUR) % 24) + 1e-6);
      return `${name} at ${String(hour).padStart(2, '0')}:00`;
    }
    return `${name} is under way`;
  }

  // ---- Sleep ----

  private startSleep(c: Colonist): void {
    this.goToBed(c, 'sleep');
  }

  // Patients lie down in a bed (indoors if possible) until they no longer need bed rest.
  private startRest(c: Colonist): void {
    this.goToBed(c, 'rest');
    c.job!.wait = TICKS_PER_HOUR * 4;
  }

  private goToBed(c: Colonist, type: 'sleep' | 'rest'): void {
    const w = this.world;
    // Put down whatever we were carrying; haulers pick it up later.
    this.dropCarried(c);
    const region = this.regionOf(c.tile);
    const lyingThere = new Set(
      this.living()
        .filter((o) => o.health.downed)
        .map((o) => o.tile),
    );
    // (Not a bed that's on fire.)
    const free = (i: number) =>
      this.regions.region[i] === region && !this.isReserved(`b${i}`, c) && !lyingThere.has(i) && w.fire[i] <= 0;
    const isBed = (i: number) => w.feature[i] !== NONE && featureDef(w.feature[i]).bed;
    const spot =
      // Patients go to a hospital bed indoors if there's one free (out in the open, an ordinary bed
      // indoors is better).
      (type === 'rest'
        ? this.nearestIn('buildings', c.tile, (i) => this.isHospitalBed(i) && this.isIndoors(i) && free(i), 1)[0]
        : undefined) ??
      this.nearestIn(
        'buildings',
        c.tile,
        (i) => isBed(i) && !this.isHospitalBed(i) && this.isIndoors(i) && free(i),
        1,
      )[0] ??
      this.nearestIn('buildings', c.tile, (i) => isBed(i) && this.isIndoors(i) && free(i), 1)[0] ??
      this.nearest(c.tile, (i) => w.feature[i] === NONE && w.isPassable(i) && this.isIndoors(i) && free(i), 1)[0] ??
      this.nearestIn('buildings', c.tile, (i) => isBed(i) && free(i), 1)[0] ??
      // Where they stand, unless that's someone else's bed (a doctor who'd just tended the sleeper lay down
      // on top of them, and took the bed's reservation with them when they got up).
      (free(c.tile) ? c.tile : (w.neighbors(c.tile).find((n) => w.isPassable(n) && free(n)) ?? c.tile));
    const path = this.pathfinder.find(c.tile, [spot]) ?? [];
    if (!this.isReserved(`b${spot}`, c)) {
      this.reserve(c, `b${spot}`);
    }
    c.restTicks = 0;
    c.restOutside = 0;
    c.restCold = 0;
    this.assign(c, this.makeJob(type, path.length > 0 || spot === c.tile ? spot : c.tile), path);
  }

  // ---- Research ----

  // What holds a project back: the building it has to be studied at, and materials short in storage to
  // finish it (nothing when it can go ahead).
  public researchHold(key: string): { building?: string; short: { item: number; count: number }[] } {
    const project = researchDef(key);
    const hold: { building?: string; short: { item: number; count: number }[] } = { short: [] };
    if (!project) {
      return hold;
    }
    if (project.building && this.countBuilt((f) => featureDef(f).key === project.building) === 0) {
      hold.building = project.building;
    }
    for (const need of project.materials ?? []) {
      const item = itemId(need.item);
      const have = this.materialCount(item);
      if (have < need.count) {
        hold.short.push({ item, count: need.count - have });
      }
    }
    return hold;
  }

  // Research materials: in storage, or lying anywhere a colonist could fetch them from (not forbidden).
  // (Counting storage alone, a colony with full stockpiles saw its research held up for iron piled by the
  // smelter.)
  private isMaterial(i: number, item: number): boolean {
    const w = this.world;
    if (w.itemType[i] !== item || w.forbidden[i]) {
      return false;
    }
    if (this.isStockpile(i)) {
      return true;
    }
    const region = this.regions.region[i];
    return region >= 0 && this.living().some((c) => this.regions.region[c.tile] === region);
  }

  private materialCount(item: number): number {
    this.ensureRegions();
    const w = this.world;
    let n = 0;
    for (const i of w.tilesWith('items')) {
      if (this.isMaterial(i, item)) {
        n += w.itemCount[i];
      }
    }
    return n;
  }

  // Takes a finished project's materials out of storage.
  private useMaterials(key: string): void {
    const w = this.world;
    for (const need of researchDef(key)?.materials ?? []) {
      const item = itemId(need.item);
      let left = need.count;
      // (Storage first, then whatever's lying about.)
      const tiles = [...w.tilesWith('items')].filter((i) => this.isMaterial(i, item));
      tiles.sort((a, b) => Number(this.isStockpile(b)) - Number(this.isStockpile(a)));
      for (const i of tiles) {
        if (left > 0) {
          left -= w.takeItem(i, left);
        }
      }
    }
  }

  private tryResearch(c: Colonist): boolean {
    const w = this.world;
    const current = this.research.current;
    if (!current || this.isResearched(current)) {
      return false;
    }
    // Nothing to do at the bench while the project waits on a building, or on materials to finish it.
    const project = researchDef(current);
    const hold = this.researchHold(current);
    if (
      hold.building ||
      (project &&
        hold.short.length > 0 &&
        (this.research.progress[current] ?? 0) >= researchCost(this.research, project) - 1)
    ) {
      return false;
    }
    const region = this.regionOf(c.tile);
    const bench = this.nearestIn(
      'buildings',
      c.tile,
      (i) =>
        w.feature[i] !== NONE &&
        featureDef(w.feature[i]).researchStation &&
        !this.isReserved(`w${i}`, c) &&
        this.hasWorkSpot(i, false, region),
      1,
    )[0];
    if (bench === undefined) {
      return false;
    }
    const path = this.pathfinder.find(c.tile, this.workSpots(bench, false, region));
    if (!path) {
      return false;
    }
    this.reserve(c, `w${bench}`);
    // A research session lasts a couple of hours before the colonist reconsiders.
    this.assign(c, this.makeJob('research', bench, { wait: TICKS_PER_HOUR * 2 }), path);
    return true;
  }

  private stepResearch(c: Colonist, job: Job): void {
    const w = this.world;
    const key = this.research.current;
    const project = key ? researchDef(key) : undefined;
    const benchOk = w.feature[job.target] !== NONE && featureDef(w.feature[job.target]).researchStation;
    if (!project || this.isResearched(project.key) || !benchOk || !this.isAtWorkSpot(c, job.target, false)) {
      this.endJob(c);
      return;
    }
    this.research.progress[project.key] = (this.research.progress[project.key] ?? 0) + this.workSpeed(c, 'research');
    learn(this, c, 'research');
    const cost = researchCost(this.research, project);
    // Materials short: the work goes as far as it can, and waits there.
    if (this.research.progress[project.key] >= cost && this.researchHold(project.key).short.length > 0) {
      this.research.progress[project.key] = cost - 1;
      this.endJob(c);
      return;
    }
    // A round of further study: counted, and on to the next (dearer) round.
    if (project.repeatable && this.research.progress[project.key] >= cost) {
      this.research.further = (this.research.further ?? 0) + 1;
      this.research.progress[project.key] = 0;
      this.addLog(
        `${project.name}: round ${this.research.further} complete. ${this.research.further <= FURTHER_STUDY_ROUNDS ? 'All work goes a little faster.' : 'The colony knows all it can for now, but study goes on.'}`,
        'good',
        true,
      );
      this.endJob(c);
      return;
    }
    if (this.research.progress[project.key] >= cost) {
      this.useMaterials(project.key);
      this.research.done.push(project.key);
      this.research.current = null;
      this.addLog(`Research complete: ${project.name}. ${project.description}`, 'good', true);
      for (const other of this.living()) {
        this.addThought(other, 'researchDone');
      }
      this.endJob(c);
    } else if (--job.wait <= 0) {
      this.endJob(c);
    }
  }

  // ---- Hunting and gear ----

  private tryHunt(c: Colonist): boolean {
    const w = this.world;
    // Deer and hares don't wait for a spear: hunting takes a bow.
    if (weaponDef(c.weapon).range <= 1) {
      return false;
    }
    const region = this.regionOf(c.tile);
    const prey = this.animals
      .filter(
        (a) =>
          a.hp > 0 &&
          this.huntable(a) &&
          this.regions.region[a.tile] === region &&
          !this.isReserved(`h${a.id}`, c) &&
          !spareForBreeding(this, a),
      )
      .sort((a, b) => w.distance(c.tile, a.tile) - w.distance(c.tile, b.tile))[0];
    if (!prey) {
      return false;
    }
    this.reserve(c, `h${prey.id}`);
    this.assign(c, this.makeJob('hunt', -1, { patient: prey.id }), []);
    return true;
  }

  private stepHunt(c: Colonist, job: Job): void {
    const w = this.world;
    const prey = this.animals.find((a) => a.id === job.patient);
    // (Another hunter's kill may have left it one of the last pair.)
    if (!prey || prey.hp <= 0 || !prey.hunted || spareForBreeding(this, prey)) {
      this.endJob(c);
      return;
    }
    // Prey that runs well out of range is let go (a wounded one may come back).
    if (!prey.quarry && !prey.tame && !this.inHuntRange(prey.tile, 12)) {
      this.endJob(c);
      return;
    }
    // Shoot from a little inside bow range; otherwise close in a few steps at a time.
    if (canAttack(this, c, prey.tile, Math.max(1, weaponDef(c.weapon).range - 1))) {
      if (c.cooldown <= 0) {
        attackAnimal(this, c, prey);
      }
      return;
    }
    const goals = [prey.tile, ...w.neighbors(prey.tile)].filter((i) => w.isPassable(i));
    const path = this.pathfinder.find(c.tile, goals);
    if (!path || path.length === 0) {
      this.endJob(c);
      return;
    }
    // A few steps at a time when close (the prey moves); a long way off, more before looking again.
    c.path = path.slice(0, w.distance(c.tile, prey.tile) > 16 ? 16 : 6);
  }

  // Total nutrition the colony has on hand.
  private foodOnHand(): number {
    return this.resourceTotals().reduce((sum, r) => sum + r.total * itemDef(r.item).nutrition, 0);
  }

  // Nothing grows in winter, so fishing is always worth it then.
  // Enough food that nobody needs to fish (a bigger store through winter).
  private foodIsPlentiful(): boolean {
    const target = FISH_FOOD_TARGET * (this.season === 'Winter' ? 2 : 1);
    return this.foodOnHand() >= this.living().length * target;
  }

  private canFishAt(i: number): boolean {
    const w = this.world;
    return (
      w.feature[i] !== NONE &&
      featureDef(w.feature[i]).fishing &&
      w.neighbors(i).some((n) => w.isFishable(n) || w.terrain[n] === ICE)
    );
  }

  // Frozen over: fishing through a hole in the ice is slow going.
  private iceFishing(i: number): boolean {
    return !this.world.neighbors(i).some((n) => this.world.isFishable(n));
  }

  private tryFish(c: Colonist): boolean {
    this.refreshGrid();
    const region = this.regionOf(c.tile);
    const w = this.world;
    const spot = this.fishingSpots
      .filter((i) => this.canFishAt(i) && this.regions.region[i] === region && !this.isReserved(`w${i}`, c))
      .sort((a, b) => w.distance(c.tile, a) - w.distance(c.tile, b))[0];
    if (spot === undefined || this.foodIsPlentiful()) {
      return false;
    }
    const path = this.pathfinder.find(c.tile, [spot]);
    if (!path) {
      return false;
    }
    this.reserve(c, `w${spot}`);
    // A fishing session lasts a few hours before the colonist reconsiders.
    this.assign(c, this.makeJob('fish', spot, { wait: TICKS_PER_HOUR * 3 }), path);
    return true;
  }

  private stepFish(c: Colonist, job: Job): void {
    const w = this.world;
    if (c.tile !== job.target || !this.canFishAt(job.target)) {
      this.endJob(c);
      return;
    }
    job.progress += this.workSpeed(c, 'fish') * (this.iceFishing(job.target) ? 0.5 : 1);
    learn(this, c, 'animals');
    if (job.progress >= FISH_WORK) {
      job.progress -= FISH_WORK;
      w.dropItemNear(job.target, RAW_FISH, FISH_PER_CATCH);
      this.produce(RAW_FISH, FISH_PER_CATCH);
      if (this.foodIsPlentiful()) {
        job.wait = 0;
      }
    }
    if (--job.wait <= 0) {
      this.addThought(c, 'fishedPeacefully');
      this.endJob(c);
    }
  }

  // Fires within this distance of home are fought; farther out, they're left to burn.
  private static readonly FIRE_WATCH = 25;

  // Sleepers this close to a fire wake up to fight it.
  private static readonly SMOKE_WAKES = 12;

  private fireWithin(tile: number, range: number): boolean {
    for (const i of this.burning) {
      if (this.world.distance(i, tile) <= range) {
        return true;
      }
    }
    return false;
  }

  private tryFirefight(c: Colonist): boolean {
    const found = this.findFire(c);
    if (!found) {
      return false;
    }
    this.startFirefight(c, found.fire, found.path);
    return true;
  }

  private startFirefight(c: Colonist, fire: number, path: number[]): void {
    this.reserve(c, `x${fire}`);
    this.assign(c, this.makeJob('extinguish', fire), path);
  }

  // The nearest fire near home that nobody's fighting yet, and the way to it.
  private findFire(c: Colonist): { fire: number; path: number[] } | null {
    if (this.burning.size === 0) {
      return null;
    }
    const w = this.world;
    const home = this.homeTile();
    const region = this.regionOf(c.tile);
    const fires = [...this.burning]
      .filter(
        (i) =>
          (home === undefined || w.distance(i, home) <= Simulation.FIRE_WATCH) &&
          !this.isReserved(`x${i}`, c) &&
          w.neighbors(i, false).some((n) => w.isPassable(n) && this.regions.region[n] === region),
      )
      .sort((a, b) => w.distance(c.tile, a) - w.distance(c.tile, b));
    for (const fire of fires) {
      const path = this.pathfinder.find(c.tile, this.workSpots(fire, false, region));
      if (path) {
        return { fire, path };
      }
    }
    return null;
  }

  private stepExtinguish(c: Colonist, job: Job): void {
    if (this.world.fire[job.target] <= 0 || !this.isAtWorkSpot(c, job.target, false)) {
      this.endJob(c);
      return;
    }
    // Beating out the flames: about two seconds of work for a burning building.
    if (douse(this, job.target, 0.04 * healthFactor(c))) {
      this.endJob(c);
    }
  }

  private tryTame(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const animal = this.animals
      .filter(
        (a) =>
          a.taming &&
          !a.tame &&
          a.hp > 0 &&
          a.revengeOn < 0 &&
          this.regions.region[a.tile] === region &&
          !this.isReserved(`tm${a.id}`, c),
      )
      .sort((a, b) => w.distance(c.tile, a.tile) - w.distance(c.tile, b.tile))[0];
    if (!animal) {
      return false;
    }
    this.reserve(c, `tm${animal.id}`);
    this.assign(c, this.makeJob('tame', -1, { patient: animal.id }), []);
    return true;
  }

  // Walk up to the animal, spend a while calming it, then see whether it takes to the handler.
  private stepTame(c: Colonist, job: Job): void {
    const w = this.world;
    const animal = this.animals.find((a) => a.id === job.patient);
    if (!animal || animal.hp <= 0 || animal.tame || !animal.taming) {
      this.endJob(c);
      return;
    }
    const near =
      Math.max(Math.abs(w.xOf(c.tile) - w.xOf(animal.tile)), Math.abs(w.yOf(c.tile) - w.yOf(animal.tile))) <= 1;
    if (!near) {
      const goals = [animal.tile, ...w.neighbors(animal.tile)].filter((i) => w.isPassable(i));
      const path = this.pathfinder.find(c.tile, goals);
      if (!path || path.length === 0) {
        this.endJob(c);
        return;
      }
      c.path = path.slice(0, 6);
      return;
    }
    // Hold still while being handled.
    animal.path = [];
    animal.restUntil = this.tick + 40;
    job.progress += 1;
    learn(this, c, 'animals');
    if (job.progress < TAME_TICKS) {
      return;
    }
    const def = ANIMALS[animal.kind];
    const chance = Math.max(
      0.05,
      Math.min(0.85, 0.2 + c.skills.animals * 0.035 - def.wildness + (this.isResearched('husbandry') ? 0.15 : 0)),
    );
    if (useInspiration(this, c, 'tamingInspiration') || this.rng.chance(chance)) {
      animal.tame = true;
      animal.taming = false;
      animal.hunted = false;
      animal.revengeOn = -1;
      animal.manhunter = false;
      this.stats.tamed++;
      this.addThought(c, 'tamedAnimal');
      this.addLog(`${c.name} tamed a ${def.name.toLowerCase()}.`, 'good');
    } else if (def.revengeChance && this.rng.chance(def.revengeChance * 0.3)) {
      animal.revengeOn = c.id;
      animal.lashOut = true;
      animal.revengeUntil = this.tick + TICKS_PER_HOUR;
      this.addLog(`The ${def.name.toLowerCase()} lashed out at ${c.name}!`, 'warn');
    }
    this.endJob(c);
  }

  // Swap the starting short bow for a recurve bow lying in storage.
  // Weapons and armor in storage: a colonist takes a clearly better weapon than the one in hand
  // (melee weapons appeal to those told to charge), and armor if theirs is missing or clearly worse.
  private tryEquip(c: Colonist): boolean {
    // (Most of the time there's no spare weapon or armour anywhere: no need to look through every item.)
    const totals = this.resourceTotals();
    if (!GEAR_ITEMS.some((item) => totals[item - 1].total > 0)) {
      return false;
    }
    const w = this.world;
    const region = this.regionOf(c.tile);
    const melee = c.stance === 'charge';
    const score = (key: string, quality: number) =>
      weaponScore(key, quality) * (melee && weaponDef(key).range <= 1 ? 2.5 : 1);
    const current = score(c.weapon, c.weaponQuality);
    const armorValue = (item: number, wear: number) => itemDef(item).armor!.protection * (0.5 + 0.5 * wear);
    const armorNow = c.armor ? armorValue(c.armor.item, c.armor.wear) : 0;
    const kit = this.nearestIn(
      'items',
      c.tile,
      (i) => {
        const type = w.itemType[i];
        if (type === NONE || this.regions.region[i] !== region || this.itemTaken(i, c)) {
          return false;
        }
        const def = itemDef(type);
        if (def.weapon) {
          return (
            score(def.weapon, w.quality[i]) > current * (def.weapon === c.weapon ? WEAPON_UPGRADE : NEW_WEAPON_UPGRADE)
          );
        }
        return !!def.armor && armorValue(type, w.fresh[i]) > armorNow * 1.25 + 0.02;
      },
      1,
    )[0];
    const path = kit !== undefined ? this.pathfinder.find(c.tile, [kit]) : null;
    if (kit === undefined || !path) {
      return false;
    }
    this.reserve(c, `i${kit}`);
    this.assign(c, this.makeJob('equip', -1, { source: kit, item: w.itemType[kit] }), path);
    return true;
  }

  private stepEquip(c: Colonist, job: Job): void {
    const w = this.world;
    if (c.tile !== job.source || w.itemType[job.source] !== job.item) {
      this.endJob(c);
      return;
    }
    const def = itemDef(job.item);
    if (def.weapon) {
      const taken = w.pickUp(job.source, 1);
      if (taken.count > 0) {
        // The old weapon goes back on the floor for someone else (fists stay with their owner).
        const old = weaponDef(c.weapon).item;
        if (old !== undefined) {
          w.dropItemNear(c.tile, old, 1, undefined, c.weaponQuality);
        }
        c.weapon = def.weapon;
        c.weaponQuality = taken.quality ?? NORMAL_QUALITY;
        this.addLog(`${c.name} picked up a ${qualityLabel(c.weaponQuality).toLowerCase()} ${def.name.toLowerCase()}.`);
      }
    } else if (def.armor) {
      const taken = w.pickUp(job.source, 1);
      if (taken.count > 0) {
        if (c.armor) {
          w.dropItemNear(c.tile, c.armor.item, 1, c.armor.wear, c.armor.quality);
        }
        c.armor = { item: job.item, quality: taken.quality ?? NORMAL_QUALITY, wear: taken.fresh ?? 1 };
        this.addLog(`${c.name} put on ${def.name.toLowerCase()}.`);
      }
    } else if (job.item === TOOL_KIT) {
      const kit = w.pickUp(job.source, 1);
      if (kit.count > 0 && !c.tool) {
        c.tool = { quality: kit.quality ?? NORMAL_QUALITY, wear: kit.fresh ?? 1 };
        this.addLog(`${c.name} picked up a ${qualityLabel(c.tool.quality).toLowerCase()} tool kit.`);
      } else if (kit.count > 0) {
        w.dropItemNear(c.tile, TOOL_KIT, 1, kit.fresh, kit.quality);
      }
    } else if (itemDef(job.item).apparel) {
      const taken = w.pickUp(job.source, 1);
      const old = c.apparel;
      c.apparel = { item: taken.item, quality: taken.quality ?? NORMAL_QUALITY, wear: taken.fresh ?? 1 };
      if (old) {
        w.dropItemNear(c.tile, old.item, 1, old.wear, old.quality);
      }
      // Only clearly better clothes are a treat, not the morning swap back into a parka.
      if (!old || c.apparel.quality > old.quality || c.apparel.wear > old.wear + 0.25) {
        this.addThought(c, 'newClothes');
      }
    }
    this.endJob(c);
  }

  // Swap into clothing in storage that suits the weather clearly better than what's worn now.
  private tryDress(c: Colonist): boolean {
    const w = this.world;
    // Reconsidering clothes once an hour is plenty.
    if ((this.nextDressCheck.get(c.id) ?? 0) > this.tick) {
      return false;
    }
    this.nextDressCheck.set(c.id, this.tick + TICKS_PER_HOUR);
    if (![...w.tilesWith('items')].some((i) => !!itemDef(w.itemType[i]).apparel)) {
      return false;
    }
    const outdoor = this.outdoorTemperature();
    const current = wornScore(c, outdoor);
    const region = this.regionOf(c.tile);
    let best: number | undefined;
    let bestScore = current + 0.5;
    for (const i of w.tilesWith('items')) {
      const t = w.itemType[i];
      if (t === NONE || !itemDef(t).apparel || this.regions.region[i] !== region || this.itemTaken(i, c)) {
        continue;
      }
      const score = apparelScore(t, w.quality[i], w.fresh[i], outdoor) - w.distance(c.tile, i) * 0.01;
      if (score > bestScore || (score === bestScore && best !== undefined && i < best)) {
        best = i;
        bestScore = score;
      }
    }
    const path = best !== undefined ? this.pathfinder.find(c.tile, [best]) : null;
    if (best === undefined || !path) {
      return false;
    }
    this.reserve(c, `i${best}`);
    this.assign(c, this.makeJob('equip', -1, { source: best, item: w.itemType[best] }), path);
    return true;
  }

  // A drafted colonist acting on their stance, now and then: archers taking cover slip into the
  // nearest spot with cover and a clear shot; anyone told to charge (and anyone with a melee
  // weapon who isn't holding) closes in on their target. Holding means staying put.
  private draftedTactics(c: Colonist): void {
    const w = this.world;
    const melee = weaponDef(c.weapon).range <= 1;
    const charging = c.stance === 'charge' || (melee && c.stance !== 'hold');
    const every = charging ? 20 : 60;
    if (c.stance === 'hold' || c.path.length > 0 || (this.nextTactics.get(c.id) ?? 0) > this.tick) {
      return;
    }
    if (this.enemies.length === 0) {
      this.animalTactics(c, melee, charging, every);
      return;
    }
    this.nextTactics.set(c.id, this.tick + every);
    let goal: number[];
    if (charging) {
      const region = this.regionOf(c.tile);
      const focus = this.enemies.find((e) => e.id === c.focus && e.hp > 0 && this.regionOf(e.tile) === region);
      const target =
        focus ??
        this.enemies
          .filter((e) => e.hp > 0 && !e.fleeing && this.regionOf(e.tile) === region)
          .sort((a, b) => w.distance(c.tile, a.tile) - w.distance(c.tile, b.tile))[0];
      if (!target) {
        return;
      }
      const reach = melee ? 1.5 : weaponDef(c.weapon).range * 0.6;
      if (w.distance(c.tile, target.tile) <= reach && (melee || colonistTarget(this, c))) {
        return;
      }
      goal = w.neighbors(target.tile).filter((n) => w.isPassable(n));
    } else {
      const spot = coverSpot(this, c);
      if (spot === undefined) {
        return;
      }
      goal = [spot];
    }
    const path = goal.length > 0 ? this.pathfinder.find(c.tile, goal) : null;
    if (path && path.length > 0) {
      c.path = charging ? path.slice(0, 4) : path;
      c.moveProgress = 0;
      c.draftTarget = c.path[c.path.length - 1];
    }
  }

  // Standing (or sleeping, or sulking) in a fire, and not there to fight it: step out of it, and that's this turn
  // (bedtime would otherwise put them straight back where they lay). Children, the retired and anyone with
  // firefighting off used to sleep on while their bed burned. Not someone already on their way off the tile, nor
  // someone carrying, tending or feeding the hurt (a rescuer would drop the patient back in the flames).
  private stepOutOfFire(c: Colonist): boolean {
    const w = this.world;
    const job = c.job?.type;
    if (
      this.tick % SLOW_TICKS !== 0 ||
      w.fire[c.tile] <= 0 ||
      c.drafted ||
      job === 'extinguish' ||
      job === 'rescue' ||
      job === 'tend' ||
      job === 'feed' ||
      (c.path.length > 0 && w.fire[c.path[0]] <= 0)
    ) {
      return false;
    }
    const out = w.neighbors(c.tile).find((n) => w.isPassable(n) && w.fire[n] <= 0);
    if (out === undefined) {
      return false;
    }
    this.endJob(c);
    c.path = [out];
    this.move(c);
    return true;
  }

  // No raiders, but maddened animals (a pack, cave crawlers, the great beast) after the colony: close on the
  // nearest, to within reach of the colonist's weapon and in sight of it. (Drafted colonists used to stand
  // where they were, whatever their stance, unless one came into reach.)
  private animalTactics(c: Colonist, melee: boolean, charging: boolean, every: number): void {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const target = this.animals
      .filter((a) => a.hp > 0 && !a.tame && (a.manhunter || a.revengeOn >= 0) && this.regionOf(a.tile) === region)
      .sort((a, b) => w.distance(c.tile, a.tile) - w.distance(c.tile, b.tile))[0];
    if (!target) {
      return;
    }
    this.nextTactics.set(c.id, this.tick + every);
    // Anyone with a shot keeps taking it (an archer in cover used to leave it, and stop shooting, to walk closer);
    // only those charging close in further, and only those with no shot at all move up to get one.
    const range = weaponDef(c.weapon).range;
    const reach = melee ? 1.5 : charging ? range * 0.6 : range;
    if (w.distance(c.tile, target.tile) <= reach && (melee || lineOfSight(w, c.tile, target.tile))) {
      return;
    }
    const goal = w.neighbors(target.tile).filter((n) => w.isPassable(n));
    const path = goal.length > 0 ? this.pathfinder.find(c.tile, goal) : null;
    if (path && path.length > 0) {
      c.path = path.slice(0, 4);
      c.moveProgress = 0;
      c.draftTarget = c.path[c.path.length - 1];
    }
  }

  // Raiders on the way in, close enough to worry a colonist out in the open.
  private raidersNear(c: Colonist): boolean {
    if (!this.raid || c.drafted || this.isIndoors(c.tile)) {
      return false;
    }
    const job = c.job?.type;
    if (job === 'shelter' || job === 'rescue' || job === 'tend' || job === 'feed' || job === 'eat') {
      return false;
    }
    const w = this.world;
    return this.enemies.some((e) => e.hp > 0 && !e.fleeing && w.distance(e.tile, c.tile) <= SHELTER_RANGE);
  }

  // Undrafted colonists caught outside when raiders come close run indoors, to the room farthest
  // from the raiders they can reach, and stay until the danger passes.
  private tryShelter(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    if ((this.nextShelterSearch.get(c.id) ?? 0) > this.tick) {
      return false;
    }
    const threats = this.enemies.filter((e) => e.hp > 0 && !e.fleeing);
    const danger = (i: number) => {
      let d = Infinity;
      for (const e of threats) {
        d = Math.min(d, w.distance(e.tile, i));
      }
      return d;
    };
    // Of the nearest indoor spots, the one farthest from the raiders.
    const spot = this.nearest(
      c.tile,
      (i) => w.isPassable(i) && this.regions.region[i] === region && this.isIndoors(i),
      8,
    )
      .filter((i) => danger(i) > 4)
      .sort((a, b) => danger(b) - danger(a))[0];
    const path = spot !== undefined ? this.pathfinder.find(c.tile, [spot]) : null;
    if (spot === undefined || !path) {
      this.nextShelterSearch.set(c.id, this.tick + TICKS_PER_HOUR / 2);
      return false;
    }
    this.endJob(c);
    this.assign(c, this.makeJob('shelter', spot, { wait: TICKS_PER_HOUR }), path);
    // Said once, not every time a scuffle on the way sends them running again.
    if ((this.shelterLogged.get(c.id) ?? -Infinity) + TICKS_PER_HOUR <= this.tick) {
      this.shelterLogged.set(c.id, this.tick);
      this.addLog(`${c.name} is running for shelter from the raiders.`);
    }
    return true;
  }

  private stepShelter(c: Colonist, job: Job): void {
    const w = this.world;
    const near = this.enemies.some((e) => e.hp > 0 && !e.fleeing && w.distance(e.tile, c.tile) <= SHELTER_RANGE + 4);
    // Stay put while raiders are about; check again every so often.
    if (--job.wait <= 0 || !near) {
      if (near) {
        job.wait = TICKS_PER_HOUR;
      } else {
        this.endJob(c);
      }
    }
  }

  // Whether this colonist's own tile is outside what their clothes can handle (rain
  // counting as colder), so staying put makes things worse.
  private exposedHere(c: Colonist): boolean {
    const { min, max } = comfortRange(c);
    const t = this.temperatureAt(c.tile) - (isWet(this, c.tile) ? WET_CHILL : 0);
    return t < min || t > max;
  }

  // Too cold or too hot: get somewhere comfortable and stay a while. A failed search waits an
  // hour before the next.
  private tryWarmUp(c: Colonist): boolean {
    const w = this.world;
    if ((this.nextWarmSearch.get(c.id) ?? 0) > this.tick) {
      return false;
    }
    this.nextWarmSearch.set(c.id, this.tick + TICKS_PER_HOUR);
    const { min, max } = comfortRange(c);
    // As it feels: rain chills anyone standing out in it.
    const felt = (i: number) => this.temperatureAt(i) - (isWet(this, i) ? WET_CHILL : 0);
    const ok = (i: number) => {
      const t = felt(i);
      return t >= min && t <= max;
    };
    const region = this.regionOf(c.tile);
    const reachable = (i: number) => w.isPassable(i) && this.regions.region[i] === region;
    // Nowhere comfortable: at least get somewhere better than here.
    const gap = (i: number) => {
      const t = felt(i);
      return t < min ? min - t : t > max ? t - max : 0;
    };
    // Out in the open, every other open tile feels the same as this one: only rooms, roofs and the ground a
    // fire warms can be better, so only those are looked at (the same answer as searching the whole map, at a
    // fraction of the work: a whole-map search for each cold colonist was a sixth of a big map's time).
    const sheltered = (i: number) =>
      this.world.roof[i] !== NONE || this.isIndoors(i) || this.doorway(i) !== undefined || this.fireWarmth().has(i);
    let spot: number | undefined;
    if (ok(c.tile)) {
      spot = c.tile;
    } else if (!sheltered(c.tile)) {
      const places: number[] = [];
      for (let i = 0; i < w.size; i++) {
        if (sheltered(i)) {
          places.push(i);
        }
      }
      spot =
        this.nearestAmong(places, c.tile, (i) => reachable(i) && ok(i), 1)[0] ??
        this.nearestAmong(
          places,
          c.tile,
          (i) => reachable(i) && gap(i) < gap(c.tile) - 3,
          1,
          (i) => gap(i) * 3,
        )[0];
    } else {
      spot =
        this.nearest(c.tile, (i) => reachable(i) && ok(i), 1)[0] ??
        this.nearest(
          c.tile,
          (i) => reachable(i) && gap(i) < gap(c.tile) - 3,
          1,
          (i) => gap(i) * 3,
        )[0];
    }
    if (spot === undefined) {
      return false;
    }
    const path = spot === c.tile ? [] : this.pathfinder.find(c.tile, [spot]);
    if (!path) {
      return false;
    }
    this.nextWarmSearch.delete(c.id);
    this.assign(c, this.makeJob('warmUp', spot, { wait: TICKS_PER_HOUR * 2 }), path);
    return true;
  }

  private stepWarmUp(c: Colonist, job: Job): void {
    const h = c.health;
    if ((h.hypothermia < 0.05 && h.heatstroke < 0.05) || --job.wait <= 0) {
      this.endJob(c);
    }
  }

  // ---- Doctoring ----

  private nextFeedSearch = new Map<number, number>();

  // Someone downed, starving and not yet being fed, within reach.
  private starvingPatient(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    return this.living().some(
      (p) =>
        p !== c &&
        needsCare(p) &&
        p.needs.food < STARVING_PATIENT &&
        !this.isReserved(`fd${p.id}`, c) &&
        this.regions.region[p.tile] === region,
    );
  }

  // Whether any doctor is up and about.
  private doctorStanding(): boolean {
    return this.living().some(
      (d) => d.priorities.doctor > 0 && !d.health.downed && !this.inMentalBreak(d) && canWork(d, 'doctor'),
    );
  }

  private urgentPatient(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    return this.living().some(
      (p) =>
        p !== c &&
        (((p.health.downed || bleedingOf(p) > 0) && needsTending(this, p) && !this.isReserved(`t${p.id}`, c)) ||
          (this.needsRescue(p) && !this.isReserved(`rs${p.id}`, c) && this.canRescue(c, p))) &&
        this.regions.region[p.tile] === region,
    );
  }

  // Whether there's anywhere to carry a patient to (before any shelter exists, there isn't, and
  // a doctor shouldn't keep dropping their work to try).
  // A failed search covers the whole map, so "nowhere to take them" is remembered for a while (per
  // patient and region) rather than worked out again every time a doctor checks.
  private canRescue(c: Colonist, p: Colonist): boolean {
    const key = `${p.id}:${this.regionOf(c.tile)}`;
    if ((this.noRescueUntil.get(key) ?? 0) > this.tick) {
      return false;
    }
    const found = this.rescueDestination(c, p) !== undefined;
    if (!found) {
      this.noRescueUntil.set(key, this.tick + NO_RESCUE_RETRY);
    }
    return found;
  }
  private noRescueUntil = new Map<string, number>();

  // A downed colonist in this doctor's reach who is suffering from the cold or heat right now.
  private exposedPatient(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    return this.living().some(
      (p) =>
        p !== c &&
        (p.health.hypothermia > 0.3 || p.health.heatstroke > 0.3) &&
        this.needsRescue(p) &&
        this.regions.region[p.tile] === region &&
        this.canRescue(c, p),
    );
  }

  // A collapsed colonist lying somewhere cold, hot or outdoors needs carrying to safety.
  private needsRescue(p: Colonist): boolean {
    if (!p.health.downed || p.health.dead) {
      return false;
    }
    // Lying in the open, or in a fire.
    if (!this.isIndoors(p.tile) || this.world.fire[p.tile] > 0) {
      return true;
    }
    const region = this.regionOf(p.tile);
    // Already indoors and comfortable: only worth moving off the floor into a free bed (someone who collapsed
    // in the hut was tended where they lay, beside empty hospital beds).
    if (this.comfortableFor(p, p.tile)) {
      const here = this.world.feature[p.tile];
      if (here !== NONE && featureDef(here).bed) {
        return false;
      }
      const taken = new Set(this.living().map((o) => o.tile));
      return (
        this.nearestIn(
          'buildings',
          p.tile,
          (i) =>
            this.world.feature[i] !== NONE &&
            !!featureDef(this.world.feature[i]).bed &&
            this.regions.region[i] === region &&
            !taken.has(i) &&
            !this.isReserved(`b${i}`, p) &&
            this.isIndoors(i) &&
            this.comfortableFor(p, i),
          1,
        ).length > 0
      );
    }
    return (
      this.nearest(
        p.tile,
        (i) =>
          this.world.isPassable(i) &&
          this.regions.region[i] === region &&
          this.isIndoors(i) &&
          this.comfortableFor(p, i),
        1,
      ).length > 0
    );
  }

  private comfortableFor(c: Colonist, i: number): boolean {
    const { min, max } = comfortRange(c);
    const t = this.temperatureAt(i);
    return t >= min && t <= max;
  }

  // Where to take a rescued colonist: a free, comfortable bed if there is one, otherwise any
  // comfortable spot indoors, otherwise the least bad spot indoors.
  private rescueDestination(c: Colonist, patient: Colonist): number | undefined {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const occupied = new Set(this.living().map((o) => o.tile));
    const open = (i: number) =>
      w.isPassable(i) && this.regions.region[i] === region && !occupied.has(i) && !this.isReserved(`b${i}`, c);
    const bedFor = (hospital: boolean) =>
      this.nearestIn(
        'buildings',
        patient.tile,
        (i) =>
          w.feature[i] !== NONE &&
          featureDef(w.feature[i]).bed &&
          (!hospital || this.isHospitalBed(i)) &&
          open(i) &&
          this.isIndoors(i) &&
          this.comfortableFor(patient, i),
        1,
      )[0];
    // A hospital bed first: the worst hurt were laid in whichever bed was nearest, and never healed in one.
    const bed = bedFor(true) ?? bedFor(false);
    if (bed !== undefined) {
      return bed;
    }
    // Someone already indoors only moves somewhere comfortable, never just sideways.
    if (this.isIndoors(patient.tile)) {
      return this.nearest(patient.tile, (i) => open(i) && this.isIndoors(i) && this.comfortableFor(patient, i), 1)[0];
    }
    const range = comfortRange(patient);
    const comfort = (i: number) => {
      const t = this.temperatureAt(i);
      return t < range.min ? t - range.min : t > range.max ? range.max - t : 0;
    };
    return this.nearest(
      patient.tile,
      (i) => open(i) && this.isIndoors(i),
      1,
      (i) => -comfort(i) * 4,
    )[0];
  }

  // A doctor on their feet who can reach this colonist.
  private rescuerAvailable(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    return this.living().some(
      (o) =>
        o !== c &&
        !o.health.downed &&
        // (Not a drafted doctor, who's holding the line and won't come, nor one too cold or hot to.)
        !o.drafted &&
        o.health.hypothermia <= 0.5 &&
        o.health.heatstroke <= 0.5 &&
        o.priorities.doctor > 0 &&
        canWork(o, 'doctor') &&
        !this.inMentalBreak(o) &&
        this.regionOf(o.tile) === region,
    );
  }

  // A collapsed colonist with nobody on their feet to help drags themselves, slowly: out of the cold
  // (or heat) first, and when they're going hungry, to the nearest food, which they eat where it lies.
  private crawlToShelter(c: Colonist): void {
    const w = this.world;
    if (c.path.length === 0) {
      if (this.tick % SLOW_TICKS !== 0 || this.rescuerAvailable(c)) {
        return;
      }
      const hungry = c.needs.food < CRAWL_HUNGRY;
      // Food within reach comes first: having crawled to it, they eat before anything else.
      if (hungry && this.eatWhereLying(c)) {
        return;
      }
      // Out of the cold (or heat). Hungry, they only go back for shelter if the weather is actually
      // getting to them, or they'd crawl to food and back again without ever eating.
      const exposed = c.health.hypothermia > 0.15 || c.health.heatstroke > 0.15;
      if (this.needsRescue(c) && (!hungry || exposed)) {
        const dest = this.rescueDestination(c, c);
        c.path = dest !== undefined && dest !== c.tile ? (this.pathfinder.find(c.tile, [dest]) ?? []) : [];
        // Nowhere better to be: food, then, if they need it.
        if (c.path.length > 0) {
          return;
        }
      }
      if (hungry) {
        const region = this.regionOf(c.tile);
        const food = this.nearestIn(
          'items',
          c.tile,
          (i) =>
            w.itemType[i] !== NONE &&
            isFood(w.itemType[i]) &&
            this.regions.region[i] === region &&
            !this.itemTaken(i, c) &&
            w.distance(i, c.tile) <= CRAWL_RANGE,
          1,
        )[0];
        if (food !== undefined) {
          c.path = this.pathfinder.find(c.tile, [food]) ?? [];
        }
      }
      return;
    }
    const next = c.path[0];
    if (!w.isPassable(next)) {
      c.path = [];
      return;
    }
    c.moveProgress += this.moveRate(c) * 0.2;
    if (c.moveProgress >= 1) {
      c.tile = next;
      c.path.shift();
      c.moveProgress = 0;
    }
  }

  private isFoodTile(i: number | undefined): boolean {
    const item = i === undefined ? NONE : this.world.itemType[i];
    return item !== NONE && isFood(item);
  }

  // A downed colonist eats whatever food is on their tile or right beside it. Returns false if
  // there's none.
  private eatWhereLying(c: Colonist): boolean {
    const w = this.world;
    const tile = [c.tile, ...w.neighbors(c.tile)].find(
      (i) => w.itemType[i] !== NONE && isFood(w.itemType[i]) && !this.itemTaken(i, c),
    );
    if (tile === undefined) {
      return false;
    }
    const def = itemDef(w.itemType[tile]);
    const wanted = def.category === 'meal' ? 1 : Math.max(1, Math.ceil((1 - c.needs.food) / def.nutrition));
    const meal = w.pickUp(tile, wanted);
    c.needs.food = Math.min(1, c.needs.food + def.nutrition * meal.count);
    this.maybePoison(c, meal.item, meal.quality ?? NORMAL_QUALITY);
    if (def.rawPenalty && !traitValue(c, 'ignoresRawFood')) {
      this.addThought(c, 'ateRaw');
    }
    this.addThought(c, 'ateWithoutTable');
    this.addLog(`${c.name}, unable to stand, dragged themselves to some food.`);
    return true;
  }

  private tryRescue(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const patient = this.living()
      .filter(
        (p) =>
          p !== c && this.needsRescue(p) && !this.isReserved(`rs${p.id}`, c) && this.regions.region[p.tile] === region,
      )
      .sort((a, b) => w.distance(c.tile, a.tile) - w.distance(c.tile, b.tile))[0];
    if (!patient || this.rescueDestination(c, patient) === undefined) {
      return false;
    }
    const goals = [patient.tile, ...w.neighbors(patient.tile)].filter((i) => w.isPassable(i));
    const path = this.pathfinder.find(c.tile, goals);
    if (!path) {
      return false;
    }
    this.dropCarried(c);
    this.reserve(c, `rs${patient.id}`);
    this.assign(c, this.makeJob('rescue', -1, { patient: patient.id }), path);
    return true;
  }

  private stepRescue(c: Colonist, job: Job): void {
    const w = this.world;
    const patient = this.colonists[job.patient];
    if (!patient || patient.health.dead || !patient.health.downed) {
      this.endJob(c);
      return;
    }
    if (job.stage === 1) {
      // Arrived: lay them down.
      patient.tile = c.tile;
      this.addLog(`${c.name} carried ${patient.name} to safety.`);
      this.endJob(c);
      return;
    }
    const near =
      Math.max(Math.abs(w.xOf(c.tile) - w.xOf(patient.tile)), Math.abs(w.yOf(c.tile) - w.yOf(patient.tile))) <= 1;
    if (!near) {
      const path = this.pathfinder.find(
        c.tile,
        [patient.tile, ...w.neighbors(patient.tile)].filter((i) => w.isPassable(i)),
      );
      if (!path || path.length === 0) {
        this.endJob(c);
      } else {
        c.path = path;
      }
      return;
    }
    const dest = this.rescueDestination(c, patient);
    const path = dest !== undefined ? this.pathfinder.find(c.tile, [dest]) : null;
    if (dest === undefined || !path) {
      this.endJob(c);
      return;
    }
    this.reserve(c, `b${dest}`);
    patient.tile = c.tile;
    patient.path = [];
    patient.moveProgress = 0;
    job.target = dest;
    job.stage = 1;
    c.path = path;
  }

  // ---- Prisoners ----

  // A prisoner bed with nobody in it (or on the way to it), in the region, nearest the tile.
  private freePrisonerBed(near: number, region: number, c: Colonist): number | undefined {
    const w = this.world;
    const held = new Set(this.captives.filter((p) => p.state === 'prisoner').map((p) => p.tile));
    return this.nearestIn(
      'features',
      near,
      (i) =>
        w.feature[i] === PRISONER_BED &&
        !held.has(i) &&
        this.regions.region[i] === region &&
        !this.isReserved(`b${i}`, c),
      1,
    )[0];
  }

  // A warden carries a downed raider marked for capture to a free prisoner bed, once the fighting's over.
  private tryCapture(c: Colonist): boolean {
    if (this.enemies.some((e) => e.hp > 0 && !e.fleeing)) {
      return false;
    }
    const w = this.world;
    const region = this.regionOf(c.tile);
    const captive = this.captives
      .filter(
        (p) =>
          p.state === 'downed' &&
          p.capture &&
          this.regions.region[p.tile] === region &&
          !this.isReserved(`cp${p.id}`, c),
      )
      .sort((a, b) => w.distance(c.tile, a.tile) - w.distance(c.tile, b.tile))[0];
    if (!captive) {
      return false;
    }
    const bed = this.freePrisonerBed(captive.tile, region, c);
    if (bed === undefined) {
      return false;
    }
    const path = this.pathfinder.find(
      c.tile,
      [captive.tile, ...w.neighbors(captive.tile)].filter((i) => w.isPassable(i)),
    );
    if (!path) {
      return false;
    }
    this.dropCarried(c);
    this.reserve(c, `cp${captive.id}`);
    this.reserve(c, `b${bed}`);
    this.assign(c, this.makeJob('capture', bed, { patient: captive.id }), path);
    return true;
  }

  private stepCapture(c: Colonist, job: Job): void {
    const w = this.world;
    const captive = this.captives.find((p) => p.id === job.patient);
    // Gone, already taken, or the order to capture them called off.
    if (!captive || captive.state !== 'downed' || !captive.capture) {
      this.endJob(c);
      return;
    }
    if (job.stage === 1) {
      // Arrived (or stopped short): lay them in the bed if it's still there and free.
      const taken = this.captives.some((p) => p.state === 'prisoner' && p.tile === job.target);
      if (c.tile === job.target && w.feature[job.target] === PRISONER_BED && !taken) {
        captive.state = 'prisoner';
        captive.tile = job.target;
        captive.since = this.tick;
        captive.capture = false;
        this.stats.captured = (this.stats.captured ?? 0) + 1;
        this.addLog(`${c.name} took ${captive.name} prisoner.`, 'good', true);
      } else {
        captive.tile = c.tile;
      }
      this.endJob(c);
      return;
    }
    const near = chebyshevTiles(w, c.tile, captive.tile) <= 1;
    if (!near) {
      const path = this.pathfinder.find(
        c.tile,
        [captive.tile, ...w.neighbors(captive.tile)].filter((i) => w.isPassable(i)),
      );
      if (!path || path.length === 0) {
        this.endJob(c);
      } else {
        c.path = path;
      }
      return;
    }
    const path = w.feature[job.target] === PRISONER_BED ? this.pathfinder.find(c.tile, [job.target]) : null;
    if (!path) {
      this.endJob(c);
      return;
    }
    captive.tile = c.tile;
    job.stage = 1;
    c.path = path;
    // Already standing on the bed.
    if (path.length === 0) {
      this.stepCapture(c, job);
    }
  }

  // A warden brings food to a hungry prisoner, or goes to talk with one who's due a visit.
  private tryWarden(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const held = this.captives.filter(
      (p) => p.state === 'prisoner' && this.regions.region[p.tile] === region && !this.isReserved(`pr${p.id}`, c),
    );
    const hungry = held.find((p) => p.food < FEED_BELOW);
    let source: number | undefined;
    if (hungry) {
      source = this.nearestIn(
        'items',
        c.tile,
        (i) =>
          w.itemType[i] !== NONE && isFood(w.itemType[i]) && this.regions.region[i] === region && !this.itemTaken(i, c),
        1,
        (i) => (itemDef(w.itemType[i]).category === 'meal' ? 0 : 10),
      )[0];
    }
    // Food for the hungry one if there's any to bring; otherwise whoever's due a talk (the hungry one
    // first, since a visit can still do some good).
    const prisoner =
      hungry && (source !== undefined || visitDue(this, hungry)) ? hungry : held.find((p) => visitDue(this, p));
    if (!prisoner) {
      return false;
    }
    if (prisoner !== hungry) {
      source = undefined;
    }
    const goals =
      source !== undefined ? [source] : [prisoner.tile, ...w.neighbors(prisoner.tile)].filter((i) => w.isPassable(i));
    const path = this.pathfinder.find(c.tile, goals);
    if (!path) {
      return false;
    }
    this.dropCarried(c);
    this.reserve(c, `pr${prisoner.id}`);
    if (source !== undefined) {
      this.reserve(c, `i${source}`);
    }
    this.assign(
      c,
      this.makeJob('warden', prisoner.tile, {
        patient: prisoner.id,
        source: source ?? -1,
        item: source !== undefined ? w.itemType[source] : NONE,
        stage: source !== undefined ? 0 : 1,
      }),
      path,
    );
    return true;
  }

  private stepWarden(c: Colonist, job: Job): void {
    const w = this.world;
    const prisoner = this.captives.find((p) => p.id === job.patient);
    if (!prisoner || prisoner.state !== 'prisoner') {
      this.endJob(c);
      return;
    }
    if (job.stage === 0) {
      if (c.tile !== job.source || w.itemType[job.source] !== job.item || c.carrying) {
        this.endJob(c);
        return;
      }
      const def = itemDef(job.item);
      const wanted = def.category === 'meal' ? 1 : Math.max(1, Math.ceil((1 - prisoner.food) / def.nutrition));
      c.carrying = w.pickUp(job.source, wanted);
      this.release(c, `i${job.source}`);
      job.stage = 1;
    }
    if (job.stage === 1) {
      if (chebyshevTiles(w, c.tile, prisoner.tile) > 1) {
        const region = this.regionOf(c.tile);
        const path = this.pathfinder.find(
          c.tile,
          [prisoner.tile, ...w.neighbors(prisoner.tile)].filter(
            (i) => w.isPassable(i) && this.regions.region[i] === region,
          ),
        );
        if (!path || path.length === 0) {
          this.endJob(c);
        } else {
          c.path = path;
        }
        return;
      }
      job.stage = 2;
      job.progress = 0;
    }
    if (++job.progress < TALK_TICKS) {
      return;
    }
    const meal = c.carrying;
    if (meal && isFood(meal.item)) {
      prisoner.food = Math.min(1, prisoner.food + itemDef(meal.item).nutrition * meal.count);
      c.carrying = null;
      this.addLog(`${c.name} brought food to the prisoner ${prisoner.name}.`);
    }
    if (visitDue(this, prisoner)) {
      talk(this, c, prisoner);
    }
    this.endJob(c);
  }

  // Tends the most urgent patient (only those bleeding, if asked).
  private tryTend(c: Colonist, bleedingOnly = false): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    // Others first (self-treatment is a last resort), then the most urgent: downed, then bleeding.
    const urgency = (p: Colonist) =>
      (p === c ? 1000 : 0) -
      (p.health.downed ? 100 : 0) -
      (bleedingOf(p) > 0 ? 50 + p.health.bloodLoss * 200 : 0) +
      w.distance(c.tile, p.tile);
    const patient = this.living()
      .filter(
        (p) =>
          needsTending(this, p) &&
          (!bleedingOnly || bleedingOf(p) > 0) &&
          !this.isReserved(`t${p.id}`, c) &&
          this.regions.region[p.tile] === region,
      )
      .sort((a, b) => urgency(a) - urgency(b))[0];
    if (!patient) {
      return false;
    }
    this.reserve(c, `t${patient.id}`);
    // Medicine helps with fresh wounds, and cures an infected one outright; an illness only needs looking after.
    const wounded = patient.health.injuries.some((injury) => injury.tended === 0 || isInfected(injury));
    const medicine = wounded
      ? this.nearestIn(
          'items',
          c.tile,
          (i) => w.itemType[i] === MEDICINE && this.regions.region[i] === region && !this.itemTaken(i, c),
          1,
        )[0]
      : undefined;
    const path = medicine !== undefined ? this.pathfinder.find(c.tile, [medicine]) : null;
    if (medicine !== undefined && path) {
      this.dropCarried(c);
      this.reserve(c, `i${medicine}`);
      this.assign(c, this.makeJob('tend', -1, { source: medicine, item: MEDICINE, patient: patient.id }), path);
    } else {
      this.assign(c, this.makeJob('tend', -1, { patient: patient.id, stage: 1 }), []);
    }
    return true;
  }

  // An elder whose old aches could do with easing, and herbal medicine to spare for it.
  private trySoothe(c: Colonist): boolean {
    const w = this.world;
    // (Counting doses other doctors are already off to fetch for a rub.)
    const fetching = this.living().filter((o) => o !== c && o.job?.type === 'soothe').length;
    if (this.stockOf(MEDICINE) - fetching <= SOOTHE_RESERVE) {
      return false;
    }
    const region = this.regionOf(c.tile);
    const patient = this.living().find(
      (p) =>
        p !== c &&
        ailmentPain(p) > 0 &&
        p.health.easedUntil === undefined &&
        !p.health.downed &&
        !needsTending(this, p) &&
        !this.isReserved(`so${p.id}`, c) &&
        this.regions.region[p.tile] === region,
    );
    if (!patient) {
      return false;
    }
    const medicine = this.nearestIn(
      'items',
      c.tile,
      (i) => w.itemType[i] === MEDICINE && this.regions.region[i] === region && !this.itemTaken(i, c),
      1,
    )[0];
    const path = medicine !== undefined ? this.pathfinder.find(c.tile, [medicine]) : null;
    if (medicine === undefined || !path) {
      return false;
    }
    this.dropCarried(c);
    this.reserve(c, `so${patient.id}`);
    this.reserve(c, `i${medicine}`);
    this.assign(c, this.makeJob('soothe', -1, { source: medicine, item: MEDICINE, patient: patient.id }), path);
    return true;
  }

  private stepTend(c: Colonist, job: Job): void {
    const w = this.world;
    const patient = this.colonists[job.patient];
    // (A rub for an elder's aches stops at once if they're hurt or fall ill: then they need real tending.)
    const soothe = job.type === 'soothe';
    if (
      !patient ||
      (soothe
        ? patient.health.dead || patient.health.downed || needsTending(this, patient)
        : !needsTending(this, patient))
    ) {
      this.endJob(c);
      return;
    }
    if (job.stage === 0) {
      if (c.tile === job.source && w.itemType[job.source] === MEDICINE && !c.carrying) {
        c.carrying = { item: MEDICINE, count: w.takeItem(job.source, 1) };
      }
      this.release(c, `i${job.source}`);
      job.stage = 1;
    }
    if (job.stage === 1) {
      const near =
        patient === c ||
        Math.max(Math.abs(w.xOf(c.tile) - w.xOf(patient.tile)), Math.abs(w.yOf(c.tile) - w.yOf(patient.tile))) <= 1;
      if (!near) {
        const region = this.regionOf(c.tile);
        const goals = [patient.tile, ...w.neighbors(patient.tile)].filter(
          (i) => w.isPassable(i) && this.regions.region[i] === region,
        );
        const path = this.pathfinder.find(c.tile, goals);
        if (!path || path.length === 0) {
          this.endJob(c);
        } else {
          c.path = path;
        }
        return;
      }
      if (patient !== c && patient.path.length > 0) {
        // Wait for the patient to stop walking.
        return;
      }
      job.stage = 2;
    }
    const adjacent =
      patient === c ||
      Math.max(Math.abs(w.xOf(c.tile) - w.xOf(patient.tile)), Math.abs(w.yOf(c.tile) - w.yOf(patient.tile))) <= 1;
    if (!adjacent) {
      // The patient wandered off: follow them.
      job.stage = 1;
      return;
    }
    job.progress += this.workSpeed(c, 'doctor');
    learn(this, c, 'medicine');
    if (job.progress >= TEND_TICKS) {
      // One dose per tend, even when the doctor happens to be carrying a whole stack.
      const medicine = c.carrying?.item === MEDICINE;
      if (medicine && --c.carrying!.count <= 0) {
        c.carrying = null;
      }
      if (soothe) {
        if (medicine) {
          patient.health.easedUntil = this.tick + EASE_TICKS;
          this.addThought(patient, 'achesEased');
        }
      } else {
        tend(this, c, patient, medicine, this.messAround(patient.tile));
      }
      this.endJob(c);
    }
  }

  // Someone who can't get up to eat gets food brought to them.
  // Brings food to someone downed and hungry (below `below`).
  private tryFeed(c: Colonist, below = 0.35): boolean {
    const found = this.findFeed(c, below);
    if (!found) {
      return false;
    }
    this.dropCarried(c);
    this.reserve(c, `fd${found.patient.id}`);
    this.reserve(c, `i${found.source}`);
    this.assign(
      c,
      this.makeJob('feed', -1, {
        source: found.source,
        item: this.world.itemType[found.source],
        patient: found.patient.id,
      }),
      found.path,
    );
    return true;
  }

  // Someone downed and hungry, and food to bring them, and the way to it.
  private findFeed(c: Colonist, below: number): { patient: Colonist; source: number; path: number[] } | null {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const patient = this.living().find(
      (p) =>
        p !== c &&
        needsCare(p) &&
        p.needs.food < below &&
        !this.isReserved(`fd${p.id}`, c) &&
        this.regions.region[p.tile] === region,
    );
    if (!patient) {
      return null;
    }
    const source = this.nearestIn(
      'items',
      c.tile,
      (i) =>
        w.itemType[i] !== NONE && isFood(w.itemType[i]) && this.regions.region[i] === region && !this.itemTaken(i, c),
      1,
      (i) => (itemDef(w.itemType[i]).category === 'meal' ? 0 : 10),
    )[0];
    const path = source !== undefined ? this.pathfinder.find(c.tile, [source]) : null;
    if (source === undefined || !path) {
      return null;
    }
    return { patient, source, path };
  }

  private stepFeed(c: Colonist, job: Job): void {
    const w = this.world;
    const patient = this.colonists[job.patient];
    if (!patient || patient.health.dead || !needsCare(patient)) {
      this.endJob(c);
      return;
    }
    if (job.stage === 0) {
      if (c.tile !== job.source || w.itemType[job.source] !== job.item || c.carrying) {
        this.endJob(c);
        return;
      }
      const def = itemDef(job.item);
      const wanted = def.category === 'meal' ? 1 : Math.max(1, Math.ceil((1 - patient.needs.food) / def.nutrition));
      c.carrying = w.pickUp(job.source, wanted);
      this.release(c, `i${job.source}`);
      job.stage = 1;
    }
    const near =
      Math.max(Math.abs(w.xOf(c.tile) - w.xOf(patient.tile)), Math.abs(w.yOf(c.tile) - w.yOf(patient.tile))) <= 1;
    if (!near) {
      const region = this.regionOf(c.tile);
      const goals = [patient.tile, ...w.neighbors(patient.tile)].filter(
        (i) => w.isPassable(i) && this.regions.region[i] === region,
      );
      const path = this.pathfinder.find(c.tile, goals);
      if (!path || path.length === 0) {
        this.endJob(c);
      } else {
        c.path = path;
      }
      return;
    }
    const meal = c.carrying;
    if (meal && isFood(meal.item)) {
      patient.needs.food = Math.min(1, patient.needs.food + itemDef(meal.item).nutrition * meal.count);
      c.carrying = null;
      this.addLog(`${c.name} fed ${patient.name}.`);
      // Bringing an elder their meal is a kindness, and felt as one.
      if (!patient.health.downed) {
        this.addThought(patient, 'caredFor');
        this.addThought(c, 'lookedAfterElder');
      }
    }
    this.endJob(c);
  }

  private lieDown(c: Colonist, job: Job): void {
    if (c.tile !== job.target) {
      // Couldn't make it to the planned spot: sleep where we are.
      job.target = c.tile;
    }
    c.sleeping = true;
    c.restTicks++;
    const outside = !this.isIndoors(c.tile);
    if (outside) {
      c.restOutside++;
    }
    if (this.temperatureAt(c.tile) < comfortRange(c).min) {
      c.restCold++;
    }
  }

  private wakeUp(c: Colonist): void {
    if (c.restTicks < TICKS_PER_HOUR) {
      return;
    }
    const w = this.world;
    if (c.restOutside > c.restTicks / 2) {
      this.addThought(c, 'sleptOutside');
    }
    if (c.restCold > c.restTicks / 2) {
      this.addThought(c, 'sleptInCold');
    }
    const inBed = w.feature[c.tile] !== NONE && !!featureDef(w.feature[c.tile]).bed;
    const room = inBed ? this.roomAt(c.tile) : undefined;
    if (!inBed) {
      this.addThought(c, 'sleptOnGround');
    } else if (room?.enclosed && room.beds > 1) {
      this.addThought(c, 'sharedBedroom');
    } else if (room?.enclosed && room.impressiveness >= NICE_ROOM) {
      this.addThought(c, 'niceBedroom');
    }
    // The leader and the old expect a room of their own (the leader, a nice one).
    const expected = bedroomExpectation(
      this,
      c,
      !!room?.enclosed && room.beds <= 1,
      !!room?.enclosed && room.impressiveness >= NICE_ROOM,
    );
    if (expected) {
      this.addThought(c, expected);
    }
  }

  private startWander(c: Colonist): void {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const x = w.xOf(c.tile);
    const y = w.yOf(c.tile);
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = x + this.rng.int(-4, 4);
      const ty = y + this.rng.int(-4, 4);
      if (!w.inBounds(tx, ty)) {
        continue;
      }
      const t = w.idx(tx, ty);
      // Idling, they stay somewhere bearable; in a daze, they wander anywhere.
      if (
        t === c.tile ||
        this.regions.region[t] !== region ||
        (!this.inMentalBreak(c) && !this.bearable(c, t, JOY_CHILL))
      ) {
        continue;
      }
      const path = this.pathfinder.find(c.tile, [t]);
      if (path && path.length < 12) {
        this.assign(c, this.makeJob('wander', t, { wait: this.rng.int(20, 60) }), path);
        return;
      }
    }
    this.assign(c, this.makeJob('wander', c.tile, { wait: this.rng.int(20, 40) }), []);
  }
}

const NUMBER_WORDS: Record<number, string> = { 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six' };

export interface ObjectiveDef {
  id: string;
  label: string;
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  check: (sim: Simulation) => boolean;
  progress?: (sim: Simulation) => string;
  // Left out entirely in some games (no raids on peaceful).
  hidden?: (sim: Simulation) => boolean;
}

export const PHASE_NAMES = ['Shelter', 'Living', 'Story', 'Seasons', 'Prosperity', 'Legacy', 'Generations', 'Mastery'];

const produced = (s: Simulation, key: string) => s.stats.produced[key] ?? 0;
// Kinds of recreation the colony's buildings offer (walks don't count).
const recreationKinds = (s: Simulation) => {
  const kinds = new Set<string>();
  for (const i of s.buildingTiles()) {
    const joy = featureDef(s.world.feature[i]).joy;
    if (joy) {
      kinds.add(joy.kind);
    }
  }
  return kinds.size;
};

// Phase 1 is the vertical slice (gather, haul, build, survive the night);
// phase 2 asks the colony to feed, entertain, and warm itself.
// Whether any zoned tile passes the test (looking only at zoned tiles, not the whole map).
const anyZone = (s: Simulation, test: (zone: number) => boolean): boolean => {
  for (const i of s.world.tilesWith('zones')) {
    if (test(s.world.zone[i])) {
      return true;
    }
  }
  return false;
};

export const OBJECTIVES: ObjectiveDef[] = [
  {
    id: 'wood',
    label: 'Chop 40 wood',
    phase: 1,
    check: (s) => produced(s, 'wood') >= 40,
    progress: (s) => `${Math.min(40, produced(s, 'wood'))}/40`,
  },
  {
    id: 'stockpile',
    label: 'Mark out a stockpile zone',
    phase: 1,
    check: (s) => anyZone(s, (z) => z < GROW_ZONE),
  },
  {
    id: 'haul',
    label: 'Haul 30 items into storage',
    phase: 1,
    check: (s) => s.stats.hauled >= 30,
    progress: (s) => `${Math.min(30, s.stats.hauled)}/30`,
  },
  {
    id: 'shelter',
    label: 'Build an enclosed shelter (walls + door)',
    phase: 1,
    // (A door too: someone walled into a ring of rock hasn't built a shelter.)
    check: (s) => s.hasShelter() && s.countBuilt((f) => !!featureDef(f).door) > 0,
  },
  {
    id: 'bed',
    label: 'Build a bed',
    phase: 1,
    check: (s) => s.countBuilt((f) => featureDef(f).bed) > 0,
  },
  {
    id: 'night',
    label: 'Survive the first night with everyone indoors',
    phase: 1,
    check: (s) => s.firstNight === 'success',
    progress: (s) =>
      s.firstNight === 'pending' && s.day === 1 && s.hour < NIGHT_START
        ? `${Math.ceil(NIGHT_START - s.hour)}h to nightfall`
        : '',
  },
  {
    id: 'grow',
    label: 'Create a growing zone',
    phase: 2,
    check: (s) => anyZone(s, (z) => z >= GROW_ZONE),
  },
  {
    id: 'harvest',
    label: 'Harvest 24 potatoes',
    phase: 2,
    check: (s) => produced(s, 'potatoes') >= 24,
    progress: (s) => `${Math.min(24, produced(s, 'potatoes'))}/24`,
  },
  {
    id: 'meals',
    label: 'Cook 5 simple meals at a stove',
    phase: 2,
    check: (s) => produced(s, 'meal') >= 5,
    progress: (s) => `${Math.min(5, produced(s, 'meal'))}/5`,
  },
  {
    id: 'rec',
    label: 'Build a recreation spot',
    phase: 2,
    check: (s) => s.countBuilt((f) => !!featureDef(f).joy) > 0,
  },
  {
    id: 'heat',
    label: 'Heat a bedroom with a campfire',
    phase: 2,
    check: (s) => s.allRooms().some((r) => r.enclosed && r.beds > 0 && r.heaters > 0),
  },
  {
    id: 'cloth',
    label: 'Weave cloth and build an armchair',
    phase: 2,
    check: (s) => s.countBuilt((f) => FEATURES[f - 1].key === 'armchair') > 0,
  },
  {
    id: 'medicine',
    label: 'Grow healroot and harvest 5 herbal medicine',
    phase: 3,
    // Harvested, not just held: a gift of supplies doesn't count.
    check: (s) => produced(s, 'herbalMedicine') >= 5,
    progress: (s) => `${Math.min(5, produced(s, 'herbalMedicine'))}/5`,
  },
  {
    id: 'tend',
    label: 'Have a doctor tend a wound or illness',
    phase: 3,
    check: (s) => s.stats.tended > 0,
  },
  {
    id: 'friends',
    label: 'Two colonists become friends',
    phase: 3,
    check: (s) => {
      const living = s.living();
      return living.some((a) =>
        living.some((b) => a !== b && relationLabel(a, b) !== null && relationLabel(a, b) !== 'Rival'),
      );
    },
  },
  {
    id: 'raid',
    label: 'Repel a raid (draft colonists with Q)',
    phase: 3,
    check: (s) => s.stats.raidsRepelled > 0,
    hidden: (s) => s.story.difficulty === 'peaceful',
  },
  {
    id: 'hunt',
    label: 'Hunt an animal for meat and leather',
    phase: 3,
    check: (s) => s.stats.hunted > 0,
  },
  {
    id: 'researchBench',
    label: 'Build a research bench and pick a project',
    phase: 4,
    check: (s) => s.countBuilt((f) => featureDef(f).researchStation) > 0 && s.research.current !== null,
  },
  {
    id: 'research3',
    label: 'Complete three research projects',
    phase: 4,
    check: (s) => s.research.done.length >= 3,
    progress: (s) => `${Math.min(3, s.research.done.length)}/3`,
  },
  {
    id: 'hearth',
    label: 'Research Hearths and build a stone hearth',
    phase: 4,
    check: (s) => s.countBuilt((f) => FEATURES[f - 1].key === 'hearth') > 0,
  },
  {
    id: 'bow',
    label: 'Research Archery, then craft and equip a recurve bow (or better)',
    phase: 4,
    check: (s) => s.living().some((c) => weaponScore(c.weapon, c.weaponQuality) >= weaponScore('recurveBow', 4)),
  },
  {
    id: 'sandbags',
    label: 'Research Fortifications and build sandbags',
    phase: 4,
    // (The colony's own: not a siege party's.)
    check: (s) =>
      s
        .buildingTiles()
        .some((i) => FEATURES[s.world.feature[i] - 1].key === 'sandbags' && !s.raid?.siege?.built?.includes(i)),
  },
  {
    id: 'winter',
    label: 'Survive your first winter',
    phase: 4,
    check: (s) => s.stats.wintersSurvived > 0,
  },
  {
    id: 'survive',
    label: 'Reach day 12, losing no more than one colonist',
    phase: 3,
    check: (s) => s.day >= 12 && s.living().length >= populationFor(s.world.width).colonists - 1,
    progress: (s) => `day ${Math.min(12, s.day)}/12`,
  },
  {
    id: 'power',
    label: 'Research Electricity and build a generator',
    phase: 5,
    check: (s) => s.countBuilt((f) => !!featureDef(f).power && featureDef(f).power!.output > 0) > 0,
  },
  {
    id: 'coldStore',
    label: 'Keep food cold in an icebox or freezer room',
    phase: 5,
    // Actually cold: a running icebox or a stockpile in a freezing room.
    check: (s) => s.coldStorageCount() > 0,
  },
  {
    id: 'tame',
    label: 'Tame an animal (Tame tool, Handle work)',
    phase: 5,
    check: (s) => s.stats.tamed > 0,
  },
  {
    id: 'fineMeals',
    label: 'Cook 5 fine meals (needs Cooking 6)',
    phase: 5,
    check: (s) => produced(s, 'fineMeal') >= 5,
    progress: (s) => `${Math.min(5, produced(s, 'fineMeal'))}/5`,
  },
  {
    id: 'parkas',
    label: 'Dress everyone in a parka (research Tailoring)',
    phase: 5,
    // On the tundra everyone lands in one: nothing to do.
    hidden: (s) => s.biome === 'tundra',
    check: (s) => s.living().length > 0 && s.living().every((c) => c.apparel?.item === itemId('parka')),
    progress: (s) => `${s.living().filter((c) => c.apparel?.item === itemId('parka')).length}/${s.living().length}`,
  },
  {
    id: 'recVariety',
    label: 'Offer three kinds of recreation',
    phase: 5,
    check: (s) => recreationKinds(s) >= 3,
    progress: (s) => `${Math.min(3, recreationKinds(s))}/3`,
  },
  {
    id: 'chess',
    label: 'Have two colonists play a game of chess',
    phase: 5,
    check: (s) => (s.stats.chessGames ?? 0) > 0,
  },
  {
    id: 'instrument',
    label: 'Build a musical instrument',
    phase: 5,
    check: (s) => s.countBuilt((f) => !!featureDef(f).joy?.instrument) > 0,
  },
  {
    id: 'concert',
    label: 'Hold a concert (a player with Artistic 6+, in the evening)',
    phase: 5,
    check: (s) => (s.stats.concerts ?? 0) > 0,
  },
  {
    id: 'feast',
    label: 'Hold a harvest feast (meals in store at the autumn festival)',
    phase: 5,
    check: (s) => (s.stats.feasts ?? 0) > 0,
  },
  {
    id: 'wedding',
    label: 'Celebrate a wedding',
    phase: 5,
    check: (s) => (s.stats.weddings ?? 0) > 0,
  },
  {
    id: 'funeral',
    label: 'Give a fallen colonist a funeral (build a grave)',
    phase: 5,
    hidden: (s) => !s.colonists.some((c) => c.health.dead),
    check: (s) => (s.stats.funerals ?? 0) > 0,
  },
  {
    id: 'memorial',
    label: 'Raise a memorial stone to the fallen',
    phase: 5,
    hidden: (s) => !s.colonists.some((c) => c.health.dead),
    check: (s) => (s.stats.memorials ?? 0) > 0,
  },
  {
    id: 'sculpture',
    label: 'Carve a sculpture (Art work)',
    phase: 5,
    check: (s) => (s.stats.sculptures ?? 0) > 0,
  },
  {
    id: 'fineArt',
    label: 'Carve an excellent sculpture or a masterwork',
    phase: 5,
    check: (s) => (s.stats.bestArt ?? 0) >= EXCELLENT,
  },
  {
    id: 'impressiveRoom',
    label: 'Make a room magnificent (sculptures help most)',
    phase: 5,
    check: (s) => s.bestImpressiveness() >= MAGNIFICENT_ROOM,
    progress: (s) => `${Math.min(MAGNIFICENT_ROOM, s.bestImpressiveness())}/${MAGNIFICENT_ROOM}`,
  },
  {
    id: 'population',
    label: 'Grow the colony to full strength',
    phase: 5,
    check: (s) => s.living().length >= populationFor(s.world.width).maxColonists,
    progress: (s) => `${s.living().length}/${populationFor(s.world.width).maxColonists}`,
  },
  {
    id: 'firstChild',
    label: 'Welcome a child born in the valley',
    phase: 5,
    check: (s) => (s.stats.births ?? 0) > 0,
  },
  {
    id: 'bread',
    label: 'Bake bread from your own grain',
    phase: 5,
    check: (s) => (s.stats.produced.bread ?? 0) > 0,
  },
  {
    id: 'iron',
    label: 'Smelt iron from ore',
    phase: 5,
    check: (s) => (s.stats.produced.iron ?? 0) > 0,
  },
  {
    id: 'recruit',
    label: 'Take a raider prisoner and win them over',
    phase: 5,
    check: (s) => (s.stats.recruited ?? 0) > 0,
    // No raiders come on Peaceful, so no prisoners: the phase must be able to close without it.
    hidden: (s) => s.story.difficulty === 'peaceful',
  },
  {
    id: 'secondWinter',
    label: 'Survive a second winter',
    phase: 5,
    check: (s) => s.stats.wintersSurvived >= 2,
  },
  {
    id: 'beaconResearch',
    label: 'Research the signal beacon',
    phase: 6,
    check: (s) => s.isResearched('signalBeacon'),
  },
  {
    id: 'beaconBuilt',
    label: 'Build a signal beacon and power it',
    phase: 6,
    check: (s) => s.beacon.hours > 0 || s.beacon.answeredAt !== undefined || s.beacon.choice !== undefined,
  },
  {
    id: 'beaconSignal',
    label: 'Keep the beacon transmitting for five days',
    phase: 6,
    check: (s) => s.beacon.answeredAt !== undefined || s.beacon.choice !== undefined,
    progress: (s) => `${Math.min(TRANSMIT_HOURS, s.beacon.hours)}/${TRANSMIT_HOURS} hours`,
  },
  {
    id: 'shipChoice',
    label: 'Meet the ship: board it, or stay',
    phase: 6,
    check: (s) => s.beacon.choice !== undefined,
  },
  // Generations: the long game, goals the colony's own story brings.
  {
    id: 'grownUp',
    label: 'Raise a child born in the colony to adulthood',
    phase: 7,
    check: (s) => s.colonists.some((c) => c.parents.length > 0 && c.age >= ADULT),
  },
  {
    id: 'thirdGeneration',
    label: 'See a third generation born',
    phase: 7,
    // (Babies count from birth: they're kept apart from the colonists until they can walk.)
    check: (s) =>
      [...s.colonists, ...s.infants].some((c) => c.parents.some((p) => (s.colonists[p]?.parents.length ?? 0) > 0)),
  },
  {
    id: 'elder',
    label: 'See a colonist live to 65',
    phase: 7,
    // Turning 65 here: a wanderer who joined at 70 ticked it off on day 2.
    check: (s) => (s.stats.reachedElder ?? 0) > 0,
    progress: (s) => `oldest ${Math.floor(Math.max(0, ...s.living().map((c) => c.age)))}`,
  },
  {
    id: 'siegeSeenOff',
    label: 'See off a siege',
    phase: 7,
    check: (s) => (s.stats.siegesSeenOff ?? 0) > 0,
    hidden: (s) => s.story.difficulty === 'peaceful',
  },
  {
    id: 'beastSlain',
    label: 'Bring down the great beast',
    phase: 7,
    check: (s) => (s.stats.greatBeastSlain ?? 0) > 0,
    hidden: (s) => s.story.difficulty === 'peaceful',
  },
  {
    id: 'allies',
    label: 'Fight alongside the Meadow Kin',
    phase: 7,
    check: (s) => (s.stats.alliesCame ?? 0) > 0,
    hidden: (s) => s.story.difficulty === 'peaceful',
  },
  {
    id: 'cavern',
    label: 'Break into a cavern deep below',
    phase: 7,
    check: (s) => (s.stats.breaches ?? 0) > 0,
    hidden: (s) => s.story.difficulty === 'peaceful',
  },
  // Mastery: what a long-settled colony can do that a young one can't.
  {
    id: 'winterHarvest',
    label: 'Bring in a harvest in winter',
    phase: 8,
    check: (s) => (s.stats.winterHarvests ?? 0) > 0,
  },
  {
    id: 'steel',
    label: 'Learn Steelmaking',
    phase: 8,
    check: (s) => s.isResearched('steelmaking'),
  },
  {
    id: 'masterCraft',
    label: 'Craft something of masterwork quality',
    phase: 8,
    check: (s) => (s.stats.bestCraft ?? 0) >= MASTERWORK,
  },
  {
    id: 'thiefCaught',
    label: 'Bring down a thief before they get away',
    phase: 8,
    check: (s) => (s.stats.thievesCaught ?? 0) > 0,
    hidden: (s) => s.story.difficulty === 'peaceful',
  },
  {
    id: 'cleanDefence',
    label: 'See off a raid with nobody left down',
    phase: 8,
    check: (s) => (s.stats.cleanDefences ?? 0) > 0,
    hidden: (s) => s.story.difficulty === 'peaceful',
  },
  {
    id: 'wealthy',
    label: 'Grow the colony to 60,000 silver in wealth',
    phase: 8,
    check: (s) => colonyWealth(s) >= 60000,
    progress: (s) => `${Math.round(colonyWealth(s) / 1000)}k`,
  },
  {
    id: 'allResearch',
    label: 'Learn every research project',
    phase: 8,
    // (Further study is never done.)
    check: (s) => RESEARCH.every((r) => r.repeatable || s.isResearched(r.key)),
    progress: (s) => `${s.research.done.length}/${RESEARCH.filter((r) => !r.repeatable).length}`,
  },
  {
    id: 'decade',
    label: 'Keep the colony going for ten years',
    phase: 8,
    check: (s) => s.totalHours / 24 >= 10 * DAYS_PER_YEAR,
    progress: (s) => `${Math.min(10, Math.floor(s.totalHours / 24 / DAYS_PER_YEAR))}/10 years`,
  },
];
