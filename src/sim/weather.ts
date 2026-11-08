import { TICKS_PER_HOUR } from './constants';
import { NONE, featureDef, itemDef, itemId } from './defs';
import { damage } from './health';
import { Season } from './seasons';
import type { Simulation } from './simulation';
import { Designation, Filth } from './world';

// Weather comes in spells of hours (droughts last days). It shifts the temperature, soaks
// colonists caught outside, speeds or stunts crops, thickens into fog that spoils aim, and
// in storms throws lightning that can set the colony alight.

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'fog' | 'drought' | 'snow';

export interface WeatherState {
  kind: WeatherKind;
  // Tick when this spell ends and the next is rolled.
  until: number;
}

interface WeatherDef {
  label: string;
  icon: string;
  // Added to the outdoor temperature.
  temp: number;
  // Crop growth multiplier outdoors.
  crops: number;
  // Ranged hit chance multiplier.
  aim: number;
  // Soaks anyone outdoors (and douses fires in the open).
  wet: boolean;
  // Spell length in hours.
  hours: [number, number];
}

export const WEATHER: Record<WeatherKind, WeatherDef> = {
  clear: { label: 'Clear', icon: '', temp: 0, crops: 1, aim: 1, wet: false, hours: [8, 20] },
  rain: { label: 'Rain', icon: '🌧', temp: -2, crops: 1.2, aim: 0.9, wet: true, hours: [4, 12] },
  storm: { label: 'Storm', icon: '⛈', temp: -2, crops: 1.1, aim: 0.8, wet: true, hours: [3, 7] },
  fog: { label: 'Fog', icon: '🌫', temp: -1, crops: 1, aim: 0.6, wet: false, hours: [3, 8] },
  drought: { label: 'Drought', icon: '🔥', temp: 3, crops: 0.5, aim: 1, wet: false, hours: [48, 96] },
  snow: { label: 'Snow', icon: '❄', temp: -1, crops: 1, aim: 0.85, wet: false, hours: [4, 14] },
};

// How likely each kind of weather is when a spell ends, by season.
const CHANCES: Record<Season, Partial<Record<WeatherKind, number>>> = {
  Spring: { clear: 0.5, rain: 0.3, storm: 0.08, fog: 0.12 },
  Summer: { clear: 0.58, rain: 0.15, storm: 0.12, fog: 0.05, drought: 0.1 },
  Autumn: { clear: 0.42, rain: 0.3, storm: 0.06, fog: 0.22 },
  Winter: { clear: 0.5, snow: 0.35, fog: 0.15 },
};

export const freshWeather = (): WeatherState => ({ kind: 'clear', until: 0 });

// Out in the rain it feels this many degrees colder: it soaks through clothes.
export const WET_CHILL = 3;

// Called once an hour: when the current spell runs out, roll the next.
export function updateWeather(sim: Simulation): void {
  const weather = sim.weather;
  // A spell that no longer fits ends early: droughts with the summer, snow once it thaws.
  const thawed = weather.kind === 'snow' && sim.outdoorTemperature() - weatherDef(sim).temp > 2;
  // And rain that runs into a freezing night turns to snow.
  const frozen =
    (weather.kind === 'rain' || weather.kind === 'storm') && sim.outdoorTemperature() - weatherDef(sim).temp < 0;
  const outOfSeason = (weather.kind === 'drought' && sim.season !== 'Summer') || thawed || frozen;
  if (sim.tick < weather.until && !outOfSeason) {
    if (weather.kind === 'storm') {
      lightning(sim);
    }
    return;
  }
  const chances = CHANCES[sim.season];
  let roll = sim.rng.next() * Object.values(chances).reduce((sum, p) => sum + (p ?? 0), 0);
  let kind: WeatherKind = 'clear';
  for (const [key, p] of Object.entries(chances) as [WeatherKind, number][]) {
    roll -= p;
    if (roll <= 0) {
      kind = key;
      break;
    }
  }
  // The first day is for getting a roof up: no lightning fires yet, just rain.
  if (kind === 'storm' && sim.day <= 1) {
    kind = 'rain';
  }
  // Below freezing, rain and storms come down as snow.
  if ((kind === 'rain' || kind === 'storm') && sim.outdoorTemperature() - weatherDef(sim).temp < 0) {
    kind = 'snow';
  }
  const [lo, hi] = WEATHER[kind].hours;
  const changed = kind !== weather.kind;
  weather.kind = kind;
  weather.until = sim.tick + sim.rng.int(lo, hi) * TICKS_PER_HOUR;
  if (changed) {
    const story = kind === 'storm' || kind === 'drought';
    const text = {
      clear: 'The skies clear.',
      rain: 'Rain sets in.',
      storm: 'A storm rolls in. Lightning can start fires.',
      fog: 'Fog settles over the valley: shots will often miss.',
      drought: 'A drought has set in: crops will struggle and fires spread fast.',
      snow: 'Snow begins to fall.',
    }[kind];
    sim.addLog(text, story ? 'warn' : 'info', story);
  }
}

export const weatherDef = (sim: Simulation): WeatherDef => WEATHER[sim.weather.kind];

// Whether someone (or something) on this tile is out in the rain (dry snow doesn't soak); a
// roof or an enclosed room keeps it off.
export function isWet(sim: Simulation, tile: number): boolean {
  return weatherDef(sim).wet && !sim.isRoofed(tile);
}

// ---- Fire ----

// Hours a fire takes to burn through what's on a tile (0: nothing there burns).
export function burnTime(sim: Simulation, tile: number): number {
  const f = sim.world.feature[tile];
  if (f === NONE) {
    return 0;
  }
  const def = featureDef(f);
  if (def.key === 'tree') {
    return 2;
  }
  if (def.key === 'berryBush' || def.crop) {
    return 0.6;
  }
  // Wooden buildings burn; stone, metal and anything that's itself a fire don't. Bridges are
  // left out so a fire never strands anyone in deep water.
  const wooden = def.build?.cost.some((c) => c.item === itemId('wood'));
  return wooden && !def.bridge && def.heater === 0 && !def.power ? 1.5 : 0;
}

// Sets a tile alight. Returns whether it caught.
export function ignite(sim: Simulation, tile: number): boolean {
  const w = sim.world;
  const time = burnTime(sim, tile);
  if (time <= 0 || w.fire[tile] > 0) {
    return false;
  }
  w.fire[tile] = time;
  sim.burning.add(tile);
  w.markDirty(tile);
  return true;
}

const FIRE_SPREAD = 0.04;
// In the rain, the chance per hour that a fire is put out (leaving what was burning standing).
const RAIN_DOUSE = 2;
// Things that don't burn when the fire under them burns out.
const FIREPROOF = new Set(['stone', 'stoneBlocks', 'silver']);

// Advances every fire by `hours`: burning down what's on fire, spreading to neighbours (fast in
// a drought), scorching anyone standing in the flames. Rain stops the spread and soon puts it out.
export function updateFires(sim: Simulation, hours: number): void {
  const w = sim.world;
  const drought = sim.weather.kind === 'drought';
  // Tile order, not ignition order, so a game loaded from a save (which rebuilds the set by
  // scanning tiles) draws from the RNG in the same order and spreads the same way.
  for (const tile of [...sim.burning].sort((a, b) => a - b)) {
    // Whatever was burning has been chopped or torn down: nothing left to feed the flames.
    if (burnTime(sim, tile) <= 0) {
      putOut(sim, tile);
      continue;
    }
    const raining = isWet(sim, tile);
    if (raining && sim.rng.next() < RAIN_DOUSE * hours) {
      putOut(sim, tile);
      continue;
    }
    w.fire[tile] -= hours;
    if (w.fire[tile] <= 0) {
      burnOut(sim, tile);
      continue;
    }
    if (!raining) {
      for (const n of w.neighbors(tile, false)) {
        if (sim.rng.next() < FIRE_SPREAD * (drought ? 2 : 1)) {
          ignite(sim, n);
        }
      }
    }
    for (const c of sim.living()) {
      if (c.tile === tile) {
        damage(sim, c, 0.03, 'burn');
      }
    }
  }
}

// The fire has consumed the tile: its building or plant is gone, and so is anything that burns.
function burnOut(sim: Simulation, tile: number): void {
  const w = sim.world;
  w.fire[tile] = 0;
  sim.burning.delete(tile);
  sim.dousing.delete(tile);
  const item = w.itemType[tile];
  if (item !== NONE && !FIREPROOF.has(itemDef(item).key)) {
    w.takeItem(tile, w.itemCount[tile]);
  }
  if (w.feature[tile] !== NONE && burnTime(sim, tile) > 0) {
    const feature = w.feature[tile];
    const def = featureDef(feature);
    w.setFeature(tile, NONE);
    // Orders to chop or harvest what's gone go with it (a building's are settled by rebuild()).
    if (def.natural || def.crop) {
      w.designation[tile] = Designation.NONE;
    }
    // Trees and crops burning is expected; losing a building is worth a mention, and it goes
    // back on the build list.
    if (!def.natural && !def.crop) {
      w.addFilth(tile, Filth.RUBBLE, 2);
      sim.rebuild(tile, feature);
      sim.addLog(`Fire destroyed a ${def.name.toLowerCase()}. It's marked for rebuilding.`, 'warn');
    }
  }
  w.markDirty(tile);
}

function putOut(sim: Simulation, tile: number): void {
  sim.world.fire[tile] = 0;
  sim.burning.delete(tile);
  sim.dousing.delete(tile);
  sim.world.markDirty(tile);
}

// How much beating at the flames puts a fire out (a healthy firefighter manages 0.04 a tick).
const DOUSE_NEEDED = 1;

// Called by a firefighter beating at the flames. Returns true once the fire is out.
// Firefighting is its own race against the fire burning through the tile: it doesn't speed the
// burning along.
export function douse(sim: Simulation, tile: number, amount: number): boolean {
  if (sim.world.fire[tile] <= 0) {
    return true;
  }
  const done = (sim.dousing.get(tile) ?? 0) + amount;
  if (done >= DOUSE_NEEDED) {
    putOut(sim, tile);
    return true;
  }
  sim.dousing.set(tile, done);
  return false;
}

// During a storm, now and then lightning strikes near the colony.
function lightning(sim: Simulation): void {
  if (sim.rng.next() >= 0.4) {
    return;
  }
  const w = sim.world;
  const home = sim.homeTile();
  if (home === undefined) {
    return;
  }
  const x = w.xOf(home) + sim.rng.int(-25, 25);
  const y = w.yOf(home) + sim.rng.int(-25, 25);
  if (!w.inBounds(x, y)) {
    return;
  }
  const tile = w.idx(x, y);
  if (sim.isRoofed(tile)) {
    return;
  }
  sim.lastLightning = sim.tick;
  if (ignite(sim, tile)) {
    sim.addLog('Lightning struck near the colony and started a fire!', 'danger', true);
    sim.events.push('fire');
  }
}
