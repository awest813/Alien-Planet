import colonistsJson from '../data/colonists.json';
import factionsJson from '../data/factions.json';
import featuresJson from '../data/features.json';
import itemsJson from '../data/items.json';
import recipesJson from '../data/recipes.json';
import terrainJson from '../data/terrain.json';
import thoughtsJson from '../data/thoughts.json';
import traitsJson from '../data/traits.json';

// Data definitions are loaded from JSON and resolved into numeric ids so the
// simulation can store the world in compact typed arrays.

export type WorkType = 'mine' | 'chop' | 'forage';
export type BenchType = 'cooking' | 'crafting';

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
}

export interface Cost {
  item: number;
  count: number;
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
  workbench?: BenchType;
  // Heat added to the room per climate update.
  heater: number;
  joy?: { kind: string; hoursToFull: number };
  harvest?: { work: WorkType; amount: number; item: number; count: number };
  crop?: { item: number; count: number; growDays: number; sowWork: number; harvestWork: number };
  build?: { cost: Cost[]; work: number };
}

export interface RecipeDef {
  id: number;
  key: string;
  name: string;
  bench: BenchType;
  ingredient: { item?: number; category?: string; count: number };
  product: Cost;
  work: number;
  defaultTarget: number;
}

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
  workbench?: string;
  heater?: number;
  joy?: { kind: string; hoursToFull: number };
  harvest?: { work: string; amount: number; item: string; count: number };
  crop?: { item: string; count: number; growDays: number; sowWork: number; harvestWork: number };
  build?: { cost: { item: string; count: number }[]; work: number };
}

interface RawItem {
  key: string;
  name: string;
  stackLimit: number;
  category?: string;
  nutrition?: number;
  rawPenalty?: boolean;
}

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
  workbench: f.workbench as BenchType | undefined,
  heater: f.heater ?? 0,
  joy: f.joy,
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
}));

// Blueprints track delivered materials per cost line; no building needs more than this many.
export const MAX_COST_LINES = Math.max(...FEATURES.map((f) => f.build?.cost.length ?? 0));

export const RECIPES: RecipeDef[] = recipesJson.map((r, i) => ({
  id: i,
  key: r.key,
  name: r.name,
  bench: r.bench as BenchType,
  ingredient: {
    item: 'item' in r.ingredient ? resolveItem(r.ingredient.item as string) : undefined,
    category: 'category' in r.ingredient ? (r.ingredient.category as string) : undefined,
    count: r.ingredient.count,
  },
  product: { item: resolveItem(r.product.item), count: r.product.count },
  work: r.work,
  defaultTarget: r.defaultTarget,
}));

export const THOUGHTS: Record<string, ThoughtDef> = Object.fromEntries(
  Object.entries(thoughtsJson as Record<string, Omit<ThoughtDef, 'key'>>).map(([key, t]) => [key, { key, ...t }]),
);

export const terrainDef = (id: number): TerrainDef => TERRAIN[id];
export const itemDef = (id: number): ItemDef => ITEMS[id - 1];
export const featureDef = (id: number): FeatureDef => FEATURES[id - 1];

const terrainIdByKey = new Map(TERRAIN.map((t) => [t.key, t.id]));
const featureIdByKey = new Map(FEATURES.map((f) => [f.key, f.id]));

export const terrainId = (key: string): number => terrainIdByKey.get(key)!;
export const itemId = (key: string): number => resolveItem(key);
export const featureId = (key: string): number => featureIdByKey.get(key)!;

// Whether an item satisfies a recipe ingredient.
export const matchesIngredient = (item: number, ingredient: RecipeDef['ingredient']): boolean =>
  ingredient.item !== undefined ? item === ingredient.item : itemDef(item).category === ingredient.category;

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
}

export const FACTIONS: FactionDef[] = factionsJson.map((f, i) => ({ ...f, id: i }));

export const COLONIST_NAMES: string[] = colonistsJson.names;
export const COLONIST_COLORS: string[] = colonistsJson.colors;
