import { World } from './world';

// Largest area that still counts as an enclosed (roofed) room.
const MAX_ROOM_SIZE = 300;

export interface PassRegions {
  // Connected walkable area id per tile, -1 if impassable.
  region: Int32Array;
  sizes: number[];
}

// Flood-fills walkable tiles into connected regions, giving O(1) reachability checks. (Redone whenever walls go
// up or rock is mined, so it's kept lean: passability read once per tile, neighbours by arithmetic.)
export function computePassRegions(world: World): PassRegions {
  const region = new Int32Array(world.size).fill(-1);
  const sizes: number[] = [];
  const open = new Uint8Array(world.size);
  for (let i = 0; i < world.size; i++) {
    open[i] = world.isPassable(i) ? 1 : 0;
  }
  const queue = new Int32Array(world.size);
  for (let start = 0; start < world.size; start++) {
    if (region[start] !== -1 || !open[start]) {
      continue;
    }
    const id = sizes.length;
    region[start] = id;
    const size = flood(
      world,
      start,
      queue,
      (n) => region[n] === -1 && open[n] === 1,
      (n) => (region[n] = id),
    );
    sizes.push(size);
  }
  return { region, sizes };
}

// Breadth-first from `start` over 4-neighbours that `enter` accepts (marking each with `mark`); returns how many
// tiles it reached, and whether any lies on the map edge (through `onEdge`).
function flood(
  world: World,
  start: number,
  queue: Int32Array,
  enter: (n: number) => boolean,
  mark: (n: number) => void,
  onEdge?: () => void,
): number {
  const w = world.width;
  const h = world.height;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    if (onEdge && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) {
      onEdge();
    }
    if (x > 0 && enter(i - 1)) {
      mark(i - 1);
      queue[tail++] = i - 1;
    }
    if (x < w - 1 && enter(i + 1)) {
      mark(i + 1);
      queue[tail++] = i + 1;
    }
    if (y > 0 && enter(i - w)) {
      mark(i - w);
      queue[tail++] = i - w;
    }
    if (y < h - 1 && enter(i + w)) {
      mark(i + w);
      queue[tail++] = i + w;
    }
  }
  return tail;
}

export interface Rooms {
  // Room id per tile, -1 for walls/doors/rock.
  room: Int32Array;
  // Whether each room is fully enclosed (not touching the map edge and small enough to roof).
  enclosed: boolean[];
  sizes: number[];
}

// Rooms are areas bounded by walls, doors, and natural rock.
export function computeRooms(world: World): Rooms {
  const room = new Int32Array(world.size).fill(-1);
  const enclosed: boolean[] = [];
  const sizes: number[] = [];
  const blocked = new Uint8Array(world.size);
  for (let i = 0; i < world.size; i++) {
    blocked[i] = world.blocksRoom(i) ? 1 : 0;
  }
  const queue = new Int32Array(world.size);
  for (let start = 0; start < world.size; start++) {
    if (room[start] !== -1 || blocked[start]) {
      continue;
    }
    const id = sizes.length;
    room[start] = id;
    let touchesEdge = false;
    const size = flood(
      world,
      start,
      queue,
      (n) => room[n] === -1 && blocked[n] === 0,
      (n) => (room[n] = id),
      () => (touchesEdge = true),
    );
    sizes.push(size);
    enclosed.push(!touchesEdge && size <= MAX_ROOM_SIZE);
  }
  return { room, enclosed, sizes };
}
