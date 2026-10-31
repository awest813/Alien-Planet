import { World } from './world';

// Largest area that still counts as an enclosed (roofed) room.
const MAX_ROOM_SIZE = 300;

export interface PassRegions {
  // Connected walkable area id per tile, -1 if impassable.
  region: Int32Array;
  sizes: number[];
}

// Flood-fills walkable tiles into connected regions, giving O(1) reachability checks.
export function computePassRegions(world: World): PassRegions {
  const region = new Int32Array(world.size).fill(-1);
  const sizes: number[] = [];
  const queue: number[] = [];
  for (let start = 0; start < world.size; start++) {
    if (region[start] !== -1 || !world.isPassable(start)) {
      continue;
    }
    const id = sizes.length;
    let size = 0;
    queue.length = 0;
    queue.push(start);
    region[start] = id;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      size++;
      for (const n of world.neighbors(i, false)) {
        if (region[n] === -1 && world.isPassable(n)) {
          region[n] = id;
          queue.push(n);
        }
      }
    }
    sizes.push(size);
  }
  return { region, sizes };
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
  const queue: number[] = [];
  for (let start = 0; start < world.size; start++) {
    if (room[start] !== -1 || world.blocksRoom(start)) {
      continue;
    }
    const id = sizes.length;
    let size = 0;
    let touchesEdge = false;
    queue.length = 0;
    queue.push(start);
    room[start] = id;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      size++;
      const x = world.xOf(i);
      const y = world.yOf(i);
      if (x === 0 || y === 0 || x === world.width - 1 || y === world.height - 1) {
        touchesEdge = true;
      }
      for (const n of world.neighbors(i, false)) {
        if (room[n] === -1 && !world.blocksRoom(n)) {
          room[n] = id;
          queue.push(n);
        }
      }
    }
    sizes.push(size);
    enclosed.push(!touchesEdge && size <= MAX_ROOM_SIZE);
  }
  return { room, enclosed, sizes };
}
