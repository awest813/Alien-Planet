import type { World } from '../sim/world';

// Light after dark is worked out tile by tile, so walls stop it: a fire inside lights its room and the
// inner face of the walls, not the grass beyond. The tiles' light is drawn as a small texture, one pixel
// a tile, stretched over the map with smooth filtering so the pools still fade softly.

export interface LitTile {
  tile: number;
  // 1 at the light, falling to 0 at its reach.
  share: number;
}

// The tiles a light at `source` reaches within `radius` tiles: those it can see. A wall or closed door
// in the way stops it; the wall itself catches the light at half strength.
export function litTiles(world: World, source: number, radius: number): LitTile[] {
  const sx = world.xOf(source);
  const sy = world.yOf(source);
  const reach = Math.ceil(radius);
  const out: LitTile[] = [];
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = sx + dx;
      const y = sy + dy;
      const d = Math.hypot(dx, dy);
      if (d >= radius || !world.inBounds(x, y) || !clearLine(world, sx, sy, x, y)) {
        continue;
      }
      const i = world.idx(x, y);
      const share = 1 - d / radius;
      out.push({ tile: i, share: i !== source && world.blocksRoom(i) ? share / 2 : share });
    }
  }
  return out;
}

// Whether nothing between two tiles (not counting either end) stops light.
function clearLine(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 4;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = Math.floor(x0 + 0.5 + (x1 - x0) * t);
    const y = Math.floor(y0 + 0.5 + (y1 - y0) * t);
    if ((x === x0 && y === y0) || (x === x1 && y === y1)) {
      continue;
    }
    if (world.blocksRoom(world.idx(x, y))) {
      return false;
    }
  }
  return true;
}

// Light added up per tile over a frame, then written out as pixels. Only the tiles lit this frame or
// the last are touched, so a dark map costs nothing.
export class LightBuffer {
  private readonly red: Float32Array;
  private readonly green: Float32Array;
  private readonly blue: Float32Array;
  private lit: number[] = [];
  private wasLit: number[] = [];

  public constructor(public readonly size: number) {
    this.red = new Float32Array(size);
    this.green = new Float32Array(size);
    this.blue = new Float32Array(size);
  }

  // Adds `amount` (0…1) of an 0xRRGGBB colour to a tile.
  public add(tile: number, color: number, amount: number): void {
    if (amount <= 0) {
      return;
    }
    if (this.red[tile] === 0 && this.green[tile] === 0 && this.blue[tile] === 0) {
      this.lit.push(tile);
    }
    this.red[tile] += ((color >> 16) & 0xff) * amount;
    this.green[tile] += ((color >> 8) & 0xff) * amount;
    this.blue[tile] += (color & 0xff) * amount;
  }

  // Writes this frame's light into RGBA pixels (one a tile), clears last frame's, and starts afresh.
  // Returns whether any pixel changed.
  public flush(pixels: Uint8ClampedArray): boolean {
    const changed = this.lit.length > 0 || this.wasLit.length > 0;
    for (const tile of this.wasLit) {
      const p = tile * 4;
      pixels[p] = pixels[p + 1] = pixels[p + 2] = 0;
    }
    for (const tile of this.lit) {
      const p = tile * 4;
      pixels[p] = this.red[tile];
      pixels[p + 1] = this.green[tile];
      pixels[p + 2] = this.blue[tile];
      this.red[tile] = this.green[tile] = this.blue[tile] = 0;
    }
    this.wasLit = this.lit;
    this.lit = [];
    return changed;
  }
}
