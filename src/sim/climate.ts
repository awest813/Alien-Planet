import { NONE, featureDef } from './defs';
import { Rooms } from './regions';
import { hash2 } from './rng';
import { seasonalOffset } from './seasons';
import { RoomInfo } from './types';
import { World } from './world';

// Rooms drift towards the outdoor temperature by this fraction per climate update.
const ROOM_LEAK = 0.03;
// Heaters stop adding heat above this temperature.
const HEATER_TARGET = 21;

export const COMFORT_MIN = 8;
export const COMFORT_MAX = 32;
export const CROP_MIN_TEMP = 5;

// Daily cycle peaking mid-afternoon, plus a smooth day-to-day drift.
export function outdoorTemperature(totalHours: number, seed: number): number {
  const day = Math.floor(totalHours / 24);
  const t = (totalHours % 24) / 24;
  const drift = hash2(day, 0, seed) * (1 - t) + hash2(day + 1, 0, seed) * t;
  const daily = Math.sin((((totalHours % 24) - 9) / 24) * Math.PI * 2);
  return 12 + daily * 8 + (drift - 0.5) * 6 + seasonalOffset(totalHours);
}

// Furniture-derived stats for one room.
interface RoomContents {
  beauty: number;
  beds: number;
  tables: number;
  heat: number;
  // Heat from electric heaters, only while the grid is powered.
  electricHeat: number;
  coolers: { amount: number; target: number }[];
  stoves: number;
  benches: number;
  joy: number;
  art: number;
}

// `beautyAt` gives a building's beauty on a tile (sculptures by quality, flowers by season); by
// default, its base beauty.
export function measureRooms(
  world: World,
  rooms: Rooms,
  beautyAt: (i: number) => number = (i) => featureDef(world.feature[i]).beauty,
): RoomContents[] {
  const contents: RoomContents[] = rooms.sizes.map(() => ({
    beauty: 0,
    beds: 0,
    tables: 0,
    heat: 0,
    electricHeat: 0,
    coolers: [],
    stoves: 0,
    benches: 0,
    joy: 0,
    art: 0,
  }));
  for (let i = 0; i < world.size; i++) {
    const room = rooms.room[i];
    if (room >= 0 && world.floor[i] !== NONE) {
      contents[room].beauty += featureDef(world.floor[i]).beauty;
    }
    if (room >= 0 && world.filth[i] !== 0) {
      contents[room].beauty += world.filthBeauty(i);
    }
    const f = world.feature[i];
    if (room < 0 || f === NONE) {
      continue;
    }
    const def = featureDef(f);
    const c = contents[room];
    c.beauty += beautyAt(i);
    c.beds += def.bed ? 1 : 0;
    c.tables += def.table ? 1 : 0;
    if (def.power?.draw) {
      c.electricHeat += def.heater;
    } else if (!def.burns || world.fuel[i] > 0) {
      c.heat += def.heater;
    }
    if (def.cooler) {
      c.coolers.push(def.cooler);
    }
    c.stoves += def.workbench === 'cooking' ? 1 : 0;
    c.benches += def.workbench === 'crafting' ? 1 : 0;
    c.joy += def.joy ? 1 : 0;
    c.art += def.art ? 1 : 0;
  }
  return contents;
}

export function describeRoom(id: number, rooms: Rooms, contents: RoomContents, temperature: number): RoomInfo {
  const size = rooms.sizes[id];
  const enclosed = rooms.enclosed[id];
  const impressiveness = enclosed
    ? Math.max(0, Math.round((contents.beauty * 12) / Math.sqrt(size) + Math.min(size, 30) * 0.8))
    : 0;
  let role = 'Outdoors';
  if (enclosed) {
    if (contents.beds > 1) {
      role = 'Barracks';
    } else if (contents.beds === 1) {
      role = 'Bedroom';
    } else if (contents.stoves > 0) {
      role = 'Kitchen';
    } else if (contents.benches > 0) {
      role = 'Workshop';
    } else if (contents.tables > 0) {
      role = 'Dining room';
    } else if (contents.art > 0 && contents.art * 2 >= contents.joy) {
      // Mostly art: somewhere to stand and look.
      role = 'Gallery';
    } else if (contents.joy > 0) {
      role = 'Recreation room';
    } else {
      role = 'Room';
    }
  }
  return {
    id,
    size,
    enclosed,
    role,
    temperature,
    impressiveness,
    beds: contents.beds,
    tables: contents.tables,
    heaters: contents.heat + contents.electricHeat > 0 ? 1 : 0,
  };
}

// One climate update for every enclosed room: leak towards outdoors, then heat.
// `leak` scales how quickly rooms lose heat to the outdoors (insulation halves it).
export function updateRoomTemperatures(
  temps: number[],
  rooms: Rooms,
  contents: RoomContents[],
  outdoor: number,
  leak = 1,
  powered = true,
): void {
  for (let r = 0; r < temps.length; r++) {
    if (!rooms.enclosed[r]) {
      temps[r] = outdoor;
      continue;
    }
    let t = temps[r] + (outdoor - temps[r]) * ROOM_LEAK * leak;
    const size = Math.max(rooms.sizes[r], 4);
    const heat = (contents[r].heat + (powered ? contents[r].electricHeat : 0)) / size;
    if (heat > 0) {
      t += Math.min(heat, Math.max(0, HEATER_TARGET - t));
    }
    if (powered) {
      for (const cooler of contents[r].coolers) {
        t -= Math.min(cooler.amount / size, Math.max(0, t - cooler.target));
      }
    }
    temps[r] = t;
  }
}

// A room this impressive is the colony's showpiece.
export const MAGNIFICENT_ROOM = 60;

export function impressivenessLabel(value: number): string {
  if (value >= MAGNIFICENT_ROOM) {
    return 'magnificent';
  }
  if (value >= 35) {
    return 'impressive';
  }
  if (value >= 25) {
    return 'nice';
  }
  if (value >= 12) {
    return 'decent';
  }
  return 'dull';
}
