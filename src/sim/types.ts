import type { JoyKind } from './defs';
import type { StockpilePriority } from './world';
export type JobType =
  | 'mine'
  | 'chop'
  | 'forage'
  | 'construct'
  | 'sculpt'
  | 'deconstruct'
  | 'sow'
  | 'harvestCrop'
  | 'haul'
  | 'deliver'
  | 'craft'
  | 'eat'
  | 'joy'
  | 'sleep'
  | 'tend'
  | 'rest'
  | 'hunt'
  | 'equip'
  | 'research'
  | 'refuel'
  | 'fish'
  | 'feed'
  | 'warmUp'
  | 'rescue'
  | 'tame'
  | 'extinguish'
  | 'shelter'
  | 'clean'
  | 'capture'
  | 'warden'
  | 'wander';

export interface Job {
  type: JobType;
  // Work tile, blueprint, workbench, stockpile destination, joy spot, or bed depending on the job.
  target: number;
  // Item source tile for hauling, deliveries, crafting, and eating.
  source: number;
  item: number;
  count: number;
  // Blueprint cost line for deliveries, recipe id for crafting.
  line: number;
  // 0 = heading to source / work spot, 1 = carrying to target, 2 = working at target.
  stage: number;
  // Work done on this job (crafting, eating).
  progress: number;
  // Ticks left (wandering, recreation).
  wait: number;
  // Colonist id being tended, or -1.
  patient: number;
  // Recreation: listening to a concert rather than using the building at `target`.
  listening?: boolean;
  // At a gathering (party, festival, wedding, funeral) centred on `target`.
  gathering?: boolean;
}

export interface Skills {
  mining: number;
  construction: number;
  plants: number;
  cooking: number;
  medicine: number;
  combat: number;
  crafting: number;
  research: number;
  animals: number;
  // Sculpting and playing music.
  artistic: number;
}

export type SkillKey = keyof Skills;

export const SKILL_KEYS: SkillKey[] = [
  'mining',
  'construction',
  'plants',
  'cooking',
  'crafting',
  'medicine',
  'combat',
  'research',
  'animals',
  'artistic',
];

// 0: no passion, 1: interested, 2: burning. Passions speed up learning.
export type Passion = 0 | 1 | 2;

// At equal priority, colonists pick work in this order.
export const WORK_TYPES = [
  'doctor',
  'cooking',
  'construction',
  'growing',
  'plantCutting',
  'mining',
  'hunting',
  'handling',
  'warden',
  'crafting',
  'art',
  'research',
  'hauling',
  'cleaning',
] as const;
export type WorkTypeKey = (typeof WORK_TYPES)[number];

// 1 is the highest priority, 4 the lowest, 0 means the colonist won't do it.
export type Priorities = Record<WorkTypeKey, number>;

// Anything, Work, Joy (recreation), Sleep.
export type ScheduleSlot = 'A' | 'W' | 'J' | 'S';

export interface Needs {
  food: number;
  rest: number;
  joy: number;
}

export interface TimedThought {
  key: string;
  expires: number;
}

export interface Carried {
  item: number;
  count: number;
  // Days of freshness left, for perishable food (wear left, for clothing).
  fresh?: number;
  // Cook's skill for meals, craftsmanship for clothing.
  quality?: number;
  // A crafter gathering a recipe carries one bundle per ingredient: these are the ones after the first.
  extra?: Carried[];
  // A bundle gathered from different kinds of item (berries and potatoes for a meal): the parts,
  // so setting it down gives back exactly what was picked up.
  mix?: Carried[];
}

export interface WornApparel {
  item: number;
  quality: number;
  // 1 when new, worn out at 0.
  wear: number;
}

export interface Colonist {
  id: number;
  name: string;
  color: string;
  // Age in years (fractional). Children grow faster than adults age (see lifespans.ts).
  age: number;
  // Key into backstories.json: who they were before the valley.
  backstory: string;
  // Ids of their parents, for those born in the colony.
  parents: number[];
  // When their child is due, while the couple is expecting.
  expectingUntil?: number;
  // The child's other parent (set when the child was conceived).
  expectingWith?: number;
  // The kind of mental break they're in (while breakUntil is ahead).
  breakKind?: 'daze' | 'sulk' | 'binge' | 'tantrum';
  tile: number;
  // Remaining tiles to walk; path[0] is the tile being entered.
  path: number[];
  // 0..1 progress from `tile` towards `path[0]`.
  moveProgress: number;
  skills: Skills;
  priorities: Priorities;
  schedule: ScheduleSlot[];
  needs: Needs;
  mood: number;
  thoughts: TimedThought[];
  job: Job | null;
  carrying: Carried | null;
  reserved: string[];
  // Harvest jobs completed since the last haul.
  workStreak: number;
  sleeping: boolean;
  // The current sleep session, for thoughts on waking.
  restTicks: number;
  restOutside: number;
  restCold: number;
  // Ticks spent tonight, and how many of them outdoors (asleep or not), for the first-night objective.
  nightTicks: number;
  exposedTicks: number;
  // A mental break lasts until this tick.
  breakUntil: number;
  lowMoodTicks: number;
  traits: string[];
  // Opinion of each other colonist by id, -100..100.
  opinions: Record<number, number>;
  // Colonist id of their partner, or -1.
  lover: number;
  // Who they married (-1: nobody, or widowed).
  spouse: number;
  health: Health;
  // Drafted colonists stop working and follow move orders; they shoot at enemies in range.
  drafted: boolean;
  draftTarget: number;
  // Ticks until the colonist can attack again.
  cooldown: number;
  // Experience towards the next level of each skill.
  skillXp: Record<SkillKey, number>;
  passions: Record<SkillKey, Passion>;
  // Key of the weapon in hand (see WEAPONS), and its craftsmanship: better-made weapons hit harder.
  weapon: string;
  weaponQuality: number;
  // Body armor worn over clothes.
  armor: WornArmor | null;
  // How a drafted colonist fights: find cover, stand fast, or close in.
  stance: Stance;
  // Raider this colonist was told to concentrate on (-1: their own choice).
  focus: number;
  // A carried tool kit speeds up mining, chopping, building and farming, and wears out.
  tool: { quality: number; wear: number } | null;
  apparel: WornApparel | null;
  // Tick each skill was last practised, for rust.
  practicedAt: Partial<Record<SkillKey, number>>;
  // Recreation had lately, by kind (in needs filled; it fades day by day).
  recentJoy: Partial<Record<JoyKind, number>>;
}

export type Stance = 'cover' | 'hold' | 'charge';

export interface WornArmor {
  item: number;
  quality: number;
  // Condition left, 1 (new) to 0 (falls apart).
  wear: number;
}

export interface Animal {
  id: number;
  kind: string;
  tile: number;
  path: number[];
  moveProgress: number;
  hp: number;
  // Marked by the player for hunting.
  hunted: boolean;
  // Marked by the player for taming, and tamed.
  taming: boolean;
  tame: boolean;
  // Colonist id it is attacking, or -1.
  revengeOn: number;
  cooldown: number;
  // Tick when it next considers wandering somewhere.
  restUntil: number;
  // Tick when its anger wears off.
  revengeUntil: number;
  // Part of a pack gone mad: it goes after one colonist after another until its fury runs out.
  manhunter?: boolean;
  // A wild predator's current prey (an animal id), and when it'll next be hungry.
  chasing?: number;
  fedUntil?: number;
  // A wild animal moving on: it walks off the map and is gone.
  leaving?: boolean;
  // Snapped at its handler during a taming attempt: only the handler fends it off.
  lashOut?: boolean;
  // A predator that lost its quarry waits until then before hunting again.
  huntAgainAt?: number;
  // The beast a neighbouring faction asked the colony to hunt down: tougher, and stays until it's dead.
  quarry?: boolean;
  // A named animal (the great beast), how many times tougher than its kind, and whether its leaving was
  // told.
  name?: string;
  toughness?: number;
  told?: boolean;
}

export interface Injury {
  label: string;
  // Where it landed (see body.ts); missing on wounds from older saves.
  part?: 'torso' | 'arm' | 'leg' | 'hand' | 'head' | 'eye';
  // How bad it was when it happened.
  peak?: number;
  // Infection, 0..1 (0: none); treated once a doctor has seen to it.
  infection?: number;
  treated?: boolean;
  wasInfected?: boolean;
  // Tended somewhere filthy, which raises the risk of infection.
  dirty?: boolean;
  // 0..1 contribution to pain; injuries heal by shrinking this to 0.
  severity: number;
  // Blood loss per hour while untended.
  bleeding: number;
  // Tend quality 0..1; 0 means untended.
  tended: number;
}

export interface Disease {
  key: string;
  label: string;
  // Reaching 1 is fatal.
  severity: number;
  // Reaching 1 first means recovery.
  immunity: number;
  // Tending slows the disease until this tick.
  tendedUntil: number;
}

export interface Health {
  injuries: Injury[];
  bloodLoss: number;
  disease: Disease | null;
  // Collapsed from pain or blood loss: can't move or work until it eases.
  downed: boolean;
  dead: boolean;
  // 0..1 build-up from cold or heat beyond what clothing can handle; fatal at 1.
  hypothermia: number;
  heatstroke: number;
  // Hours of food poisoning left.
  poisoned: number;
  // Lasting marks of old wounds (see body.ts).
  scars?: {
    part: 'torso' | 'arm' | 'leg' | 'hand' | 'head' | 'eye';
    kind: 'limp' | 'stiffHand' | 'lostEye' | 'scar';
  }[];
}

export interface Enemy {
  id: number;
  name: string;
  faction: number;
  tile: number;
  path: number[];
  moveProgress: number;
  hp: number;
  // Key of the weapon carried (see WEAPONS).
  weapon: string;
  // Share of each blow turned aside by armor (0 without), and the armor item, dropped on defeat.
  armor: number;
  armorItem?: number;
  // Fighting skill, on the colonists' Combat scale.
  skill: number;
  // Walking speed as a share of a colonist's.
  speed: number;
  // 0..1: rattled by shots landing close; spoils aim and sends them looking for cover.
  suppression: number;
  cooldown: number;
  fleeing: boolean;
  // Tick when the enemy next re-plans its route (and, for archers, its firing position).
  repathAt: number;
  // Wall this raider is trying to break through to reach the colonists.
  breachTarget?: number;
  // Where a ranged raider has chosen to shoot from.
  post?: number;
  // Next tick a badly hurt raider weighs whether to run for it.
  nerveCheckAt?: number;
}

// A raider who went down rather than dying: lying where they fell until captured (or until they die
// of their wounds), then held in a prisoner bed until they join the colony or are let go.
export interface Captive {
  id: number;
  name: string;
  faction: number;
  tile: number;
  state: 'downed' | 'prisoner';
  // Marked with the Capture order.
  capture: boolean;
  // When they fell, and (once a prisoner) when they were taken.
  since: number;
  // 0..1, as a colonist's food need.
  food: number;
  // Talks still needed to win them over (fractional): at zero, each visit may recruit them.
  resistance: number;
  // Their Combat skill, kept if they join.
  skill: number;
  // Tick of the last warden's talk.
  lastVisit: number;
  // Hours spent starving, which can kill a prisoner left unfed.
  hungryHours: number;
}

// A baby, carried and cared for by a parent until old enough to toddle about as a colonist.
export interface Infant {
  id: number;
  name: string;
  age: number;
  parents: number[];
  // The colonist caring for them (a parent, or anyone if the parents are gone).
  carer: number;
}

// A recent attack, kept briefly so the renderer can draw it.
export interface Shot {
  from: number;
  to: number;
  hit: boolean;
  ranged: boolean;
  tick: number;
}

export type DesignationKind = 'mine' | 'chop' | 'forage' | 'deconstruct';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Bill {
  recipe: number;
  // Keep making the product until the colony holds this many.
  target: number;
}

// Every change the player makes goes through a command, so input can later be
// posted to a simulation running inside a Web Worker without touching the UI.
export type Command =
  | { type: 'designate'; rect: Rect; kind: DesignationKind }
  | { type: 'cancel'; rect: Rect }
  // `zone` is 0 to clear, STOCKPILE_ZONE, or GROW_ZONE + crop feature id.
  | { type: 'zone'; rect: Rect; zone: number }
  // Settings for the whole stockpile a tile belongs to: the item groups it refuses (a bit mask over
  // STORAGE_GROUPS) and its priority.
  | { type: 'stockpile'; tile: number; refused: number; priority: StockpilePriority }
  | { type: 'build'; feature: number; tiles: number[] }
  | { type: 'priority'; colonist: number; work: WorkTypeKey; value: number }
  | { type: 'schedule'; colonist: number; hour: number; slot: ScheduleSlot }
  | { type: 'bill'; recipe: number; target: number }
  | { type: 'draft'; colonist: number; drafted: boolean }
  | { type: 'move'; colonist: number; tile: number }
  | { type: 'stance'; colonist: number; stance: Stance }
  // Concentrate fire on a raider (-1 to stop); colonist -1 means every drafted colonist.
  | { type: 'focus'; colonist: number; enemy: number }
  | { type: 'hunt'; rect: Rect; add: boolean }
  | { type: 'tame'; rect: Rect; add: boolean }
  // Mark (or unmark) downed raiders in the rectangle to be taken prisoner.
  | { type: 'capture'; rect: Rect; add: boolean }
  // Let a prisoner go.
  | { type: 'release'; captive: number }
  // Lock (or unlock) a door: nobody passes a locked door, though raiders can break it down.
  | { type: 'lock'; tile: number; locked: boolean }
  // Forbid (or allow) the items in a rectangle: colonists leave forbidden items alone.
  | { type: 'forbid'; rect: Rect; on: boolean }
  | { type: 'research'; project: string | null }
  // Whether the colony keeps the seasonal festivals.
  | { type: 'festivals'; on: boolean }
  | { type: 'fulfilRequest' }
  | { type: 'declineRequest' }
  | { type: 'gift'; faction: number; silver: number }
  | { type: 'tribute'; faction: number }
  // The colony's policies (any left out stay as they are).
  | {
      type: 'policy';
      rations?: 'frugal' | 'normal' | 'generous';
      hours?: 'short' | 'normal' | 'long';
      restDays?: boolean;
    }
  // When the ship has landed: board it (the colony's story ends) or stay.
  | { type: 'shipChoice'; board: boolean }
  // Sell the sculpture on a tile to the visiting traders.
  | { type: 'sellArt'; tile: number };

export interface LogEntry {
  tick: number;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'danger';
}

export interface Stats {
  produced: Record<string, number>;
  hauled: number;
  built: number;
  tended: number;
  raidsRepelled: number;
  kills: number;
  hunted: number;
  tamed: number;
  wintersSurvived: number;
  // Games of chess played with someone.
  chessGames?: number;
  births?: number;
  // Furniture smashed in tantrums, and legendary works made.
  smashed?: number;
  elections?: number;
  // Favours done for the neighbours (and refused or let lapse), gifts sent, and tribute paid.
  requestsDone?: number;
  // Breaches from below, through deep mine shafts.
  breaches?: number;
  greatBeastSlain?: number;
  // Every death, by cause (the log only keeps the latest).
  deaths?: Record<string, number>;
  requestsFailed?: number;
  gifts?: number;
  tributes?: number;
  // Wounds that turned infected, and lasting injuries left by old wounds.
  infections?: number;
  scars?: number;
  obsessions?: number;
  legends?: number;
  // Raiders taken prisoner, and prisoners won over.
  captured?: number;
  recruited?: number;
  // Sculptures sold to traders.
  artSold?: number;
  // Concerts given, and the gatherings held.
  concerts?: number;
  parties?: number;
  feasts?: number;
  weddings?: number;
  funerals?: number;
  memorials?: number;
  // Sculptures finished, and the best quality reached (0–20).
  sculptures?: number;
  bestArt?: number;
}

// Kinds of gathering: some for fun, some rites everyone turns out for.
export type GatheringKind = 'party' | 'plantingDay' | 'harvestFestival' | 'midwinter' | 'wedding' | 'funeral';

// A gathering planned or under way, centred on `tile`.
export interface Gathering {
  kind: GatheringKind;
  tile: number;
  startsAt: number;
  endsAt: number;
  // Who threw the party (-1 for others).
  host: number;
  // The couple marrying, or the colonist being buried.
  couple?: [number, number];
  honoree?: number;
  started?: boolean;
  // Ticks each colonist has spent there (kept here rather than on their job, so a save keeps it).
  attended?: Record<number, number>;
}

// Someone who died: kept for burial, graves and memorials.
export interface Fallen {
  id: number;
  name: string;
  day: number;
  cause: string;
}

// A finished sculpture: how well it came out, what it shows, and who made it.
export interface Artwork {
  quality: number;
  title: string;
  artist: string;
  day: number;
  // A memorial: who it remembers (colonist ids).
  honors?: number[];
}

export type NightResult = 'pending' | 'success' | 'failed';

export interface RoomInfo {
  id: number;
  size: number;
  enclosed: boolean;
  role: string;
  temperature: number;
  impressiveness: number;
  beds: number;
  tables: number;
  heaters: number;
}
