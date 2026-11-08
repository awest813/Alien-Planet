import animalsJson from '../data/animals.json';
import colonistsJson from '../data/colonists.json';
import factionsJson from '../data/factions.json';
import featuresJson from '../data/features.json';
import itemsJson from '../data/items.json';
import recipesJson from '../data/recipes.json';
import researchJson from '../data/research.json';
import weaponsJson from '../data/weapons.json';
import terrainJson from '../data/terrain.json';
import thoughtsJson from '../data/thoughts.json';
import traitsJson from '../data/traits.json';

// Data definitions are loaded from JSON and resolved into numeric ids so the
// simulation can store the world in compact typed arrays.

export type WorkType = 'mine' | 'chop' | 'forage';
export type BenchType = 'cooking' | 'crafting' | 'stonecutting' | 'mill' | 'kiln' | 'smelter';

export interface TerrainDef {
  id: number;
  key: string;
  name: string;
  // 0 means impassable.
  moveCost: number;
  buildable: boolean;
  fertility: number;
}

export interface ItemDef {
  id: number;
  key: string;
  name: string;
  stackLimit: number;
  category?: string;
  nutrition: number;
  // Eating it uncooked upsets colonists.
  rawPenalty: boolean;
  // Days until it rots at room temperature (undefined: never rots).
  shelfLife?: number;
  // A meal good enough to lift the mood.
  fine: boolean;
  // For raw food: what kind it is, for recipes that want a mix.
  foodKind?: 'meat' | 'veg' | 'dairy';
  // Worth in silver, for trade.
  value: number;
  // Clothing: how many degrees it widens the comfortable range, and how long it lasts.
  apparel?: ApparelSpec;
  // A tool kit: carried by a worker, it speeds up physical work and wears out.
  tool: boolean;
  // A weapon: the key of its entry in WEAPONS.
  weapon?: string;
  // Body armor: the share of each blow it turns aside, and how it slows its wearer.
  armor?: { protection: number; speed: number };
}

export interface ApparelSpec {
  cold: number;
  heat: number;
  wearDays: number;
}

export interface Cost {
  item: number;
  count: number;
}

// Power: generators have `output` watts (solar panels only by day, fuelled ones while fuelled),
// consumers `draw` watts, batteries `storage` watt-hours.
export interface PowerSpec {
  output: number;
  draw: number;
  storage: number;
  solar: boolean;
  fuel?: { item: number; capacity: number; perDay: number };
}

interface RawFuel {
  item: string;
  capacity: number;
  perDay: number;
}

export interface FeatureDef {
  id: number;
  key: string;
  name: string;
  natural: boolean;
  passable: boolean;
  moveCost: number;
  blocksRoom: boolean;
  door: boolean;
  bed: boolean;
  table: boolean;
  beauty: number;
  // A work of art: carved by an artist (Art work), its beauty set by the quality they achieve.
  art: boolean;
  // Flowers: full beauty in bloom, little in winter.
  flowers: boolean;
  // What a work of art is worth to traders at normal quality, in silver (before their cut).
  value: number;
  // Light it casts after dark: how far (tiles), its colour, and whether it flickers like a flame.
  // Anything on the power grid only shines while the grid is powered.
  light?: { radius: number; color: string; flicker: boolean };
  workbench?: BenchType;
  // Heat added to the room per climate update.
  heater: number;
  // Fires that burn fuel (wood) to give heat and light; out of fuel, they give neither.
  burns?: { item: number; capacity: number; perDay: number };
  // Hit-chance multiplier for someone sheltering behind it (sandbags).
  cover: number;
  // Research project that must be finished before it can be built.
  research?: string;
  researchStation: boolean;
  // Rest gain multiplier for beds.
  restGain: number;
  power?: PowerSpec;
  // Cools its room towards `target` (air conditioners, freezers).
  cooler?: { amount: number; target: number };
  // Storage tile that keeps food from rotting while powered.
  icebox: boolean;
  // Storage that holds this many stacks of one kind of item on its tile (shelves).
  shelf: number;
  // A drying rack: storage for meat, fish and berries, which dry on it into food that keeps.
  dries: boolean;
  // A hospital bed: patients heal faster, are tended better and catch fewer infections.
  hospital: boolean;
  // Radius of a sun lamp's light (crops grow beneath it day and night).
  growLight: number;
  // Built over water and makes it walkable.
  bridge: boolean;
  // A colonist standing here can fish the open water next to it.
  fishing: boolean;
  // A mine shaft: its harvest never runs out, but goes deeper each time (see depths.ts).
  shaft: boolean;
  joy?: JoySpec;
  harvest?: { work: WorkType; amount: number; item: number; count: number };
  crop?: {
    item: number;
    count: number;
    growDays: number;
    sowWork: number;
    harvestWork: number;
    // Shrugs off frost (young trees).
    hardy?: boolean;
  };
  build?: { cost: Cost[]; work: number };
  // Floors and roofs sit in their own layer, under or over whatever else is on the tile.
  layer?: 'floor' | 'roof';
  // A wall that shots pass through (an embrasure).
  seeThrough: boolean;
  // Springs on the first raider to step on it.
  trap: boolean;
}

export interface RecipeDef {
  id: number;
  key: string;
  name: string;
  bench: BenchType;
  // Everything one batch consumes, gathered one ingredient at a time.
  ingredients: Ingredient[];
  product: Cost;
  // Repairs the worn clothing it's given rather than making something new.
  mend: boolean;
  work: number;
  defaultTarget: number;
  research?: string;
  // Lowest skill a colonist needs to work this bill.
  minSkill: number;
}

// One ingredient line: a specific item, any item of a category, or any raw food of a kind;
// `worn` asks for clothing that has seen better days.
export interface Ingredient {
  item?: number;
  category?: string;
  foodKind?: string;
  worn?: boolean;
  count: number;
}

// Below this much wear left, clothing can be mended.
export const MENDABLE = 0.6;

export interface ThoughtDef {
  key: string;
  label: string;
  mood: number;
  // Timed thoughts last this long; situational thoughts have no duration.
  hours?: number;
}

interface RawFeature {
  key: string;
  name: string;
  natural?: boolean;
  passable?: boolean;
  moveCost?: number;
  blocksRoom?: boolean;
  door?: boolean;
  bed?: boolean;
  table?: boolean;
  beauty?: number;
  art?: boolean;
  flowers?: boolean;
  value?: number;
  light?: { radius: number; color: string; flicker?: boolean };
  workbench?: string;
  heater?: number;
  burns?: RawFuel;
  cover?: number;
  research?: string;
  researchStation?: boolean;
  restGain?: number;
  power?: { output?: number; draw?: number; storage?: number; solar?: boolean; fuel?: RawFuel };
  cooler?: { amount: number; target: number };
  icebox?: boolean;
  shelf?: number;
  dries?: boolean;
  hospital?: boolean;
  growLight?: number;
  bridge?: boolean;
  fishing?: boolean;
  joy?: {
    activity: string;
    kind: string;
    hoursToFull: number;
    seats?: number;
    company?: boolean;
    stargazing?: boolean;
    instrument?: boolean;
  };
  harvest?: { work: string; amount: number; item: string; count: number };
  crop?: { item: string; count: number; growDays: number; sowWork: number; harvestWork: number; hardy?: boolean };
  build?: { cost: { item: string; count: number }[]; work: number };
  shaft?: boolean;
  layer?: 'floor' | 'roof';
  seeThrough?: boolean;
  trap?: boolean;
}

interface RawItem {
  key: string;
  name: string;
  stackLimit: number;
  category?: string;
  nutrition?: number;
  rawPenalty?: boolean;
  shelfLife?: number;
  fine?: boolean;
  apparel?: ApparelSpec;
  foodKind?: 'meat' | 'veg' | 'dairy';
  value?: number;
  tool?: boolean;
  weapon?: string;
  armor?: { protection: number; speed: number };
}

// Kinds of recreation. Doing one kind over and over gives less each time (a later phase), so a
// colony with variety keeps its people happier.
export const JOY_KINDS = ['relaxing', 'gaming', 'social', 'outdoor', 'music', 'art'] as const;
export type JoyKind = (typeof JOY_KINDS)[number];
export const JOY_KIND_LABELS: Record<JoyKind, string> = {
  relaxing: 'Relaxing',
  gaming: 'Games',
  social: 'Social',
  outdoor: 'Outdoors',
  music: 'Music',
  art: 'Art',
};
// A joy building: what the colonist is shown doing, its kind, and how long it takes to fill the need.
export interface JoySpec {
  activity: string;
  kind: JoyKind;
  hoursToFull: number;
  // How many can use it at once. With more than one seat, players stand beside it, not on it.
  seats: number;
  // A game for two or more: on their own, a player gets far less out of it.
  company: boolean;
  // Only on a clear night, out under the open sky.
  stargazing: boolean;
  // Played from beside it, not by standing on it (tables with seats, instruments).
  beside: boolean;
  // Played, not just used: trains Artistic, and anyone nearby hears it.
  instrument: boolean;
}
function joyKind(kind: string, feature: string): JoyKind {
  if (!(JOY_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Unknown recreation kind "${kind}" on ${feature}`);
  }
  return kind as JoyKind;
}

// Quality of food and goods made by an average hand (and of anything found or gifted).
export const NORMAL_QUALITY = 6;

// Id 0 is reserved for "none" for items and features.
export const NONE = 0;

export const TERRAIN: TerrainDef[] = terrainJson.map((t, i) => ({ ...t, id: i }));
export const ITEMS: ItemDef[] = (itemsJson as RawItem[]).map((t, i) => ({
  id: i + 1,
  key: t.key,
  name: t.name,
  stackLimit: t.stackLimit,
  category: t.category,
  nutrition: t.nutrition ?? 0,
  rawPenalty: !!t.rawPenalty,
  shelfLife: t.shelfLife,
  fine: !!t.fine,
  apparel: t.apparel,
  foodKind: t.foodKind,
  value: t.value ?? 1,
  tool: !!t.tool,
  weapon: t.weapon,
  armor: t.armor,
}));

const itemIdByKey = new Map(ITEMS.map((item) => [item.key, item.id]));
const resolveItem = (key: string): number => {
  const id = itemIdByKey.get(key);
  if (id === undefined) {
    throw new Error(`Unknown item "${key}"`);
  }
  return id;
};

export const FEATURES: FeatureDef[] = (featuresJson as RawFeature[]).map((f, i) => ({
  id: i + 1,
  key: f.key,
  name: f.name,
  natural: !!f.natural,
  passable: !!f.passable,
  // Walkable features without an explicit cost are as easy to cross as open ground.
  moveCost: f.moveCost ?? (f.passable ? 1 : 0),
  blocksRoom: !!f.blocksRoom,
  door: !!f.door,
  bed: !!f.bed,
  table: !!f.table,
  beauty: f.beauty ?? 0,
  art: !!f.art,
  flowers: !!f.flowers,
  value: f.value ?? 0,
  light: f.light && { radius: f.light.radius, color: f.light.color, flicker: !!f.light.flicker },
  workbench: f.workbench as BenchType | undefined,
  heater: f.heater ?? 0,
  burns: f.burns && { ...f.burns, item: resolveItem(f.burns.item) },
  cover: f.cover ?? 1,
  research: f.research,
  researchStation: !!f.researchStation,
  restGain: f.restGain ?? 1,
  power: f.power && {
    output: f.power.output ?? 0,
    draw: f.power.draw ?? 0,
    storage: f.power.storage ?? 0,
    solar: !!f.power.solar,
    fuel: f.power.fuel && { ...f.power.fuel, item: resolveItem(f.power.fuel.item) },
  },
  cooler: f.cooler,
  icebox: !!f.icebox,
  shelf: f.shelf ?? 0,
  dries: !!f.dries,
  hospital: !!f.hospital,
  growLight: f.growLight ?? 0,
  bridge: !!f.bridge,
  fishing: !!f.fishing,
  shaft: !!f.shaft,
  joy: f.joy && {
    activity: f.joy.activity,
    kind: joyKind(f.joy.kind, f.key),
    hoursToFull: f.joy.hoursToFull,
    seats: f.joy.seats ?? 1,
    company: !!f.joy.company,
    stargazing: !!f.joy.stargazing,
    beside: (f.joy.seats ?? 1) > 1 || !!f.joy.instrument,
    instrument: !!f.joy.instrument,
  },
  harvest: f.harvest && {
    work: f.harvest.work as WorkType,
    amount: f.harvest.amount,
    item: resolveItem(f.harvest.item),
    count: f.harvest.count,
  },
  crop: f.crop && { ...f.crop, item: resolveItem(f.crop.item) },
  build: f.build && {
    cost: f.build.cost.map((c) => ({ item: resolveItem(c.item), count: c.count })),
    work: f.build.work,
  },
  layer: f.layer,
  seeThrough: !!f.seeThrough,
  trap: !!f.trap,
}));

// Blueprints track delivered materials per cost line; no building needs more than this many.
export const MAX_COST_LINES = Math.max(...FEATURES.map((f) => f.build?.cost.length ?? 0));

interface RawIngredient {
  item?: string;
  category?: string;
  foodKind?: string;
  worn?: boolean;
  count: number;
}

export const RECIPES: RecipeDef[] = recipesJson.map((r, i) => ({
  id: i,
  key: r.key,
  name: r.name,
  bench: r.bench as BenchType,
  ingredients: (r.ingredients as RawIngredient[]).map((ing) => ({
    item: ing.item !== undefined ? resolveItem(ing.item) : undefined,
    category: ing.category,
    foodKind: ing.foodKind,
    worn: !!ing.worn,
    count: ing.count,
  })),
  product: { item: resolveItem(r.product.item), count: r.product.count },
  mend: 'mend' in r && !!r.mend,
  work: r.work,
  defaultTarget: r.defaultTarget,
  research: 'research' in r ? (r.research as string) : undefined,
  minSkill: 'minSkill' in r ? (r.minSkill as number) : 0,
}));

export const THOUGHTS: Record<string, ThoughtDef> = Object.fromEntries(
  Object.entries(thoughtsJson as Record<string, Omit<ThoughtDef, 'key'>>).map(([key, t]) => [key, { key, ...t }]),
);

export const terrainDef = (id: number): TerrainDef => TERRAIN[id];
export const itemDef = (id: number): ItemDef => ITEMS[id - 1];

// Things counted one by one (meals, eggs, kit) take a plural; the rest (wood, cloth, silver) don't.
const PLURALS: Record<string, string> = { knife: 'knives' };
const COUNTED = new Set([
  'meal',
  'fineMeal',
  'tunic',
  'parka',
  'egg',
  'toolKit',
  'knife',
  'club',
  'spear',
  'ironSword',
]);
// "10 simple meals", "40 wood", in lower case.
export function quantity(id: number, count: number): string {
  const def = itemDef(id);
  const name = def.name.toLowerCase();
  const counted = COUNTED.has(def.key) || name.endsWith('bow') || name.endsWith('armor');
  return `${count} ${count === 1 || !counted ? name : (PLURALS[def.key] ?? `${name}s`)}`;
}
export const featureDef = (id: number): FeatureDef => FEATURES[id - 1];

const terrainIdByKey = new Map(TERRAIN.map((t) => [t.key, t.id]));
const featureIdByKey = new Map(FEATURES.map((f) => [f.key, f.id]));

export const terrainId = (key: string): number => terrainIdByKey.get(key)!;
export const itemId = (key: string): number => resolveItem(key);
export const featureId = (key: string): number => featureIdByKey.get(key)!;

// Whether an item satisfies a recipe ingredient.
export const matchesIngredient = (item: number, ingredient: Ingredient): boolean =>
  ingredient.item !== undefined
    ? item === ingredient.item
    : ingredient.foodKind !== undefined
      ? itemDef(item).foodKind === ingredient.foodKind
      : itemDef(item).category === ingredient.category;

export const isFood = (item: number): boolean => itemDef(item).nutrition > 0;

export interface TraitDef {
  key: string;
  label: string;
  description: string;
  excludes?: string;
  workSpeed?: number;
  plantSpeed?: number;
  joyDecay?: number;
  foodDecay?: number;
  mood?: number;
  damageTaken?: number;
  painThreshold?: number;
  accuracy?: number;
  ignoresRawFood?: boolean;
  insultChance?: number;
  opinionGiven?: number;
}

export const TRAITS: Record<string, TraitDef> = Object.fromEntries(
  Object.entries(traitsJson as Record<string, Omit<TraitDef, 'key'>>).map(([key, t]) => [key, { key, ...t }]),
);

export interface FactionDef {
  id: number;
  key: string;
  name: string;
  hostile: boolean;
  description: string;
  names: string[];
  // What its raiders carry: weapons by weight, some only from a given day.
  loadout: { weapon: string; weight: number; minDay?: number }[];
  // Raiders' fighting skill (colonists' Combat skill on the same scale).
  skill: number;
  // Raiders' walking speed, as a share of a colonist's.
  speed: number;
}

export const FACTIONS: FactionDef[] = (factionsJson as Omit<FactionDef, 'id' | 'loadout' | 'skill' | 'speed'>[]).map(
  (f, i) => {
    const raw = f as Partial<FactionDef>;
    return { ...f, id: i, loadout: raw.loadout ?? [], skill: raw.skill ?? 4, speed: raw.speed ?? 0.9 };
  },
);

// ---- Weapons ----

export interface WeaponDef {
  key: string;
  name: string;
  // The item it's made as (fists have none).
  item?: number;
  // Tiles; 1 is melee.
  range: number;
  // Ticks between attacks.
  cooldown: number;
  // Hit chance for an average fighter at point blank, and how much it drops per tile.
  accuracy: number;
  falloff: number;
  // Damage per hit against a raider's 1.0 of health.
  damage: [number, number];
  // Share of armor it ignores.
  pierce: number;
}

export const WEAPONS: WeaponDef[] = weaponsJson.map((w) => ({
  key: w.key,
  name: w.name,
  item: 'item' in w && w.item ? resolveItem(w.item) : undefined,
  range: w.range,
  cooldown: w.cooldown,
  accuracy: w.accuracy,
  falloff: 'falloff' in w ? (w.falloff ?? 0) : 0,
  damage: w.damage as [number, number],
  pierce: w.pierce,
}));
const weaponByKey = new Map(WEAPONS.map((w) => [w.key, w]));
export const weaponDef = (key: string): WeaponDef => weaponByKey.get(key) ?? weaponByKey.get('fists')!;
export const isRanged = (key: string): boolean => weaponDef(key).range > 1;
// Colonists land with these.
export const STARTING_WEAPON = 'shortBow';

export interface ResearchDef {
  key: string;
  name: string;
  cost: number;
  description: string;
  requires: string[];
}

export const RESEARCH: ResearchDef[] = researchJson.map((r) => ({ requires: [], ...r }));
export const researchDef = (key: string): ResearchDef | undefined => RESEARCH.find((r) => r.key === key);

export interface AnimalDef {
  key: string;
  name: string;
  hp: number;
  speed: number;
  meat: number;
  leather: number;
  // Runs from colonists closer than this (0: never runs).
  fleeRange: number;
  // Relative spawn frequency.
  weight: number;
  // Chance to turn on whoever hurt it, and its bite damage.
  revengeChance?: number;
  bite?: [number, number];
  // 0..1: how much harder than average it is to tame.
  wildness: number;
  // Chance per day that a tame pair has young.
  breedChance: number;
  // What a tame one gives each morning (milk, wool, eggs).
  produce?: { item: number; count: number };
  // Plural name, for herds in the log.
  plural: string;
  // How many arrive together.
  group: [number, number];
  // Wild predators hunt these kinds.
  preys?: string[];
  // Tame ones bite raiders who come close.
  guard?: boolean;
}

type RawAnimal = Omit<AnimalDef, 'key' | 'produce'> & { produce?: { item: string; count: number } };

export const ANIMALS: Record<string, AnimalDef> = Object.fromEntries(
  Object.entries(animalsJson as unknown as Record<string, RawAnimal>).map(([key, a]) => [
    key,
    {
      ...a,
      key,
      produce: a.produce && { item: resolveItem(a.produce.item), count: a.produce.count },
    },
  ]),
);

export const COLONIST_NAMES: string[] = colonistsJson.names;
export const COLONIST_COLORS: string[] = colonistsJson.colors;

// The fuel a building runs on, if any: a generator's, or a fire's.
export const fuelOf = (def: FeatureDef): { item: number; capacity: number; perDay: number } | undefined =>
  def.power?.fuel ?? def.burns;

// Which skill (and work type) a bench uses: the stove and millstone are cooking, the rest crafting.
export const benchSkill = (bench: BenchType): 'cooking' | 'crafting' =>
  bench === 'cooking' || bench === 'mill' ? 'cooking' : 'crafting';

// What a raw food dries into on a drying rack, if anything.
const DRIED: Record<string, string> = { rawMeat: 'driedMeat', rawFish: 'driedMeat', berries: 'driedBerries' };
export const driedFrom = (item: number): number | undefined => {
  const key = DRIED[itemDef(item).key];
  return key ? itemId(key) : undefined;
};
