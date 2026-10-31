import { MAX_COST_LINES, NONE, NORMAL_QUALITY, featureDef, itemDef, terrainDef } from './defs';
import type { Carried } from './types';

export type TileKind = 'items' | 'features' | 'designations' | 'blueprints' | 'zones';

function toggle(set: Set<number>, i: number, present: boolean): void {
  if (present) {
    set.add(i);
  } else {
    set.delete(i);
  }
}

export const Designation = {
  NONE: 0,
  MINE: 1,
  CHOP: 2,
  FORAGE: 3,
  DECONSTRUCT: 4,
} as const;

// Zone values: 0 none, 1 stockpile, GROW_ZONE + crop feature id for growing zones.
export const STOCKPILE_ZONE = 1;
export const GROW_ZONE = 100;
export const growZoneCrop = (zone: number): number => (zone >= GROW_ZONE ? zone - GROW_ZONE : NONE);

// Neighbour offsets: the four orthogonal directions first, then diagonals.
export const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

// The tile grid. Every layer is a flat typed array indexed by `y * width + x`,
// which keeps the world cheap to copy, save, and (later) hand to a Web Worker.
export class World {
  public readonly size: number;
  public readonly terrain: Uint8Array;
  public readonly feature: Uint8Array;
  public readonly designation: Uint8Array;
  public readonly zone: Uint8Array;
  // Feature id of a planned construction, and how much material has arrived
  // for each of its cost lines (MAX_COST_LINES entries per tile).
  public readonly blueprint: Uint8Array;
  public readonly delivered: Uint16Array;
  // Crop growth, 0..1.
  public readonly growth: Float32Array;
  // Days of freshness left for a perishable stack, or wear left (0..1) on clothing.
  public readonly fresh: Float32Array;
  // Cook's skill for meals, craftsmanship for clothing (averaged when stacks merge).
  public readonly quality: Float32Array;
  // Damage raiders have done to a building they're breaking through (cleared when it changes).
  public readonly damage: Float32Array;
  // Fuel held by a fuelled building (generators).
  public readonly fuel: Float32Array;
  // One item stack per tile.
  public readonly itemType: Uint8Array;
  public readonly itemCount: Uint16Array;
  // Work done towards the current harvest/construction on this tile.
  public readonly progress: Float32Array;

  // Tiles whose visuals changed since the renderer last looked.
  public readonly dirty = new Set<number>();
  // Tiles changed since the lists behind tilesWith() were last brought up to date.
  private readonly stale = new Set<number>();
  private readonly lists: Record<TileKind, Set<number>> = {
    items: new Set(),
    features: new Set(),
    designations: new Set(),
    blueprints: new Set(),
    zones: new Set(),
  };
  // Bumped whenever passability or room boundaries may have changed.
  public structureVersion = 0;
  // Bumped whenever any feature changes (furniture affects room stats).
  public featureVersion = 0;

  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {
    this.size = width * height;
    this.terrain = new Uint8Array(this.size);
    this.feature = new Uint8Array(this.size);
    this.designation = new Uint8Array(this.size);
    this.zone = new Uint8Array(this.size);
    this.blueprint = new Uint8Array(this.size);
    this.delivered = new Uint16Array(this.size * MAX_COST_LINES);
    this.growth = new Float32Array(this.size);
    this.fresh = new Float32Array(this.size);
    this.quality = new Float32Array(this.size);
    this.damage = new Float32Array(this.size);
    this.fuel = new Float32Array(this.size);
    this.itemType = new Uint8Array(this.size);
    this.itemCount = new Uint16Array(this.size);
    this.progress = new Float32Array(this.size);
  }

  public idx(x: number, y: number): number {
    return y * this.width + x;
  }

  public xOf(i: number): number {
    return i % this.width;
  }

  public yOf(i: number): number {
    return (i / this.width) | 0;
  }

  public inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  public markDirty(i: number): void {
    this.dirty.add(i);
    this.stale.add(i);
  }

  // Tiles holding items, buildings or plants, work orders, blueprints and zones, so searches
  // don't have to scan the whole map. They catch up on changed tiles lazily, when next read.
  public tilesWith(kind: TileKind): ReadonlySet<number> {
    if (this.stale.size > 0) {
      for (const i of this.stale) {
        toggle(this.lists.items, i, this.itemType[i] !== NONE);
        toggle(this.lists.features, i, this.feature[i] !== NONE);
        toggle(this.lists.designations, i, this.designation[i] !== 0);
        toggle(this.lists.blueprints, i, this.blueprint[i] !== NONE);
        toggle(this.lists.zones, i, this.zone[i] !== 0);
      }
      this.stale.clear();
    }
    return this.lists[kind];
  }

  // Rebuilds the lists from scratch (after map generation or loading writes the layers directly).
  public reindex(): void {
    for (let i = 0; i < this.size; i++) {
      this.stale.add(i);
    }
  }

  public isPassable(i: number): boolean {
    const f = this.feature[i];
    if (f !== NONE && featureDef(f).bridge) {
      return true;
    }
    if (terrainDef(this.terrain[i]).moveCost === 0) {
      return false;
    }
    return f === NONE || featureDef(f).passable;
  }

  public moveCost(i: number): number {
    const f = this.feature[i];
    if (f !== NONE && featureDef(f).bridge) {
      return featureDef(f).moveCost;
    }
    const base = terrainDef(this.terrain[i]).moveCost;
    return f === NONE ? base : base * featureDef(f).moveCost;
  }

  // The nearest tile that can be walked on and leads somewhere (not an isolated scrap of bridge).
  public nearestPassable(from: number): number | undefined {
    let best: number | undefined;
    let bestDistance = Infinity;
    for (let i = 0; i < this.size; i++) {
      const d = this.distance(from, i);
      if (d < bestDistance && this.isPassable(i) && this.neighbors(i).some((n) => this.isPassable(n))) {
        best = i;
        bestDistance = d;
      }
    }
    return best;
  }

  // Unfrozen water with nothing built over it.
  public isOpenWater(i: number): boolean {
    const key = terrainDef(this.terrain[i]).key;
    return (key === 'shallowWater' || key === 'deepWater') && this.feature[i] === NONE;
  }

  // Unfrozen water that can be fished, bridged over or not.
  public isFishable(i: number): boolean {
    const key = terrainDef(this.terrain[i]).key;
    const f = this.feature[i];
    return (key === 'shallowWater' || key === 'deepWater') && (f === NONE || featureDef(f).bridge);
  }

  // Whether walking through this tile means wading.
  public isWading(i: number): boolean {
    return terrainDef(this.terrain[i]).key === 'shallowWater' && this.feature[i] === NONE;
  }

  public blocksRoom(i: number): boolean {
    const f = this.feature[i];
    return f !== NONE && featureDef(f).blocksRoom;
  }

  public setFeature(i: number, f: number): void {
    const old = this.feature[i];
    if (old === f) {
      return;
    }
    const before = this.isPassable(i);
    const roomBefore = this.blocksRoom(i);
    this.feature[i] = f;
    this.progress[i] = 0;
    this.damage[i] = 0;
    this.growth[i] = 0;
    this.fuel[i] = 0;
    this.featureVersion++;
    if (before !== this.isPassable(i) || roomBefore !== this.blocksRoom(i)) {
      this.structureVersion++;
    }
    this.markDirty(i);
  }

  public setTerrain(i: number, t: number): void {
    this.terrain[i] = t;
    this.structureVersion++;
    this.markDirty(i);
  }

  // ---- Blueprints ----

  public deliveredAt(i: number, line: number): number {
    return this.delivered[i * MAX_COST_LINES + line];
  }

  public addDelivered(i: number, line: number, count: number): void {
    this.delivered[i * MAX_COST_LINES + line] += count;
    this.markDirty(i);
  }

  public clearDelivered(i: number): void {
    this.delivered.fill(0, i * MAX_COST_LINES, (i + 1) * MAX_COST_LINES);
  }

  // Remaining material per cost line of the blueprint on tile `i`.
  public blueprintNeeds(i: number): { item: number; count: number; line: number }[] {
    const bp = this.blueprint[i];
    if (bp === NONE) {
      return [];
    }
    return featureDef(bp)
      .build!.cost.map((c, line) => ({ item: c.item, count: c.count - this.deliveredAt(i, line), line }))
      .filter((need) => need.count > 0);
  }

  public neighbors(i: number, diagonal = true): number[] {
    const x = this.xOf(i);
    const y = this.yOf(i);
    const out: number[] = [];
    const n = diagonal ? 8 : 4;
    for (let d = 0; d < n; d++) {
      const nx = x + DIRS[d][0];
      const ny = y + DIRS[d][1];
      if (this.inBounds(nx, ny)) {
        out.push(this.idx(nx, ny));
      }
    }
    return out;
  }

  public distance(a: number, b: number): number {
    const dx = Math.abs(this.xOf(a) - this.xOf(b));
    const dy = Math.abs(this.yOf(a) - this.yOf(b));
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  }

  // ---- Items ----

  public canHoldItem(i: number, item: number): boolean {
    if (!this.isPassable(i) || this.blueprint[i] !== NONE) {
      return false;
    }
    // Iceboxes only take food.
    if (this.feature[i] !== NONE && featureDef(this.feature[i]).icebox && !itemDef(item).nutrition) {
      return false;
    }
    const type = this.itemType[i];
    return type === NONE || (type === item && this.itemCount[i] < itemDef(item).stackLimit);
  }

  // Adds to the tile's stack and returns whatever did not fit. `fresh` is how many days the
  // incoming items have left (new items are perfectly fresh); a merged stack averages the two.
  public addItem(i: number, item: number, count: number, fresh?: number, quality?: number): number {
    if (!this.canHoldItem(i, item)) {
      return count;
    }
    const def = itemDef(item);
    const space = def.stackLimit - (this.itemType[i] === item ? this.itemCount[i] : 0);
    const added = Math.min(space, count);
    if (added <= 0) {
      return count;
    }
    if (added > 0) {
      const existing = this.itemType[i] === item ? this.itemCount[i] : 0;
      const merge = (old: number, incoming: number) => (old * existing + incoming * added) / (existing + added);
      const life = def.shelfLife ?? (def.apparel ? 1 : undefined);
      if (life !== undefined) {
        this.fresh[i] = merge(this.fresh[i], fresh ?? life);
      }
      this.quality[i] = merge(this.quality[i], quality ?? NORMAL_QUALITY);
    }
    this.itemType[i] = item;
    this.itemCount[i] += added;
    this.markDirty(i);
    return count - added;
  }

  // Takes up to `count` from the stack, keeping its freshness and quality with the carried items.
  public pickUp(i: number, count: number): Carried {
    const item = this.itemType[i];
    const def = itemDef(item);
    const fresh = def.shelfLife !== undefined || def.apparel ? this.fresh[i] : undefined;
    const quality = this.quality[i];
    return { item, count: this.takeItem(i, count), fresh, quality };
  }

  public takeItem(i: number, count: number): number {
    const taken = Math.min(count, this.itemCount[i]);
    this.itemCount[i] -= taken;
    if (this.itemCount[i] === 0) {
      this.itemType[i] = NONE;
    }
    this.markDirty(i);
    return taken;
  }

  // Spreads items onto the nearest tiles that can hold them (breadth-first from `start`, including
  // diagonals so a walled-in corner still reaches open ground). Items are never destroyed: if
  // nothing can hold the rest, the nearest walkable tile takes it over its stack limit.
  public dropItemNear(start: number, item: number, count: number, fresh?: number, quality?: number): void {
    // From the middle of deep water (a cancelled bridge), start from the nearest dry ground instead.
    if (!this.isPassable(start) && !this.neighbors(start).some((n) => this.isPassable(n))) {
      start = this.nearestPassable(start) ?? start;
    }
    let remaining = count;
    const seen = new Uint8Array(this.size);
    const queue = [start];
    seen[start] = 1;
    let fallback = -1;
    for (let q = 0; q < queue.length && remaining > 0; q++) {
      const i = queue[q];
      remaining = this.addItem(i, item, remaining, fresh, quality);
      if (
        fallback < 0 &&
        this.isPassable(i) &&
        this.blueprint[i] === NONE &&
        (this.feature[i] === NONE || !featureDef(this.feature[i]).icebox || !!itemDef(item).nutrition) &&
        // One-per-tile things (bows, clothes) never pile up, even as a last resort.
        (this.itemType[i] === NONE || (this.itemType[i] === item && itemDef(item).stackLimit > 1))
      ) {
        fallback = i;
      }
      for (const n of this.neighbors(i)) {
        if (!seen[n] && this.isPassable(n)) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    // Walled in with nowhere to put it: the nearest empty tile anywhere takes it.
    if (remaining > 0 && fallback < 0) {
      let best = Infinity;
      for (let i = 0; i < this.size; i++) {
        const d = this.distance(start, i);
        if (d < best && this.itemType[i] === NONE && this.isPassable(i) && this.blueprint[i] === NONE) {
          best = d;
          fallback = i;
        }
      }
    }
    if (remaining > 0 && fallback >= 0) {
      const existing = this.itemType[fallback] === item ? this.itemCount[fallback] : 0;
      const incoming = fresh ?? itemDef(item).shelfLife ?? (itemDef(item).apparel ? 1 : 0);
      this.fresh[fallback] = (this.fresh[fallback] * existing + incoming * remaining) / (existing + remaining);
      this.quality[fallback] =
        (this.quality[fallback] * existing + (quality ?? NORMAL_QUALITY) * remaining) / (existing + remaining);
      this.itemType[fallback] = item;
      this.itemCount[fallback] = existing + remaining;
      this.markDirty(fallback);
    }
  }
}
