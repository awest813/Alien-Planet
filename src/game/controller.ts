import { impressivenessLabel } from '../sim/climate';
import { FACTIONS, NONE, RECIPES, TRAITS, featureDef, featureId, itemDef, itemId, terrainDef } from '../sim/defs';
import { animalName } from '../sim/animals';
import { COLONIST_WEAPONS } from '../sim/combat';
import { bleedingOf, needsBedRest, painOf } from '../sim/health';
import { MAX_SKILL, SKILL_LABELS, xpToNext } from '../sim/skills';
import { relationLabel } from '../sim/social';
import { hashSeed } from '../sim/rng';
import { SAVE_VERSION, deserialize, serialize } from '../sim/serialize';
import { NIGHT_START, OBJECTIVES, Simulation, StoryEntry, TICKS_PER_HOUR } from '../sim/simulation';
import { Command, DesignationKind, LogEntry, Needs, Priorities, SKILL_KEYS, ScheduleSlot, Skills } from '../sim/types';
import { Designation, GROW_ZONE, STOCKPILE_ZONE } from '../sim/world';
import { Difficulty } from '../sim/storyteller';
import { SaveMeta, deleteSave, listSaves, readSave, writeSave } from './save-store';

export type Tool =
  | { kind: 'select' }
  | { kind: 'designate'; designation: DesignationKind }
  | { kind: 'cancel' }
  | { kind: 'zone'; zone: number }
  | { kind: 'build'; feature: number }
  | { kind: 'hunt' };

export interface ToolDef {
  id: string;
  label: string;
  hotkey: string;
  tool: Tool;
  group: 'orders' | 'zones' | 'build' | 'furniture';
  hint: string;
}

const build = (key: string, label: string, hotkey: string, group: ToolDef['group'], hint: string): ToolDef => ({
  id: key,
  label,
  hotkey,
  tool: { kind: 'build', feature: featureId(key) },
  group,
  hint,
});

export const TOOLS: ToolDef[] = [
  {
    id: 'select',
    label: 'Select',
    hotkey: 'Escape',
    tool: { kind: 'select' },
    group: 'orders',
    hint: 'Inspect tiles and colonists',
  },
  {
    id: 'mine',
    label: 'Mine',
    hotkey: 'm',
    tool: { kind: 'designate', designation: 'mine' },
    group: 'orders',
    hint: 'Drag over rock to mine it for granite',
  },
  {
    id: 'chop',
    label: 'Chop',
    hotkey: 'c',
    tool: { kind: 'designate', designation: 'chop' },
    group: 'orders',
    hint: 'Drag over trees to cut them for wood',
  },
  {
    id: 'forage',
    label: 'Forage',
    hotkey: 'g',
    tool: { kind: 'designate', designation: 'forage' },
    group: 'orders',
    hint: 'Drag over berry bushes to gather berries',
  },
  {
    id: 'deconstruct',
    label: 'Deconstruct',
    hotkey: 'r',
    tool: { kind: 'designate', designation: 'deconstruct' },
    group: 'orders',
    hint: 'Drag over buildings to take them apart',
  },
  {
    id: 'hunt',
    label: 'Hunt',
    hotkey: 'v',
    tool: { kind: 'hunt' },
    group: 'orders',
    hint: 'Drag over animals to hunt them for meat and leather (boars fight back)',
  },
  {
    id: 'cancel',
    label: 'Cancel',
    hotkey: 'x',
    tool: { kind: 'cancel' },
    group: 'orders',
    hint: 'Drag to remove orders and blueprints',
  },
  {
    id: 'stockpile',
    label: 'Stockpile',
    hotkey: 'z',
    tool: { kind: 'zone', zone: STOCKPILE_ZONE },
    group: 'zones',
    hint: 'Drag to mark storage; colonists haul items here',
  },
  {
    id: 'growPotatoes',
    label: 'Grow potatoes',
    hotkey: 'p',
    tool: { kind: 'zone', zone: GROW_ZONE + featureId('potatoPlant') },
    group: 'zones',
    hint: 'Drag over soil or grass to plant potatoes (food)',
  },
  {
    id: 'growCotton',
    label: 'Grow cotton',
    hotkey: 't',
    tool: { kind: 'zone', zone: GROW_ZONE + featureId('cottonPlant') },
    group: 'zones',
    hint: 'Drag over soil or grass to plant cotton (for cloth)',
  },
  {
    id: 'growHealroot',
    label: 'Grow healroot',
    hotkey: 'y',
    tool: { kind: 'zone', zone: GROW_ZONE + featureId('healrootPlant') },
    group: 'zones',
    hint: 'Drag over soil or grass to grow healroot (herbal medicine)',
  },
  {
    id: 'unzone',
    label: 'Clear zone',
    hotkey: 'u',
    tool: { kind: 'zone', zone: 0 },
    group: 'zones',
    hint: 'Drag to remove stockpile and growing zones',
  },
  build('woodWall', 'Wood wall', 'b', 'build', 'Drag a rectangle outline of walls (5 wood each)'),
  build('stoneWall', 'Granite wall', 'n', 'build', 'Drag a rectangle outline of walls (5 granite each)'),
  build('door', 'Door', 'o', 'build', 'Click a wall gap to place a door (10 wood)'),
  build('campfire', 'Campfire', 'f', 'build', 'Heats the room it is in (15 wood)'),
  build('sandbags', 'Sandbags', '', 'build', 'Cover: halves the chance of being hit from that side (4 granite)'),
  build('bed', 'Bed', 'e', 'furniture', 'Colonists sleep better in beds (20 wood)'),
  build('table', 'Table', 'l', 'furniture', 'Colonists dislike eating without a table (20 wood)'),
  build('stove', 'Stove', 'k', 'furniture', 'Cooks meals from raw food (20 granite)'),
  build('craftingBench', 'Crafting bench', 'j', 'furniture', 'Weaves cotton into cloth (30 wood)'),
  build('horseshoePin', 'Horseshoe pin', 'i', 'furniture', 'Recreation spot (15 granite)'),
  build('armchair', 'Armchair', 'h', 'furniture', 'Comfortable recreation and decor (10 wood, 6 cloth)'),
];

export const SPEEDS = [0, 1, 2, 4];
// Roughly how much nutrition a colonist eats per day.
const DAILY_NUTRITION = 1.4;
export const TICKS_PER_SECOND = 20;
export const SAVE_SLOTS = ['autosave', 'slot-1', 'slot-2', 'slot-3'];

export const slotLabel = (slot: string): string => (slot === 'autosave' ? 'Autosave' : `Slot ${slot.slice(5)}`);

export interface ColonistView {
  id: number;
  name: string;
  color: string;
  activity: string;
  carrying: string | null;
  skills: Skills;
  needs: Needs;
  mood: number;
  inBreak: boolean;
  thoughts: { label: string; mood: number }[];
  priorities: Priorities;
  schedule: ScheduleSlot[];
  traits: { label: string; description: string }[];
  status: 'Healthy' | 'Injured' | 'Sick' | 'Downed' | 'Dead';
  injuries: { label: string; severity: number; tended: boolean }[];
  bloodLoss: number;
  disease: { label: string; severity: number; immunity: number } | null;
  relations: { name: string; opinion: number; label: string | null }[];
  drafted: boolean;
  dead: boolean;
  skillList: { key: string; label: string; level: number; passion: number; progress: number }[];
  weapon: string;
}

// A story event shown briefly as a card, so major moments aren't missed.
export interface Notification {
  id: number;
  text: string;
  tone: LogEntry['tone'];
}

export interface RaidView {
  faction: string;
  remaining: number;
}

export interface TileView {
  x: number;
  y: number;
  terrain: string;
  feature: string | null;
  items: string | null;
  orders: string[];
  temperature: number;
  room: string | null;
  animal: string | null;
}

export interface BillView {
  recipe: number;
  name: string;
  product: string;
  target: number;
  stock: number;
}

export interface Alert {
  text: string;
  tone: 'warn' | 'danger';
}

export interface UiState {
  day: number;
  time: string;
  night: boolean;
  outdoorTemp: number;
  speed: number;
  toolId: string;
  colonists: ColonistView[];
  selectedColonist: number | null;
  resources: { name: string; stored: number; total: number }[];
  objectives: { id: string; label: string; phase: number; done: boolean; failed: boolean; progress?: string }[];
  bills: BillView[];
  alerts: Alert[];
  log: LogEntry[];
  story: StoryEntry[];
  raid: RaidView | null;
  hover: TileView | null;
  hoverColonist: number | null;
  saves: SaveMeta[];
  toast: string | null;
  notifications: Notification[];
  seed: number;
  difficulty: Difficulty;
}

const toolId = (tool: Tool): string =>
  TOOLS.find((t) => JSON.stringify(t.tool) === JSON.stringify(tool))?.id ?? 'select';

// Owns the running simulation and mediates between it, the Phaser renderer, and the React UI.
export class GameController {
  public sim: Simulation;
  public tool: Tool = { kind: 'select' };
  public selectedColonist: number | null = null;
  public hoverTile: number | null = null;
  public hoverColonist: number | null = null;
  // Incremented whenever `sim` is replaced, so the renderer knows to rebuild.
  public simVersion = 0;
  public focusRequest: number | null = null;

  private speedIndex = 1;
  private resumeSpeed = 1;
  private accumulator = 0;
  private lastFrame = performance.now();
  private sinceUiUpdate = Infinity;
  private saves: SaveMeta[] = [];
  private toast: string | null = null;
  private toastTimer = 0;
  private notifications: (Notification & { expires: number })[] = [];
  private nextNotification = 0;
  // How much of the story log has already been shown as notifications.
  private storySeen = 0;
  // Tick at which each colonist last started idling, for the idle alert.
  private idleSince = new Map<number, number>();
  private state: UiState;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.sim = Simulation.newColony(Math.floor(Math.random() * 1e9));
    this.focusRequest = this.sim.colonists[0].tile;
    this.storySeen = this.sim.storyLog.length;
    this.state = this.buildState();
    this.refreshSaves();
  }

  // ---- React store interface ----

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public getState = (): UiState => this.state;

  public publish(): void {
    this.state = this.buildState();
    this.listeners.forEach((listener) => listener());
  }

  // Fraction of the way to the next tick, for smooth rendering between ticks.
  public get tickFraction(): number {
    return SPEEDS[this.speedIndex] > 0 ? this.accumulator : 0;
  }

  // ---- Called every render frame by the Phaser scene ----

  public frame(): void {
    // Use real elapsed time rather than the renderer's smoothed delta, so the simulation
    // keeps pace on slow frames. Long gaps (a backgrounded tab) are clamped to one second.
    const now = performance.now();
    const deltaMs = Math.min(now - this.lastFrame, 1000);
    this.lastFrame = now;
    this.accumulator += (deltaMs / 1000) * TICKS_PER_SECOND * SPEEDS[this.speedIndex];
    while (this.accumulator >= 1) {
      this.sim.step();
      this.accumulator--;
    }
    for (const event of this.sim.events.splice(0)) {
      if (event === 'dawn') {
        this.save('autosave', true);
      } else if (event === 'raid') {
        // Give the player a moment to react.
        this.setSpeed(0);
        this.notify('Game paused. Press Q to draft your colonists.');
      }
    }
    if (this.toast && (this.toastTimer -= deltaMs) <= 0) {
      this.toast = null;
    }
    this.collectNotifications(now);
    this.sinceUiUpdate += deltaMs;
    if (this.sinceUiUpdate >= 200) {
      this.sinceUiUpdate = 0;
      this.publish();
    }
  }

  // ---- Player actions ----

  public command(cmd: Command): void {
    this.sim.apply(cmd);
    this.publish();
  }

  public setTool(tool: Tool): void {
    this.tool = tool;
    this.publish();
  }

  public setSpeed(index: number): void {
    this.speedIndex = index;
    if (index > 0) {
      this.resumeSpeed = index;
    }
    this.publish();
  }

  public togglePause(): void {
    this.setSpeed(this.speedIndex === 0 ? this.resumeSpeed : 0);
  }

  public toggleDraft(id: number): void {
    const c = this.sim.colonists[id];
    if (c) {
      this.command({ type: 'draft', colonist: id, drafted: !c.drafted });
    }
  }

  // Drafts every able colonist, or stands everyone down if they're all drafted already.
  public toggleDraftAll(): void {
    const able = this.sim.living().filter((c) => !c.health.downed);
    const draft = able.some((c) => !c.drafted);
    for (const c of able) {
      this.sim.apply({ type: 'draft', colonist: c.id, drafted: draft });
    }
    this.publish();
  }

  // Sends the selected drafted colonist to a tile. Returns false if there was no one to order.
  public orderMove(tile: number): boolean {
    const id = this.selectedColonist;
    if (id === null || !this.sim.colonists[id]?.drafted) {
      return false;
    }
    this.command({ type: 'move', colonist: id, tile });
    return true;
  }

  public selectColonist(id: number | null, focus = false): void {
    this.selectedColonist = id;
    if (id !== null && focus) {
      this.focusRequest = this.sim.colonists[id].tile;
    }
    this.publish();
  }

  public setHover(tile: number | null, colonist: number | null = null): void {
    if (tile !== this.hoverTile || colonist !== this.hoverColonist) {
      this.hoverTile = tile;
      this.hoverColonist = colonist;
      this.publish();
    }
  }

  public newColony(seedText: string, difficulty: Difficulty = 'standard'): void {
    const trimmed = seedText.trim();
    const seed =
      trimmed === '' ? Math.floor(Math.random() * 1e9) : /^\d+$/.test(trimmed) ? Number(trimmed) : hashSeed(trimmed);
    this.replaceSim(Simulation.newColony(seed, difficulty));
    this.notify(`New colony founded (seed ${seed}).`);
  }

  public async deleteSave(slot: string): Promise<void> {
    try {
      await deleteSave(slot);
      await this.refreshSaves();
      this.notify(`Deleted ${slotLabel(slot).toLowerCase()}.`);
    } catch (error) {
      console.error(error);
      this.notify('Deleting failed.');
    }
  }

  public dismissNotification(id: number): void {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.publish();
  }

  // Turns new story entries into short-lived notification cards.
  private collectNotifications(now: number): void {
    const story = this.sim.storyLog;
    const before = this.notifications.length;
    // The story log is capped, so track entries by count and clamp if it was trimmed.
    this.storySeen = Math.min(this.storySeen, story.length);
    for (const entry of story.slice(this.storySeen)) {
      this.notifications.push({ id: this.nextNotification++, text: entry.text, tone: entry.tone, expires: now + 8000 });
    }
    this.storySeen = story.length;
    this.notifications = this.notifications.filter((n) => n.expires > now).slice(-4);
    if (this.notifications.length !== before) {
      this.publish();
    }
  }

  public async save(slot: string, auto = false): Promise<void> {
    const sim = this.sim;
    try {
      await writeSave(
        {
          slot,
          day: sim.day,
          hour: Math.floor(sim.hour),
          seed: sim.seed,
          savedAt: Date.now(),
          version: SAVE_VERSION,
          colonists: sim.living().length,
          difficulty: sim.story.difficulty,
        },
        serialize(sim),
      );
      await this.refreshSaves();
      this.notify(auto ? 'Autosaved.' : `Saved to ${slotLabel(slot).toLowerCase()}.`);
    } catch (error) {
      console.error(error);
      this.notify('Saving failed.');
    }
  }

  public async load(slot: string): Promise<void> {
    try {
      const data = await readSave(slot);
      if (!data) {
        this.notify(`Nothing saved in ${slotLabel(slot).toLowerCase()}.`);
        return;
      }
      this.replaceSim(deserialize(data));
      this.notify(`Loaded ${slotLabel(slot).toLowerCase()}.`);
    } catch (error) {
      console.error(error);
      this.notify('That save is from an older version and cannot be loaded.');
    }
  }

  private replaceSim(sim: Simulation): void {
    this.sim = sim;
    this.simVersion++;
    this.idleSince.clear();
    this.selectedColonist = null;
    this.accumulator = 0;
    this.focusRequest = sim.colonists[0].tile;
    // Don't replay a loaded colony's history as notifications.
    this.storySeen = sim.storyLog.length;
    this.notifications = [];
    this.publish();
  }

  private async refreshSaves(): Promise<void> {
    try {
      this.saves = await listSaves();
      this.publish();
    } catch (error) {
      console.error(error);
    }
  }

  private notify(text: string): void {
    this.toast = text;
    this.toastTimer = 2500;
    this.publish();
  }

  // ---- Snapshot for the UI ----

  private buildState(): UiState {
    const sim = this.sim;
    const hour = sim.hour;
    const hh = Math.floor(hour);
    const mm = Math.floor((hour - hh) * 60);
    const totals = sim.resourceTotals();
    return {
      day: sim.day,
      time: `${String(hh).padStart(2, '0')}:${String(mm - (mm % 10)).padStart(2, '0')}`,
      night: sim.isNight(),
      outdoorTemp: Math.round(sim.outdoorTemperature()),
      speed: this.speedIndex,
      toolId: toolId(this.tool),
      colonists: sim.colonists.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        activity: sim.describe(c),
        carrying: c.carrying && `${c.carrying.count} ${itemDef(c.carrying.item).name.toLowerCase()}`,
        skills: { ...c.skills },
        needs: { ...c.needs },
        mood: Math.round(c.mood),
        inBreak: sim.inMentalBreak(c),
        thoughts: sim.thoughtsOf(c),
        priorities: { ...c.priorities },
        schedule: [...c.schedule],
        traits: c.traits.map((key) => ({ label: TRAITS[key].label, description: TRAITS[key].description })),
        status: c.health.dead
          ? 'Dead'
          : c.health.downed
            ? 'Downed'
            : c.health.disease
              ? 'Sick'
              : c.health.injuries.length > 0
                ? 'Injured'
                : 'Healthy',
        injuries: c.health.injuries.map((injury) => ({
          label: injury.label,
          severity: injury.severity,
          tended: injury.tended > 0,
        })),
        bloodLoss: c.health.bloodLoss,
        disease: c.health.disease && {
          label: c.health.disease.label,
          severity: c.health.disease.severity,
          immunity: c.health.disease.immunity,
        },
        relations: sim.colonists
          .filter((o) => o !== c && !o.health.dead)
          .map((o) => ({ name: o.name, opinion: Math.round(c.opinions[o.id] ?? 0), label: relationLabel(c, o) }))
          .sort((a, b) => b.opinion - a.opinion),
        drafted: c.drafted,
        dead: c.health.dead,
        skillList: SKILL_KEYS.map((key) => ({
          key,
          label: SKILL_LABELS[key],
          level: c.skills[key],
          passion: c.passions[key],
          progress: c.skills[key] >= MAX_SKILL ? 1 : c.skillXp[key] / xpToNext(c.skills[key]),
        })),
        weapon: COLONIST_WEAPONS[c.weapon].name,
      })),
      selectedColonist: this.selectedColonist,
      resources: totals.map((r) => ({ name: itemDef(r.item).name, stored: r.stored, total: r.total })),
      objectives: OBJECTIVES.map((o) => ({
        id: o.id,
        label: o.label,
        phase: o.phase,
        done: !!sim.objectivesDone[o.id],
        failed: o.id === 'night' && sim.firstNight === 'failed',
        progress: o.progress?.(sim),
      })),
      bills: sim.bills.map((bill) => {
        const recipe = RECIPES[bill.recipe];
        return {
          recipe: bill.recipe,
          name: recipe.name,
          product: itemDef(recipe.product.item).name,
          target: bill.target,
          stock: totals[recipe.product.item - 1].total,
        };
      }),
      alerts: this.buildAlerts(totals),
      log: sim.log.slice(-12).reverse(),
      story: [...sim.storyLog].reverse(),
      raid:
        sim.enemies.length > 0
          ? { faction: FACTIONS[sim.enemies[0].faction].name, remaining: sim.enemies.filter((e) => !e.fleeing).length }
          : null,
      hover: this.hoverTile === null ? null : this.describeTile(this.hoverTile),
      hoverColonist: this.hoverColonist,
      saves: this.saves,
      toast: this.toast,
      notifications: this.notifications.map(({ id, text, tone }) => ({ id, text, tone })),
      seed: sim.seed,
      difficulty: sim.story.difficulty,
    };
  }

  // Problems worth the player's attention right now, most urgent first.
  private buildAlerts(totals: ReturnType<Simulation['resourceTotals']>): Alert[] {
    const sim = this.sim;
    const alerts: Alert[] = [];
    const raiders = sim.enemies.filter((e) => !e.fleeing).length;
    if (raiders > 0) {
      alerts.push({
        text: `Raid: ${raiders} raider${raiders > 1 ? 's' : ''} from ${FACTIONS[sim.enemies[0].faction].name}. Draft with Q.`,
        tone: 'danger',
      });
    }
    for (const c of sim.living()) {
      if (c.health.downed) {
        alerts.push({ text: `${c.name} has collapsed and needs a doctor`, tone: 'danger' });
      } else if (bleedingOf(c) > 0) {
        alerts.push({ text: `${c.name} is bleeding`, tone: 'danger' });
      }
      const disease = c.health.disease;
      if (disease) {
        const sev = Math.round(disease.severity * 100);
        const imm = Math.round(disease.immunity * 100);
        alerts.push({
          text: `${c.name} has ${disease.label.toLowerCase()} (severity ${sev}%, immunity ${imm}%)`,
          tone: disease.severity > disease.immunity ? 'danger' : 'warn',
        });
      }
    }
    const hurt = sim.living().some((c) => c.health.injuries.length > 0 || c.health.disease || painOf(c) > 0);
    if (hurt && sim.stockOf(itemId('herbalMedicine')) === 0) {
      alerts.push({ text: 'No medicine: grow healroot for better treatment', tone: 'warn' });
    }
    if (sim.tick < sim.story.coldSnapUntil) {
      alerts.push({ text: 'Cold snap: keep colonists warm indoors', tone: 'warn' });
    }
    for (const c of sim.living()) {
      if (sim.inMentalBreak(c)) {
        alerts.push({ text: `${c.name} is having a mental break`, tone: 'danger' });
      } else if (c.needs.food <= 0) {
        alerts.push({ text: `${c.name} is starving`, tone: 'danger' });
      } else if (c.mood < 25) {
        alerts.push({ text: `${c.name} is unhappy (mood ${Math.round(c.mood)})`, tone: 'warn' });
      }
    }
    if (!sim.hasShelter() && sim.hour >= 16 && sim.hour < NIGHT_START) {
      alerts.push({ text: 'No shelter yet, and night falls at 22:00', tone: 'warn' });
    }
    const nutrition = totals.reduce((sum, t) => sum + itemDef(t.item).nutrition * t.total, 0);
    const days = nutrition / (Math.max(1, sim.living().length) * DAILY_NUTRITION);
    if (days < 2) {
      alerts.push({
        text: `Food is running low (about ${days.toFixed(1)} days left)`,
        tone: days < 1 ? 'danger' : 'warn',
      });
    }
    const beds = sim.countFeature((f) => featureDef(f).bed);
    if (sim.day > 1 && beds < sim.colonists.length) {
      const missing = sim.colonists.length - beds;
      alerts.push({ text: `${missing} colonist${missing > 1 ? 's' : ''} without a bed`, tone: 'warn' });
    }
    if (!sim.world.zone.some((z) => z === STOCKPILE_ZONE) && totals.some((t) => t.total > 0)) {
      alerts.push({ text: 'No stockpile: items are left where they fall', tone: 'warn' });
    }
    const ateRaw = sim.colonists.some((c) => c.thoughts.some((t) => t.key === 'ateRaw'));
    if (ateRaw && sim.countFeature((f) => featureDef(f).workbench === 'cooking') === 0) {
      alerts.push({ text: 'No stove: colonists are eating raw food', tone: 'warn' });
    }
    const idle = sim.living().filter((c) => {
      // Only working hours count: wandering during recreation time is expected.
      const slot = c.schedule[Math.floor(sim.hour)];
      const isIdle =
        (slot === 'A' || slot === 'W') &&
        raiders === 0 &&
        !needsBedRest(c) &&
        !c.drafted &&
        !c.health.downed &&
        !sim.inMentalBreak(c) &&
        (!c.job || c.job.type === 'wander');
      if (!isIdle) {
        this.idleSince.delete(c.id);
        return false;
      }
      const since = this.idleSince.get(c.id) ?? sim.tick;
      this.idleSince.set(c.id, since);
      return sim.tick - since > TICKS_PER_HOUR;
    });
    if (idle.length > 0) {
      const names = idle.map((c) => c.name).join(', ');
      alerts.push({ text: `Nothing to do: ${names}. Designate more work.`, tone: 'warn' });
    }
    return alerts;
  }

  private describeTile(i: number): TileView {
    const sim = this.sim;
    const w = sim.world;
    const orders: string[] = [];
    const designationNames: Record<number, string> = {
      [Designation.MINE]: 'Marked for mining',
      [Designation.CHOP]: 'Marked for chopping',
      [Designation.FORAGE]: 'Marked for foraging',
      [Designation.DECONSTRUCT]: 'Marked for deconstruction',
    };
    if (w.designation[i] !== Designation.NONE) {
      orders.push(designationNames[w.designation[i]]);
    }
    if (w.blueprint[i] !== NONE) {
      const def = featureDef(w.blueprint[i]);
      const materials = def
        .build!.cost.map((c, line) => `${w.deliveredAt(i, line)}/${c.count} ${itemDef(c.item).name.toLowerCase()}`)
        .join(', ');
      orders.push(`Blueprint: ${def.name} (${materials})`);
    }
    const zone = w.zone[i];
    if (zone >= GROW_ZONE) {
      orders.push(`Growing zone: ${featureDef(zone - GROW_ZONE).name.toLowerCase()}`);
    } else if (zone !== 0) {
      orders.push('Stockpile');
    }
    const f = w.feature[i];
    let feature = f !== NONE ? featureDef(f).name : null;
    if (f !== NONE && featureDef(f).crop) {
      feature += ` (${Math.floor(w.growth[i] * 100)}% grown)`;
    }
    const room = sim.roomAt(i);
    const beast = sim.animals.find((a) => a.tile === i);
    const animal = beast
      ? `${animalName(beast)}${beast.hunted ? ' · marked for hunting' : ''}${beast.revengeOn >= 0 ? ' · enraged' : ''}`
      : null;
    return {
      x: w.xOf(i),
      y: w.yOf(i),
      terrain: terrainDef(w.terrain[i]).name,
      feature,
      items: w.itemType[i] !== NONE ? `${w.itemCount[i]} × ${itemDef(w.itemType[i]).name}` : null,
      orders,
      temperature: Math.round(sim.temperatureAt(i)),
      animal,
      room:
        room && room.enclosed
          ? `${room.role} · ${impressivenessLabel(room.impressiveness)} (${room.impressiveness}) · ${room.size} tiles`
          : null,
    };
  }
}

export const controller = new GameController();
