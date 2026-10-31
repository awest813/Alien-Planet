import { MAX_COST_LINES, NONE, featureDef, itemDef, terrainDef } from './defs';

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
  // One item stack per tile.
  public readonly itemType: Uint8Array;
  public readonly itemCount: Uint16Array;
  // Work done towards the current harvest/construction on this tile.
  public readonly progress: Float32Array;

  // Tiles whose visuals changed since the renderer last looked.
  public readonly dirty = new Set<number>();
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
  }

  public isPassable(i: number): boolean {
    if (terrainDef(this.terrain[i]).moveCost === 0) {
      return false;
    }
    const f = this.feature[i];
    return f === NONE || featureDef(f).passable;
  }

  public moveCost(i: number): number {
    const base = terrainDef(this.terrain[i]).moveCost;
    const f = this.feature[i];
    return f === NONE ? base : base * featureDef(f).moveCost;
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
    this.growth[i] = 0;
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
    const type = this.itemType[i];
    return type === NONE || (type === item && this.itemCount[i] < itemDef(item).stackLimit);
  }

  // Adds to the tile's stack and returns whatever did not fit.
  public addItem(i: number, item: number, count: number): number {
    if (!this.canHoldItem(i, item)) {
      return count;
    }
    const space = itemDef(item).stackLimit - (this.itemType[i] === item ? this.itemCount[i] : 0);
    const added = Math.min(space, count);
    this.itemType[i] = item;
    this.itemCount[i] += added;
    this.markDirty(i);
    return count - added;
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
  public dropItemNear(start: number, item: number, count: number): void {
    let remaining = count;
    const seen = new Uint8Array(this.size);
    const queue = [start];
    seen[start] = 1;
    let fallback = -1;
    for (let q = 0; q < queue.length && remaining > 0; q++) {
      const i = queue[q];
      remaining = this.addItem(i, item, remaining);
      if (fallback < 0 && this.isPassable(i) && (this.itemType[i] === NONE || this.itemType[i] === item)) {
        fallback = i;
      }
      for (const n of this.neighbors(i)) {
        if (!seen[n] && this.isPassable(n)) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    if (remaining > 0 && fallback >= 0) {
      this.itemType[fallback] = item;
      this.itemCount[fallback] += remaining;
      this.markDirty(fallback);
    }
  }
}
