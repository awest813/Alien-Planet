import { DIRS, World } from './world';

const SQRT2 = Math.SQRT2;

// A* over the tile grid with 8-way movement (no corner cutting).
// Buffers are allocated once and reused between searches via a generation counter.
// The cheapest a step can be (stone tiles).
const MIN_STEP_COST = 0.8;

export class Pathfinder {
  private readonly g: Float32Array;
  private readonly f: Float32Array;
  private readonly parent: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private readonly goal: Uint32Array;
  private generation = 0;
  private heap: number[] = [];
  private keys: number[] = [];

  constructor(private readonly world: World) {
    const n = world.size;
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.goal = new Uint32Array(n);
  }

  // Returns the tiles to walk (excluding `start`, ending on one of `goals`), or null if unreachable.
  // `blocked` rules out tiles others can walk (animals don't pass gates).
  public find(start: number, goals: number[], blocked?: (i: number) => boolean): number[] | null {
    if (goals.length === 0) {
      return null;
    }
    const world = this.world;
    const gen = ++this.generation;
    for (const goal of goals) {
      if (goal === start) {
        return [];
      }
      this.goal[goal] = gen;
    }
    const gx = goals.map((goal) => world.xOf(goal));
    const gy = goals.map((goal) => world.yOf(goal));
    // Goals in a tight cluster (someone and the tiles round them, the usual case): the distance to the box round
    // them, which is never more than to the nearest of them (so still a lower bound) and at most a step less, at
    // the cost of one goal rather than nine.
    const few = goals.length > 2 && goals.length <= 9;
    const x0 = few ? Math.min(...gx) : 0;
    const x1 = few ? Math.max(...gx) : Infinity;
    const y0 = few ? Math.min(...gy) : 0;
    const y1 = few ? Math.max(...gy) : Infinity;
    if (few && x1 - x0 <= 2 && y1 - y0 <= 2) {
      return this.search(
        start,
        (i: number): number => {
          const x = world.xOf(i);
          const y = world.yOf(i);
          const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
          const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
          return (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)) * MIN_STEP_COST;
        },
        gen,
        blocked,
      );
    }
    return this.search(
      start,
      (i: number): number => {
        const x = world.xOf(i);
        const y = world.yOf(i);
        let best = Infinity;
        for (let k = 0; k < gx.length; k++) {
          const dx = Math.abs(x - gx[k]);
          const dy = Math.abs(y - gy[k]);
          // Floors make a step as cheap as 0.8, so scale down to stay a lower bound.
          const h = (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)) * MIN_STEP_COST;
          if (h < best) {
            best = h;
          }
        }
        return best;
      },
      gen,
      blocked,
    );
  }

  private search(
    start: number,
    heuristic: (i: number) => number,
    gen: number,
    blocked?: (i: number) => boolean,
  ): number[] | null {
    const world = this.world;
    this.heap = [];
    this.keys = [];
    this.g[start] = 0;
    this.f[start] = heuristic(start);
    this.parent[start] = -1;
    this.seen[start] = gen;
    this.push(start);

    while (this.heap.length > 0) {
      const current = this.pop();
      if (this.closed[current] === gen) {
        continue;
      }
      this.closed[current] = gen;
      if (this.goal[current] === gen) {
        return this.reconstruct(current);
      }
      const cx = world.xOf(current);
      const cy = world.yOf(current);
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS[d][0];
        const ny = cy + DIRS[d][1];
        if (!world.inBounds(nx, ny)) {
          continue;
        }
        const n = world.idx(nx, ny);
        if (this.closed[n] === gen || !world.isPassable(n) || blocked?.(n)) {
          continue;
        }
        const diagonal = d >= 4;
        if (
          diagonal &&
          (!world.isPassable(world.idx(cx + DIRS[d][0], cy)) || !world.isPassable(world.idx(cx, cy + DIRS[d][1])))
        ) {
          continue;
        }
        const cost = world.moveCost(n) * (diagonal ? SQRT2 : 1);
        const tentative = this.g[current] + cost;
        if (this.seen[n] !== gen || tentative < this.g[n]) {
          this.seen[n] = gen;
          this.g[n] = tentative;
          this.f[n] = tentative + heuristic(n);
          this.parent[n] = current;
          this.push(n);
        }
      }
    }
    return null;
  }

  private reconstruct(end: number): number[] {
    const path: number[] = [];
    for (let i = end; this.parent[i] !== -1; i = this.parent[i]) {
      path.push(i);
    }
    return path.reverse();
  }

  // Binary min-heap of (node, f) pairs. Stale entries are skipped via the closed set.
  private push(node: number): void {
    const heap = this.heap;
    const keys = this.keys;
    const key = this.f[node];
    let i = heap.length;
    heap.push(node);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) {
        break;
      }
      heap[i] = heap[p];
      keys[i] = keys[p];
      i = p;
    }
    heap[i] = node;
    keys[i] = key;
  }

  private pop(): number {
    const heap = this.heap;
    const keys = this.keys;
    const top = heap[0];
    const last = heap.pop()!;
    const lastKey = keys.pop()!;
    const n = heap.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) {
          break;
        }
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) {
          break;
        }
        heap[i] = heap[c];
        keys[i] = keys[c];
        i = c;
      }
      heap[i] = last;
      keys[i] = lastKey;
    }
    return top;
  }
}
