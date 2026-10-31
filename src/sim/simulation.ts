import {
  COMFORT_MAX,
  COMFORT_MIN,
  CROP_MIN_TEMP,
  describeRoom,
  measureRooms,
  outdoorTemperature,
  updateRoomTemperatures,
} from './climate';
import {
  COLONIST_COLORS,
  COLONIST_NAMES,
  FEATURES,
  ITEMS,
  NONE,
  RECIPES,
  THOUGHTS,
  TRAITS,
  featureDef,
  isFood,
  itemDef,
  itemId,
  matchesIngredient,
  terrainDef,
} from './defs';
import { animalName, populateWildlife, updateAnimals } from './animals';
import { COLONIST_WEAPONS, RaidState, attackAnimal, canAttack, colonistCombat, updateEnemies } from './combat';
import {
  COLONIST_COUNT,
  MAP_SIZE,
  MOVE_SPEED,
  NIGHT_END,
  NIGHT_START,
  SLOW_TICKS,
  START_HOUR,
  TICKS_PER_HOUR,
} from './constants';
import {
  bleedingOf,
  healthFactor,
  healthyState,
  needsBedRest,
  needsTending,
  painOf,
  tend,
  updateHealth,
} from './health';
import { Pathfinder } from './pathfinding';
import { emptyXp, learn, rollPassions, rustSkills, skillFactor } from './skills';
import { PassRegions, Rooms, computePassRegions, computeRooms } from './regions';
import { Rng } from './rng';
import { relationLabel, rollTraits, socialThoughts, traitFactor, traitValue, updateSocial } from './social';
import { Difficulty, StoryState, freshStory, updateStoryteller } from './storyteller';
import {
  Bill,
  Animal,
  Colonist,
  Command,
  Enemy,
  Job,
  JobType,
  LogEntry,
  NightResult,
  Priorities,
  Rect,
  RoomInfo,
  ScheduleSlot,
  Shot,
  SkillKey,
  Skills,
  Stats,
  WORK_TYPES,
  WorkTypeKey,
} from './types';
import { Designation, GROW_ZONE, World, growZoneCrop } from './world';
import { generateWorld } from './worldgen';

export { COLONIST_COUNT, MAP_SIZE, NIGHT_END, NIGHT_START, START_HOUR, TICKS_PER_HOUR } from './constants';
const LOG_LIMIT = 60;
const STORY_LIMIT = 200;

// Need rates, per tick.
const FOOD_DECAY = 1 / (TICKS_PER_HOUR * 16);
const REST_DECAY = 1 / (TICKS_PER_HOUR * 18);
const REST_GAIN_BED = 1 / (TICKS_PER_HOUR * 7);
const REST_GAIN_GROUND = 1 / (TICKS_PER_HOUR * 9);
const JOY_DECAY = 1 / (TICKS_PER_HOUR * 24);
const JOY_GAIN_WALK = 1 / (TICKS_PER_HOUR * 4);
const EAT_TICKS = 60;

// Mood below this for a couple of hours risks a mental break.
export const BREAK_THRESHOLD = 12;
const NICE_ROOM = 25;

export type SimEvent = 'dusk' | 'dawn' | 'raid';

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

const WORK_JOBS = new Set<JobType>(['mine', 'chop', 'forage', 'construct', 'deconstruct', 'sow', 'harvestCrop']);
const TEND_TICKS = 80;
const MEDICINE = itemId('herbalMedicine');
const RECURVE_BOW = itemId('recurveBow');

// Plants are worked from their own tile; rock, buildings, and workbenches from an adjacent one.
const standsOn = (type: JobType): boolean =>
  type === 'chop' || type === 'forage' || type === 'sow' || type === 'harvestCrop';

const defaultSchedule = (): ScheduleSlot[] =>
  Array.from({ length: 24 }, (_, h) => (h >= NIGHT_START || h < NIGHT_END ? 'S' : 'A'));

// Every colonist starts willing to do everything at normal priority.
const defaultPriorities = (): Priorities => Object.fromEntries(WORK_TYPES.map((work) => [work, 3])) as Priorities;

function createColonist(id: number, name: string, tile: number, rng: Rng): Colonist {
  const skills: Skills = {
    mining: rng.int(1, 9),
    construction: rng.int(1, 9),
    plants: rng.int(1, 9),
    cooking: rng.int(1, 9),
    crafting: rng.int(1, 9),
    medicine: rng.int(1, 9),
    combat: rng.int(1, 9),
  };
  return {
    id,
    name,
    color: COLONIST_COLORS[id % COLONIST_COLORS.length],
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
    health: healthyState(),
    drafted: false,
    draftTarget: -1,
    cooldown: 0,
    skillXp: emptyXp(),
    passions: rollPassions(rng),
    weapon: 'bow',
    practicedAt: {},
  };
}

// Which skill a piece of work trains.
function skillFor(type: JobType): SkillKey {
  switch (type) {
    case 'mine':
      return 'mining';
    case 'construct':
    case 'deconstruct':
      return 'construction';
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
export class Simulation {
  public tick = 0;
  public readonly reservations = new Map<string, number>();
  public stats: Stats = { produced: {}, hauled: 0, built: 0, tended: 0, raidsRepelled: 0, kills: 0, hunted: 0 };
  public log: LogEntry[] = [];
  public storyLog: StoryEntry[] = [];
  public story: StoryState = freshStory();
  public enemies: Enemy[] = [];
  public nextEnemyId = 0;
  public raid: RaidState | null = null;
  public animals: Animal[] = [];
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
  private contentsVersion = -1;
  private wasNight = false;

  constructor(
    public readonly world: World,
    public readonly colonists: Colonist[],
    public readonly seed: number,
    public readonly rng: Rng,
  ) {
    this.pathfinder = new Pathfinder(world);
    this.wasNight = this.isNight();
  }

  public static newColony(seed: number, difficulty: Difficulty = 'standard'): Simulation {
    const { world, spawn } = generateWorld(MAP_SIZE, MAP_SIZE, seed);
    const rng = new Rng(seed ^ 0x9e3779b9);
    const names = [...COLONIST_NAMES];
    const colonists: Colonist[] = [];
    // Land on dry ground around the spawn point.
    const spots = [spawn, ...world.neighbors(spawn)].filter(
      (i) => world.isPassable(i) && terrainDef(world.terrain[i]).buildable,
    );
    for (let id = 0; id < COLONIST_COUNT; id++) {
      const name = names.splice(rng.int(0, names.length - 1), 1)[0];
      const c = createColonist(id, name, spots[id % spots.length], rng);
      for (const other of colonists) {
        introduce(c, other, rng);
      }
      colonists.push(c);
    }
    // Survival rations to tide the colony over until the first harvest.
    world.dropItemNear(spawn, itemId('meal'), 18);
    const sim = new Simulation(world, colonists, seed, rng);
    sim.story = freshStory(difficulty);
    populateWildlife(sim, 10, spawn);
    sim.addLog(
      'Five colonists have landed with a few days of rations. Designate work and they will get to it.',
      'info',
      true,
    );
    return sim;
  }

  public living(): Colonist[] {
    return this.colonists.filter((c) => !c.health.dead);
  }

  // A traveller joins at the map edge nearest the colony. Returns the new colonist, if any.
  public addWanderer(): Colonist | null {
    const anchor = this.living()[0];
    if (!anchor) {
      return null;
    }
    const w = this.world;
    const region = this.regionOf(anchor.tile);
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
    const taken = new Set(this.colonists.map((c) => c.name));
    const free = COLONIST_NAMES.filter((n) => !taken.has(n));
    const name =
      free.length > 0 ? this.rng.pick(free) : `${this.rng.pick(COLONIST_NAMES)} ${this.colonists.length + 1}`;
    const c = createColonist(this.colonists.length, name, edge, this.rng);
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
  }

  public isNight(): boolean {
    const h = this.hour;
    return h >= NIGHT_START || h < NIGHT_END;
  }

  public outdoorTemperature(): number {
    const coldSnap = this.tick < this.story.coldSnapUntil ? 12 : 0;
    return outdoorTemperature(this.totalHours, this.seed) - coldSnap;
  }

  // ---- Main loop ----

  public step(): void {
    this.tick++;
    this.ensureRegions();

    const night = this.isNight();
    if (night !== this.wasNight) {
      this.wasNight = night;
      if (night) {
        this.addLog('Night falls.');
        this.events.push('dusk');
      } else {
        this.onDawn();
        this.events.push('dawn');
      }
    }

    updateStoryteller(this);

    const slow = this.tick % SLOW_TICKS === 0;
    if (slow) {
      this.updateClimate();
      this.growCrops();
      updateSocial(this);
    }

    for (const c of this.colonists) {
      if (c.health.dead) {
        continue;
      }
      if (slow) {
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

    if (slow) {
      this.checkObjectives();
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
        this.forRect(cmd.rect, (i) => {
          const f = w.feature[i];
          if (f === NONE) {
            return;
          }
          const def = featureDef(f);
          const ok = cmd.kind === 'deconstruct' ? !!def.build : def.harvest?.work === cmd.kind;
          if (ok) {
            w.designation[i] = value;
            w.markDirty(i);
          }
        });
        break;
      }
      case 'cancel':
        this.forRect(cmd.rect, (i) => {
          if (w.designation[i] !== Designation.NONE) {
            w.designation[i] = Designation.NONE;
            w.markDirty(i);
          }
          if (w.blueprint[i] !== NONE) {
            this.cancelBlueprint(i);
          }
        });
        break;
      case 'zone':
        this.forRect(cmd.rect, (i) => {
          const terrain = terrainDef(w.terrain[i]);
          const ok = cmd.zone >= GROW_ZONE ? terrain.fertility > 0 : terrain.buildable;
          if (cmd.zone === 0 || ok) {
            w.zone[i] = cmd.zone;
            w.markDirty(i);
          }
        });
        break;
      case 'build':
        for (const i of cmd.tiles) {
          this.placeBlueprint(i, cmd.feature);
        }
        break;
      case 'priority':
        this.colonists[cmd.colonist].priorities[cmd.work] = Math.max(0, Math.min(4, cmd.value));
        break;
      case 'schedule':
        this.colonists[cmd.colonist].schedule[cmd.hour] = cmd.slot;
        break;
      case 'bill':
        this.bills[cmd.recipe].target = Math.max(0, cmd.target);
        break;
      case 'draft': {
        const c = this.colonists[cmd.colonist];
        if (!c || c.health.dead || (cmd.drafted && c.health.downed)) {
          break;
        }
        this.endJob(c);
        c.drafted = cmd.drafted;
        c.draftTarget = -1;
        break;
      }
      case 'hunt':
        for (const a of this.animals) {
          const x = w.xOf(a.tile);
          const y = w.yOf(a.tile);
          const { x0, y0, x1, y1 } = cmd.rect;
          if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) {
            a.hunted = cmd.add;
          }
        }
        break;
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
    const room = this.rooms.room[i];
    return room >= 0 && this.rooms.enclosed[room] ? this.roomTemps[room] : this.outdoorTemperature();
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
    const reachable = new Set(this.living().map((c) => this.regions.region[c.tile]));
    const counted = new Set<number>();
    for (let i = 0; i < this.world.size; i++) {
      const room = this.rooms.room[i];
      if (room < 0 || counted.has(room) || !this.rooms.enclosed[room] || this.rooms.sizes[room] < 4) {
        continue;
      }
      if (reachable.has(this.regions.region[i])) {
        return true;
      }
      counted.add(room);
    }
    return false;
  }

  public countFeature(test: (featureId: number) => boolean): number {
    let n = 0;
    for (let i = 0; i < this.world.size; i++) {
      const f = this.world.feature[i];
      if (f !== NONE && test(f)) {
        n++;
      }
    }
    return n;
  }

  public resourceTotals(): { item: number; stored: number; total: number }[] {
    const w = this.world;
    const totals = ITEMS.map((item) => ({ item: item.id, stored: 0, total: 0 }));
    for (let i = 0; i < w.size; i++) {
      const type = w.itemType[i];
      if (type !== NONE) {
        const entry = totals[type - 1];
        entry.total += w.itemCount[i];
        if (w.zone[i] !== 0 && w.zone[i] < GROW_ZONE) {
          entry.stored += w.itemCount[i];
        }
      }
    }
    for (const c of this.colonists) {
      if (c.carrying) {
        totals[c.carrying.item - 1].total += c.carrying.count;
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
    return [...traits, ...thoughts];
  }

  public inMentalBreak(c: Colonist): boolean {
    return c.breakUntil > this.tick;
  }

  public describe(c: Colonist): string {
    if (c.health.dead) {
      return 'Dead';
    }
    if (c.health.downed) {
      return 'Downed, waiting for a doctor';
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
      return 'Mental break: wandering in a daze';
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
      case 'deconstruct':
        return `Deconstructing ${featureName(job.target)}`;
      case 'sow': {
        const crop = growZoneCrop(w.zone[job.target]);
        return crop !== NONE ? `Sowing ${featureDef(crop).name.toLowerCase()}` : 'Sowing';
      }
      case 'harvestCrop':
        return `Harvesting ${featureName(job.target)}`;
      case 'haul':
        return `Hauling ${itemDef(job.item).name.toLowerCase()}`;
      case 'deliver':
        return `Delivering ${itemDef(job.item).name.toLowerCase()} to ${blueprintName(job.target)}`;
      case 'craft':
        return RECIPES[job.line].name;
      case 'eat':
        return job.stage === 2 ? 'Eating' : 'Getting something to eat';
      case 'joy':
        return job.target >= 0 && w.feature[job.target] !== NONE
          ? (featureDef(w.feature[job.target]).joy?.kind ?? 'Relaxing')
          : 'Going for a walk';
      case 'sleep':
        if (!c.sleeping) {
          return 'Going to bed';
        }
        return this.isIndoors(c.tile) ? 'Sleeping' : 'Sleeping outside';
      case 'wander':
        return 'Wandering';
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
        return 'Picking up a recurve bow';
    }
  }

  // Progress of the work a colonist is actively doing, for progress bars.
  public jobProgress(c: Colonist): { tile: number; ratio: number } | null {
    const job = c.job;
    if (!job || c.path.length > 0) {
      return null;
    }
    if (job.type === 'tend' && job.stage === 2) {
      return { tile: this.colonists[job.patient].tile, ratio: Math.min(1, job.progress / TEND_TICKS) };
    }
    if (job.type === 'craft' && job.stage === 1 && this.isAtWorkSpot(c, job.target, false)) {
      return { tile: job.target, ratio: Math.min(1, job.progress / RECIPES[job.line].work) };
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
      this.storyLog.push({ day: this.day, hour: Math.floor(this.hour), text, tone });
      if (this.storyLog.length > STORY_LIMIT) {
        this.storyLog.shift();
      }
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
    this.contentsVersion = -1;
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
    if (this.contentsVersion !== this.world.featureVersion) {
      this.contentsVersion = this.world.featureVersion;
      this.roomContents = measureRooms(this.world, this.rooms);
    }
    return this.roomContents;
  }

  // Restores room temperatures from per-tile values (used when loading a save).
  public setTileTemperatures(temps: Float32Array): void {
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

  public tileTemperatures(): Float32Array {
    const temps = new Float32Array(this.world.size);
    for (let i = 0; i < this.world.size; i++) {
      temps[i] = this.temperatureAt(i);
    }
    return temps;
  }

  private updateClimate(): void {
    updateRoomTemperatures(this.roomTemps, this.rooms, this.contents(), this.outdoorTemperature());
  }

  private growCrops(): void {
    const w = this.world;
    const hour = this.hour;
    if (hour < NIGHT_END || hour >= 20) {
      return;
    }
    for (let i = 0; i < w.size; i++) {
      const f = w.feature[i];
      if (f === NONE || w.growth[i] >= 1) {
        continue;
      }
      const crop = featureDef(f).crop;
      if (!crop || this.temperatureAt(i) < CROP_MIN_TEMP) {
        continue;
      }
      const before = Math.floor(w.growth[i] * 3);
      const fertility = terrainDef(w.terrain[i]).fertility;
      w.growth[i] = Math.min(1, w.growth[i] + (SLOW_TICKS * fertility) / (crop.growDays * 14 * TICKS_PER_HOUR));
      if (Math.floor(w.growth[i] * 3) !== before) {
        w.markDirty(i);
      }
    }
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
    if (!FEATURES[feature - 1]?.build || i < 0 || i >= w.size || !terrainDef(w.terrain[i]).buildable) {
      return false;
    }
    const existing = w.feature[i];
    return w.blueprint[i] !== feature && (existing === NONE || !!featureDef(existing).harvest);
  }

  private placeBlueprint(i: number, feature: number): void {
    const w = this.world;
    if (!this.canPlaceBlueprint(i, feature)) {
      return;
    }
    if (w.blueprint[i] !== NONE) {
      this.cancelBlueprint(i);
    }
    const harvest = w.feature[i] !== NONE ? featureDef(w.feature[i]).harvest : undefined;
    if (harvest) {
      w.designation[i] = { mine: Designation.MINE, chop: Designation.CHOP, forage: Designation.FORAGE }[harvest.work];
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
    w.blueprint[i] = NONE;
    w.clearDelivered(i);
    if (w.feature[i] === NONE) {
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
    for (const c of this.living()) {
      rustSkills(c, this.tick);
    }
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
        this.addLog('The colony made it through the first night, but not everyone had shelter.', 'warn');
      }
    }
    this.addLog(`Day ${this.day} begins.`);
  }

  private checkObjectives(): void {
    for (const objective of OBJECTIVES) {
      if (!this.objectivesDone[objective.id] && objective.check(this)) {
        this.objectivesDone[objective.id] = true;
        this.addLog(`Objective complete: ${objective.label}`, 'good');
      }
    }
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
    const temp = this.temperatureAt(c.tile);
    if (temp < 0) {
      keys.push('freezing');
    } else if (temp < COMFORT_MIN) {
      keys.push('cold');
    } else if (temp > COMFORT_MAX) {
      keys.push('hot');
    }
    if (c.health.disease) {
      keys.push('sick');
    }
    if (painOf(c) > 0.15) {
      keys.push('inPain');
    }
    keys.push(...socialThoughts(this, c));
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
      this.addThought(c, 'recoveredFromBreak');
      this.addLog(`${c.name} has calmed down.`, 'info');
    }
    c.lowMoodTicks = c.mood < BREAK_THRESHOLD ? c.lowMoodTicks + SLOW_TICKS : 0;
    if (c.lowMoodTicks > TICKS_PER_HOUR * 2 && this.rng.next() < 0.05) {
      c.lowMoodTicks = 0;
      c.breakUntil = this.tick + this.rng.int(3, 5) * TICKS_PER_HOUR;
      this.endJob(c);
      this.addLog(`${c.name} has had enough and is wandering around in a daze.`, 'warn');
    }
  }

  private updateNeeds(c: Colonist): void {
    const n = c.needs;
    n.food = Math.max(0, n.food - FOOD_DECAY * traitFactor(c, 'foodDecay') * (c.sleeping ? 0.5 : 1));
    if (!c.sleeping) {
      n.joy = Math.max(0, n.joy - JOY_DECAY * traitFactor(c, 'joyDecay'));
    }
    if (c.sleeping) {
      const inBed = this.world.feature[c.tile] !== NONE && featureDef(this.world.feature[c.tile]).bed;
      n.rest = Math.min(1, n.rest + (inBed ? REST_GAIN_BED : REST_GAIN_GROUND));
    } else {
      n.rest = Math.max(0, n.rest - REST_DECAY);
    }
    if (c.job?.type === 'joy' && c.job.target < 0 && c.path.length > 0) {
      n.joy = Math.min(1, n.joy + JOY_GAIN_WALK);
    }
  }

  // ---- Reservations ----

  private isReserved(key: string, c: Colonist): boolean {
    const owner = this.reservations.get(key);
    return owner !== undefined && owner !== c.id;
  }

  private reserve(c: Colonist, key: string): void {
    this.reservations.set(key, c.id);
    c.reserved.push(key);
  }

  private release(c: Colonist, key: string): void {
    if (this.reservations.get(key) === c.id) {
      this.reservations.delete(key);
    }
    c.reserved = c.reserved.filter((k) => k !== key);
  }

  public endJob(c: Colonist): void {
    if ((c.job?.type === 'sleep' || c.job?.type === 'rest') && c.sleeping) {
      this.wakeUp(c);
    }
    for (const key of c.reserved) {
      if (this.reservations.get(key) === c.id) {
        this.reservations.delete(key);
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
      return;
    }
    // Fighting takes the whole tick; drafted colonists otherwise only follow move orders.
    if (colonistCombat(this, c)) {
      this.fighting.add(c.id);
      return;
    }
    this.fighting.delete(c.id);
    if (c.drafted) {
      if (c.path.length > 0) {
        this.move(c);
      }
      return;
    }

    if (this.inMentalBreak(c)) {
      if (c.job && c.job.type !== 'wander') {
        this.endJob(c);
      }
    } else {
      const slot = c.schedule[Math.floor(this.hour)];
      // Doctors get out of bed (or drop their work) for someone who is bleeding or collapsed.
      if (
        this.tick % SLOW_TICKS === 0 &&
        c.job?.type !== 'tend' &&
        c.job?.type !== 'eat' &&
        c.priorities.doctor > 0 &&
        this.urgentPatient(c)
      ) {
        this.endJob(c);
        this.tryTend(c);
      }
      const job = c.job?.type;
      // Starving colonists drop everything, sleep included, to eat. A failed food search is
      // retried a little later rather than every tick.
      const starving = c.needs.food < 0.1 && job !== 'eat';
      if (starving && (this.nextFoodSearch.get(c.id) ?? 0) <= this.tick) {
        if (!this.tryEat(c)) {
          this.nextFoodSearch.set(c.id, this.tick + SLOW_TICKS);
        }
      }
      if (c.job?.type === 'eat') {
        // Eating comes first.
      } else if (job === 'sleep') {
        if (slot !== 'S' && c.needs.rest >= 0.9) {
          this.endJob(c);
        }
      } else if (((slot === 'S' && c.needs.rest < 0.98) || c.needs.rest < 0.1) && job !== 'rest' && job !== 'tend') {
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
    return MOVE_SPEED / (w.moveCost(next) * (diagonal ? Math.SQRT2 : 1));
  }

  private move(c: Colonist): void {
    const next = c.path[0];
    if (!this.world.isPassable(next)) {
      this.endJob(c);
      return;
    }
    c.moveProgress += this.moveRate(c);
    if (c.moveProgress >= 1) {
      c.tile = next;
      c.path.shift();
      c.moveProgress = 0;
    }
  }

  private findJob(c: Colonist): void {
    if (this.inMentalBreak(c)) {
      this.startWander(c);
      return;
    }
    if (c.carrying && this.tryStash(c)) {
      return;
    }
    const slot = c.schedule[Math.floor(this.hour)];
    const food = c.needs.food;
    if (((food < 0.3 && slot !== 'W') || food < 0.15) && this.tryEat(c)) {
      return;
    }
    if (c.weapon === 'bow' && this.tryEquip(c)) {
      return;
    }
    if (needsBedRest(c)) {
      // The walking wounded patch up others (or, failing that, themselves) before lying down.
      if (c.priorities.doctor > 0 && (this.urgentPatient(c) || needsTending(this, c)) && this.tryTend(c)) {
        return;
      }
      this.startRest(c);
      return;
    }
    if ((slot === 'J' || (slot === 'A' && c.needs.joy < 0.3)) && c.needs.joy < 0.95 && this.tryJoy(c)) {
      return;
    }
    if (slot !== 'J' && this.tryWorkByPriority(c)) {
      return;
    }
    this.startWander(c);
  }

  private tryWorkByPriority(c: Colonist): boolean {
    // After a few harvests in a row, clear up the mess before cutting more.
    if (c.priorities.hauling > 0 && c.workStreak >= 3 && this.tryHaul(c)) {
      return true;
    }
    for (let p = 1; p <= 4; p++) {
      for (const work of WORK_TYPES) {
        if (c.priorities[work] === p && this.tryWorkType(c, work)) {
          return true;
        }
      }
    }
    return false;
  }

  private tryWorkType(c: Colonist, work: WorkTypeKey): boolean {
    switch (work) {
      case 'doctor':
        return this.tryTend(c);
      case 'construction':
        return this.tryConstruct(c) || this.tryDeliver(c) || this.tryDesignations(c, [Designation.DECONSTRUCT]);
      case 'growing':
        return this.tryHarvestCrop(c) || this.trySow(c);
      case 'mining':
        return this.tryDesignations(c, [Designation.MINE]);
      case 'plantCutting':
        return this.tryDesignations(c, [Designation.CHOP, Designation.FORAGE]);
      case 'hunting':
        return this.tryHunt(c);
      case 'cooking':
        return this.tryBill(c, 'cooking');
      case 'crafting':
        return this.tryBill(c, 'crafting');
      case 'hauling':
        return this.tryHaul(c);
    }
  }

  private stepJob(c: Colonist): void {
    const job = c.job!;
    switch (job.type) {
      case 'mine':
      case 'chop':
      case 'forage':
      case 'construct':
      case 'deconstruct':
      case 'sow':
      case 'harvestCrop':
        this.stepWork(c, job);
        break;
      case 'deliver':
        this.stepDeliver(c, job);
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
        this.stepTend(c, job);
        break;
      case 'hunt':
        this.stepHunt(c, job);
        break;
      case 'equip':
        this.stepEquip(c, job);
        break;
      case 'wander':
        if (job.wait-- <= 0) {
          this.endJob(c);
        }
        break;
    }
  }

  // Up to `limit` tiles passing `test`, nearest first. `bias` adds to a tile's distance.
  public nearest(from: number, test: (i: number) => boolean, limit = 4, bias?: (i: number) => number): number[] {
    const w = this.world;
    const best: { i: number; d: number }[] = [];
    for (let i = 0; i < w.size; i++) {
      if (!test(i)) {
        continue;
      }
      const d = w.distance(from, i) + (bias ? bias(i) : 0);
      if (best.length === limit && d >= best[best.length - 1].d) {
        continue;
      }
      let k = best.length;
      while (k > 0 && best[k - 1].d > d) {
        k--;
      }
      best.splice(k, 0, { i, d });
      if (best.length > limit) {
        best.pop();
      }
    }
    return best.map((b) => b.i);
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
    const f = w.feature[i];
    if (d === Designation.NONE || f === NONE) {
      return false;
    }
    const def = featureDef(f);
    if (d === Designation.DECONSTRUCT) {
      return !!def.build;
    }
    return def.harvest?.work === JOB_FOR_DESIGNATION[d];
  }

  private constructable(i: number): boolean {
    const w = this.world;
    return w.blueprint[i] !== NONE && w.feature[i] === NONE && w.blueprintNeeds(i).length === 0;
  }

  private sowable(i: number): boolean {
    const w = this.world;
    return (
      growZoneCrop(w.zone[i]) !== NONE &&
      w.feature[i] === NONE &&
      w.blueprint[i] === NONE &&
      w.itemType[i] === NONE &&
      terrainDef(w.terrain[i]).fertility > 0
    );
  }

  private harvestable(i: number): boolean {
    const f = this.world.feature[i];
    return f !== NONE && !!featureDef(f).crop && this.world.growth[i] >= 1;
  }

  private tryConstruct(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    const targets = this.nearest(
      c.tile,
      (i) => this.constructable(i) && !this.isReserved(`w${i}`, c) && this.hasWorkSpot(i, false, region),
    );
    return this.startWorkJob(c, 'construct', targets, region);
  }

  private tryHarvestCrop(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    const targets = this.nearest(
      c.tile,
      (i) => this.harvestable(i) && !this.isReserved(`w${i}`, c) && this.regions.region[i] === region,
    );
    return this.startWorkJob(c, 'harvestCrop', targets, region);
  }

  private trySow(c: Colonist): boolean {
    if (this.temperatureAt(c.tile) < CROP_MIN_TEMP) {
      return false;
    }
    const region = this.regionOf(c.tile);
    const targets = this.nearest(
      c.tile,
      (i) => this.sowable(i) && !this.isReserved(`w${i}`, c) && this.regions.region[i] === region,
    );
    return this.startWorkJob(c, 'sow', targets, region);
  }

  private tryDesignations(c: Colonist, kinds: number[]): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const targets = this.nearest(
      c.tile,
      (i) =>
        kinds.includes(w.designation[i]) &&
        this.designationValid(i) &&
        !this.isReserved(`w${i}`, c) &&
        this.hasWorkSpot(i, standsOn(JOB_FOR_DESIGNATION[w.designation[i]]), region),
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
        return this.constructable(job.target);
      case 'sow':
        return this.sowable(job.target);
      case 'harvestCrop':
        return this.harvestable(job.target);
      default:
        return this.designationValid(job.target);
    }
  }

  private workAmount(job: Job): number {
    const w = this.world;
    switch (job.type) {
      case 'construct':
        return featureDef(w.blueprint[job.target]).build!.work;
      case 'sow':
        return featureDef(growZoneCrop(w.zone[job.target])).crop!.sowWork;
      case 'harvestCrop':
        return featureDef(w.feature[job.target]).crop!.harvestWork;
      case 'deconstruct':
        return featureDef(w.feature[job.target]).build!.work * 0.5;
      default:
        return featureDef(w.feature[job.target]).harvest!.amount;
    }
  }

  private workSpeed(c: Colonist, type: JobType | 'cooking' | 'crafting' | 'doctor'): number {
    const s = c.skills;
    const plants = !['mine', 'cooking', 'crafting', 'doctor', 'construct', 'deconstruct'].includes(type);
    const skill =
      type === 'mine'
        ? s.mining
        : type === 'cooking'
          ? s.cooking
          : type === 'crafting'
            ? s.crafting
            : type === 'doctor'
              ? s.medicine
              : type === 'construct' || type === 'deconstruct'
                ? s.construction
                : s.plants;
    const moodFactor = c.mood < 25 ? 0.85 : c.mood > 70 ? 1.1 : 1;
    const traits = traitFactor(c, 'workSpeed') * (plants ? traitFactor(c, 'plantSpeed') : 1);
    return skillFactor(skill) * moodFactor * traits * healthFactor(c);
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
    w.markDirty(t);
    if (w.progress[t] >= this.workAmount(job)) {
      this.completeWork(c, job);
    }
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
        const harvest = featureDef(w.feature[t]).harvest!;
        w.setFeature(t, NONE);
        w.designation[t] = Designation.NONE;
        w.dropItemNear(t, harvest.item, harvest.count);
        this.produce(harvest.item, harvest.count);
        c.workStreak++;
        break;
      }
      case 'harvestCrop': {
        const crop = featureDef(w.feature[t]).crop!;
        w.setFeature(t, NONE);
        w.dropItemNear(t, crop.item, crop.count);
        this.produce(crop.item, crop.count);
        c.workStreak++;
        break;
      }
      case 'sow':
        w.setFeature(t, growZoneCrop(w.zone[t]));
        break;
      case 'deconstruct': {
        const build = featureDef(w.feature[t]).build!;
        w.setFeature(t, NONE);
        w.designation[t] = Designation.NONE;
        for (const cost of build.cost) {
          w.dropItemNear(t, cost.item, Math.floor(cost.count * 0.75));
        }
        break;
      }
      case 'construct': {
        const f = w.blueprint[t];
        w.blueprint[t] = NONE;
        w.clearDelivered(t);
        // Anything lying on the tile gets pushed aside.
        const displacedType = w.itemType[t];
        const displaced = displacedType !== NONE ? w.takeItem(t, w.itemCount[t]) : 0;
        w.setFeature(t, f);
        if (displaced > 0) {
          w.dropItemNear(t, displacedType, displaced);
        }
        this.pushColonistsOff(t);
        this.stats.built++;
        const def = featureDef(f);
        if (!def.blocksRoom || def.door) {
          const name = def.name.toLowerCase();
          this.addLog(`${c.name} built ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}.`);
        }
        break;
      }
    }
    this.endJob(c);
  }

  private pushColonistsOff(t: number): void {
    const w = this.world;
    if (w.isPassable(t)) {
      return;
    }
    const free = w.neighbors(t).find((n) => w.isPassable(n));
    for (const other of this.living()) {
      if (other.tile === t) {
        if (free !== undefined) {
          other.tile = free;
        }
        this.endJob(other);
      }
    }
    for (const e of this.enemies) {
      if (e.tile === t && free !== undefined) {
        e.tile = free;
        e.path = [];
        e.moveProgress = 0;
      }
    }
    for (const a of this.animals) {
      if (a.tile === t && free !== undefined) {
        a.tile = free;
        a.path = [];
        a.moveProgress = 0;
      }
    }
  }

  // ---- Construction deliveries ----

  private tryDeliver(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    // Only consider blueprints whose missing materials actually exist, so a cluster of blueprints
    // waiting on something unavailable can't hide others that could be supplied.
    const available = this.availableItems(c, region);
    const blueprints = this.nearest(
      c.tile,
      (i) =>
        w.blueprint[i] !== NONE &&
        w.blueprintNeeds(i).some((need) => available.has(need.item)) &&
        !this.isReserved(`d${i}`, c) &&
        this.hasWorkSpot(i, false, region),
      6,
    );
    const sourceCache = new Map<number, number | undefined>();
    for (const bp of blueprints) {
      for (const need of w.blueprintNeeds(bp)) {
        if (!sourceCache.has(need.item)) {
          sourceCache.set(
            need.item,
            this.nearest(
              c.tile,
              (i) => w.itemType[i] === need.item && !this.isReserved(`i${i}`, c) && this.regions.region[i] === region,
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
    const blueprints = this.nearest(
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

  private isStockpile(i: number): boolean {
    const zone = this.world.zone[i];
    return zone !== 0 && zone < GROW_ZONE;
  }

  private stockpileSpot(item: number, near: number, region: number, c: Colonist): number | undefined {
    const w = this.world;
    return this.nearest(
      near,
      (i) =>
        this.isStockpile(i) &&
        this.regions.region[i] === region &&
        w.canHoldItem(i, item) &&
        !this.isReserved(`s${i}`, c),
      1,
      // Prefer topping up existing stacks of the same item.
      (i) => (w.itemType[i] === item ? 0 : 3),
    )[0];
  }

  // Item types lying unreserved somewhere in `region`.
  private availableItems(c: Colonist, region: number): Set<number> {
    const w = this.world;
    const items = new Set<number>();
    for (let i = 0; i < w.size; i++) {
      if (w.itemType[i] !== NONE && this.regions.region[i] === region && !this.isReserved(`i${i}`, c)) {
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
    const loose = new Set<number>();
    let hasStockpile = false;
    for (let i = 0; i < w.size; i++) {
      if (this.isStockpile(i)) {
        hasStockpile = true;
      } else if (w.itemType[i] !== NONE && this.regions.region[i] === region) {
        loose.add(w.itemType[i]);
      }
    }
    if (!hasStockpile || loose.size === 0) {
      return false;
    }
    const storable = new Set([...loose].filter((item) => this.stockpileSpot(item, c.tile, region, c) !== undefined));
    if (storable.size === 0) {
      return false;
    }
    const sources = this.nearest(
      c.tile,
      (i) =>
        storable.has(w.itemType[i]) &&
        !this.isStockpile(i) &&
        this.regions.region[i] === region &&
        !this.isReserved(`i${i}`, c),
      4,
    );
    for (const source of sources) {
      const item = w.itemType[source];
      const dest = this.stockpileSpot(item, source, region, c);
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
      this.world.dropItemNear(c.tile, c.carrying.item, c.carrying.count);
      c.carrying = null;
    }
  }

  private stepHaul(c: Colonist, job: Job): void {
    const w = this.world;
    if (job.stage === 0) {
      if (c.tile !== job.source || w.itemType[job.source] !== job.item || c.carrying) {
        this.endJob(c);
        return;
      }
      const taken = w.takeItem(job.source, itemDef(job.item).stackLimit);
      this.release(c, `i${job.source}`);
      c.carrying = { item: job.item, count: taken };
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
    const leftover = w.addItem(job.target, c.carrying.item, before);
    this.stats.hauled += before - leftover;
    c.workStreak = 0;
    c.carrying.count = leftover;
    if (leftover <= 0) {
      c.carrying = null;
    }
    this.endJob(c);
  }

  // ---- Production bills ----

  private tryBill(c: Colonist, bench: 'cooking' | 'crafting'): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    for (const recipe of RECIPES) {
      if (recipe.bench !== bench || this.stockOf(recipe.product.item) >= this.bills[recipe.id].target) {
        continue;
      }
      const station = this.nearest(
        c.tile,
        (i) =>
          w.feature[i] !== NONE &&
          featureDef(w.feature[i]).workbench === bench &&
          !this.isReserved(`w${i}`, c) &&
          this.hasWorkSpot(i, false, region),
        1,
      )[0];
      if (station === undefined) {
        continue;
      }
      const source = this.nearest(
        c.tile,
        (i) =>
          w.itemType[i] !== NONE &&
          matchesIngredient(w.itemType[i], recipe.ingredient) &&
          w.itemCount[i] >= recipe.ingredient.count &&
          this.regions.region[i] === region &&
          !this.isReserved(`i${i}`, c),
        1,
      )[0];
      if (source === undefined) {
        continue;
      }
      const path = this.pathfinder.find(c.tile, [source]);
      if (!path) {
        continue;
      }
      this.reserve(c, `w${station}`);
      this.reserve(c, `i${source}`);
      this.assign(c, this.makeJob('craft', station, { source, item: w.itemType[source], line: recipe.id }), path);
      return true;
    }
    return false;
  }

  private stepCraft(c: Colonist, job: Job): void {
    const w = this.world;
    const recipe = RECIPES[job.line];
    const stationOk = w.feature[job.target] !== NONE && featureDef(w.feature[job.target]).workbench === recipe.bench;
    if (job.stage === 0) {
      if (c.tile !== job.source || w.itemType[job.source] !== job.item || c.carrying || !stationOk) {
        this.endJob(c);
        return;
      }
      if (w.itemCount[job.source] < recipe.ingredient.count) {
        this.endJob(c);
        return;
      }
      c.carrying = { item: job.item, count: w.takeItem(job.source, recipe.ingredient.count) };
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

    if (!stationOk || !c.carrying || !this.isAtWorkSpot(c, job.target, false)) {
      this.endJob(c);
      return;
    }
    job.progress += this.workSpeed(c, recipe.bench);
    learn(this, c, recipe.bench === 'cooking' ? 'cooking' : 'crafting');
    if (job.progress >= recipe.work) {
      c.carrying = null;
      w.dropItemNear(c.tile, recipe.product.item, recipe.product.count);
      this.produce(recipe.product.item, recipe.product.count);
      this.endJob(c);
    }
  }

  // ---- Eating ----

  private tryEat(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const source = this.nearest(
      c.tile,
      (i) =>
        w.itemType[i] !== NONE &&
        isFood(w.itemType[i]) &&
        this.regions.region[i] === region &&
        !this.isReserved(`i${i}`, c),
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
      c.carrying = { item: job.item, count: w.takeItem(job.source, wanted) };
      this.release(c, `i${job.source}`);
      // Find a table to eat at.
      const region = this.regionOf(c.tile);
      const table = this.nearest(
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
      return;
    }

    if (++job.progress < EAT_TICKS) {
      return;
    }
    if (c.carrying) {
      const def = itemDef(c.carrying.item);
      c.needs.food = Math.min(1, c.needs.food + def.nutrition * c.carrying.count);
      if (def.category === 'meal') {
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
  }

  // ---- Recreation ----

  private tryJoy(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const spot = this.nearest(
      c.tile,
      (i) =>
        w.feature[i] !== NONE &&
        !!featureDef(w.feature[i]).joy &&
        this.regions.region[i] === region &&
        !this.isReserved(`j${i}`, c),
      1,
    )[0];
    if (spot !== undefined) {
      const path = this.pathfinder.find(c.tile, [spot]);
      if (path) {
        this.reserve(c, `j${spot}`);
        this.assign(c, this.makeJob('joy', spot, { wait: TICKS_PER_HOUR * 2 }), path);
        return true;
      }
    }
    // No recreation furniture: go for a walk.
    const x = w.xOf(c.tile);
    const y = w.yOf(c.tile);
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = x + this.rng.int(-10, 10);
      const ty = y + this.rng.int(-10, 10);
      if (!w.inBounds(tx, ty) || this.regions.region[w.idx(tx, ty)] !== region) {
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

  private stepJoy(c: Colonist, job: Job): void {
    const w = this.world;
    const joy = job.target >= 0 && w.feature[job.target] !== NONE ? featureDef(w.feature[job.target]).joy : undefined;
    if (!joy || c.tile !== job.target) {
      this.endJob(c);
      return;
    }
    c.needs.joy = Math.min(1, c.needs.joy + 1 / (TICKS_PER_HOUR * joy.hoursToFull));
    const slot = c.schedule[Math.floor(this.hour)];
    if (c.needs.joy >= 0.99 || --job.wait <= 0 || (slot !== 'J' && c.needs.joy > 0.9)) {
      this.endJob(c);
    }
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
    const free = (i: number) => this.regions.region[i] === region && !this.isReserved(`b${i}`, c);
    const isBed = (i: number) => w.feature[i] !== NONE && featureDef(w.feature[i]).bed;
    const spot =
      this.nearest(c.tile, (i) => isBed(i) && this.isIndoors(i) && free(i), 1)[0] ??
      this.nearest(c.tile, (i) => w.feature[i] === NONE && w.isPassable(i) && this.isIndoors(i) && free(i), 1)[0] ??
      this.nearest(c.tile, (i) => isBed(i) && free(i), 1)[0] ??
      c.tile;
    const path = this.pathfinder.find(c.tile, [spot]) ?? [];
    this.reserve(c, `b${spot}`);
    c.restTicks = 0;
    c.restOutside = 0;
    c.restCold = 0;
    this.assign(c, this.makeJob(type, path.length > 0 || spot === c.tile ? spot : c.tile), path);
  }

  // ---- Hunting and gear ----

  private tryHunt(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    const prey = this.animals
      .filter((a) => a.hunted && a.hp > 0 && this.regions.region[a.tile] === region && !this.isReserved(`h${a.id}`, c))
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
    if (!prey || prey.hp <= 0 || !prey.hunted) {
      this.endJob(c);
      return;
    }
    // Shoot from a little inside bow range; otherwise close in a few steps at a time.
    if (canAttack(this, c, prey.tile, COLONIST_WEAPONS[c.weapon].range - 1)) {
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
    c.path = path.slice(0, 6);
  }

  // Swap the starting short bow for a recurve bow lying in storage.
  private tryEquip(c: Colonist): boolean {
    const w = this.world;
    if (!w.itemType.includes(RECURVE_BOW)) {
      return false;
    }
    const region = this.regionOf(c.tile);
    const bow = this.nearest(
      c.tile,
      (i) => w.itemType[i] === RECURVE_BOW && this.regions.region[i] === region && !this.isReserved(`i${i}`, c),
      1,
    )[0];
    const path = bow !== undefined ? this.pathfinder.find(c.tile, [bow]) : null;
    if (bow === undefined || !path) {
      return false;
    }
    this.reserve(c, `i${bow}`);
    this.assign(c, this.makeJob('equip', -1, { source: bow }), path);
    return true;
  }

  private stepEquip(c: Colonist, job: Job): void {
    const w = this.world;
    if (c.tile === job.source && w.itemType[job.source] === RECURVE_BOW && w.takeItem(job.source, 1) > 0) {
      c.weapon = 'recurveBow';
      this.addLog(`${c.name} picked up a recurve bow.`);
    }
    this.endJob(c);
  }

  // ---- Doctoring ----

  private urgentPatient(c: Colonist): boolean {
    const region = this.regionOf(c.tile);
    return this.living().some(
      (p) =>
        p !== c &&
        (p.health.downed || bleedingOf(p) > 0) &&
        needsTending(this, p) &&
        !this.isReserved(`t${p.id}`, c) &&
        this.regions.region[p.tile] === region,
    );
  }

  private tryTend(c: Colonist): boolean {
    const w = this.world;
    const region = this.regionOf(c.tile);
    // Others first (self-treatment is a last resort), then the most urgent: downed, then bleeding.
    const urgency = (p: Colonist) =>
      (p === c ? 1000 : 0) -
      (p.health.downed ? 100 : 0) -
      (bleedingOf(p) > 0 ? 50 + p.health.bloodLoss * 200 : 0) +
      w.distance(c.tile, p.tile);
    const patient = this.living()
      .filter((p) => needsTending(this, p) && !this.isReserved(`t${p.id}`, c) && this.regions.region[p.tile] === region)
      .sort((a, b) => urgency(a) - urgency(b))[0];
    if (!patient) {
      return false;
    }
    this.reserve(c, `t${patient.id}`);
    const medicine = this.nearest(
      c.tile,
      (i) => w.itemType[i] === MEDICINE && this.regions.region[i] === region && !this.isReserved(`i${i}`, c),
      1,
    )[0];
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

  private stepTend(c: Colonist, job: Job): void {
    const w = this.world;
    const patient = this.colonists[job.patient];
    if (!patient || !needsTending(this, patient)) {
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
      const medicine = c.carrying?.item === MEDICINE;
      if (medicine) {
        c.carrying = null;
      }
      tend(this, c, patient, medicine);
      this.endJob(c);
    }
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
    if (this.temperatureAt(c.tile) < COMFORT_MIN) {
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
    if (w.feature[c.tile] === NONE || !featureDef(w.feature[c.tile]).bed) {
      this.addThought(c, 'sleptOnGround');
    } else {
      const room = this.roomAt(c.tile);
      if (room?.enclosed && room.beds > 1) {
        this.addThought(c, 'sharedBedroom');
      } else if (room?.enclosed && room.impressiveness >= NICE_ROOM) {
        this.addThought(c, 'niceBedroom');
      }
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
      if (t === c.tile || this.regions.region[t] !== region) {
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

export interface ObjectiveDef {
  id: string;
  label: string;
  phase: 1 | 2 | 3;
  check: (sim: Simulation) => boolean;
  progress?: (sim: Simulation) => string;
}

const produced = (s: Simulation, key: string) => s.stats.produced[key] ?? 0;

// Phase 1 is the vertical slice (gather, haul, build, survive the night);
// phase 2 asks the colony to feed, entertain, and warm itself.
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
    label: 'Designate a stockpile zone',
    phase: 1,
    check: (s) => s.world.zone.some((z) => z !== 0 && z < GROW_ZONE),
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
    check: (s) => s.hasShelter(),
  },
  {
    id: 'bed',
    label: 'Build a bed',
    phase: 1,
    check: (s) => s.countFeature((f) => featureDef(f).bed) > 0,
  },
  {
    id: 'night',
    label: 'Survive the first night with everyone indoors',
    phase: 1,
    check: (s) => s.firstNight === 'success',
  },
  {
    id: 'grow',
    label: 'Create a growing zone',
    phase: 2,
    check: (s) => s.world.zone.some((z) => z >= GROW_ZONE),
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
    check: (s) => s.countFeature((f) => !!featureDef(f).joy) > 0,
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
    check: (s) => s.countFeature((f) => FEATURES[f - 1].key === 'armchair') > 0,
  },
  {
    id: 'medicine',
    label: 'Grow healroot and stock 5 herbal medicine',
    phase: 3,
    check: (s) => s.stockOf(MEDICINE) >= 5,
    progress: (s) => `${Math.min(5, s.stockOf(MEDICINE))}/5`,
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
  },
  {
    id: 'hunt',
    label: 'Hunt an animal for meat and leather',
    phase: 3,
    check: (s) => s.stats.hunted > 0,
  },
  {
    id: 'bow',
    label: 'Craft a recurve bow from leather and equip it',
    phase: 3,
    check: (s) => s.living().some((c) => c.weapon === 'recurveBow'),
  },
  {
    id: 'sandbags',
    label: 'Build sandbags for cover',
    phase: 3,
    check: (s) => s.countFeature((f) => FEATURES[f - 1].key === 'sandbags') > 0,
  },
  {
    id: 'survive',
    label: 'Reach day 12 with at least 4 colonists alive',
    phase: 3,
    check: (s) => s.day >= 12 && s.living().length >= 4,
    progress: (s) => `day ${Math.min(12, s.day)}/12`,
  },
];
