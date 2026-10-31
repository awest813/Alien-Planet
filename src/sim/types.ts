export type JobType =
  | 'mine'
  | 'chop'
  | 'forage'
  | 'construct'
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
}

export interface Skills {
  mining: number;
  construction: number;
  plants: number;
  cooking: number;
  medicine: number;
  combat: number;
  crafting: number;
}

// At equal priority, colonists pick work in this order.
export const WORK_TYPES = [
  'doctor',
  'cooking',
  'construction',
  'growing',
  'mining',
  'plantCutting',
  'crafting',
  'hauling',
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
}

export interface Colonist {
  id: number;
  name: string;
  color: string;
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
  health: Health;
  // Drafted colonists stop working and follow move orders; they shoot at enemies in range.
  drafted: boolean;
  draftTarget: number;
  // Ticks until the colonist can attack again.
  cooldown: number;
}

export interface Injury {
  label: string;
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
}

export type Weapon = 'bow' | 'knife';

export interface Enemy {
  id: number;
  name: string;
  faction: number;
  tile: number;
  path: number[];
  moveProgress: number;
  hp: number;
  weapon: Weapon;
  cooldown: number;
  fleeing: boolean;
  // Tick when the enemy next re-plans its route.
  repathAt: number;
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
  | { type: 'build'; feature: number; tiles: number[] }
  | { type: 'priority'; colonist: number; work: WorkTypeKey; value: number }
  | { type: 'schedule'; colonist: number; hour: number; slot: ScheduleSlot }
  | { type: 'bill'; recipe: number; target: number }
  | { type: 'draft'; colonist: number; drafted: boolean }
  | { type: 'move'; colonist: number; tile: number };

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
