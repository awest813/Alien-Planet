import { biomeDef } from './biomes';
import { hash2 } from './rng';
import { eclipseOn } from './storyteller';
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
  // Snow lying on the ground, 0 (none) to 1: it settles while snow falls and melts above freezing, faster in the
  // rain. (Missing from older saves: none.)
  snow?: number;
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
  // Sunlight getting through the cloud, for solar panels (1: a clear sky).
  sun: number;
}

// (Droughts last a day or two: at two to four, one took half of a six-day summer, at half the crops, in a forest
// as in a desert.)
export const WEATHER: Record<WeatherKind, WeatherDef> = {
  clear: { label: 'Clear', icon: '', temp: 0, crops: 1, aim: 1, wet: false, hours: [8, 20], sun: 1 },
  rain: { label: 'Rain', icon: '🌧', temp: -2, crops: 1.2, aim: 0.9, wet: true, hours: [4, 12], sun: 0.55 },
  storm: { label: 'Storm', icon: '⛈', temp: -2, crops: 1.1, aim: 0.8, wet: true, hours: [3, 7], sun: 0.35 },
  fog: { label: 'Fog', icon: '🌫', temp: -1, crops: 1, aim: 0.6, wet: false, hours: [3, 8], sun: 0.65 },
  drought: { label: 'Drought', icon: '🔥', temp: 3, crops: 0.5, aim: 1, wet: false, hours: [24, 48], sun: 1 },
  snow: { label: 'Snow', icon: '❄', temp: -1, crops: 1, aim: 0.85, wet: false, hours: [4, 14], sun: 0.5 },
};

// Rain turns to snow below this temperature before the weather's own, and snow back to rain above the second. (Raised
// so rain never showed below freezing, rain came down as snow on the tundra's coldest wet days, which sent nobody
// indoors as cold rain does: across 96 tundra colonies, five froze to death against none. Rain just below freezing
// is sleet, and the top bar says so.)
const SNOW_BELOW = 0;
const RAIN_ABOVE = 2;

// Rain is called sleet at or below this (the air as it is, rain's own chill counted).
export const SLEET_BELOW = 1;

// Fog forms at night and in the morning (twice as likely then, so there's as much over a day as there was), and
// through the afternoon it lifts (one hour in three) and none rolls in.
const FOG_LIFTS_FROM = 13;
const FOG_LIFTS_TO = 19;
const FOG_LIFT_CHANCE = 1 / 3;
const FOG_EARLY = 2;

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
  const base = () => sim.outdoorTemperature() - weatherDef(sim).temp;
  const thawed = weather.kind === 'snow' && base() > RAIN_ABOVE;
  // And rain that runs into a freezing night turns to snow.
  const frozen = (weather.kind === 'rain' || weather.kind === 'storm') && base() < SNOW_BELOW;
  const afternoon = sim.hour >= FOG_LIFTS_FROM && sim.hour < FOG_LIFTS_TO;
  const lifted = weather.kind === 'fog' && afternoon && sim.rng.next() < FOG_LIFT_CHANCE;
  settle(sim);
  const outOfSeason = (weather.kind === 'drought' && sim.season !== 'Summer') || thawed || frozen || lifted;
  if (sim.tick < weather.until && !outOfSeason) {
    if (weather.kind === 'storm') {
      lightning(sim);
    }
    return;
  }
  // A desert sees little rain and long droughts; the tundra snows from autumn.
  const seasonal = biomeDef(sim.biome).weather?.[sim.season] ?? CHANCES[sim.season];
  // (Fog likelier of a night and a morning, none of an afternoon.)
  const early = sim.hour >= FOG_LIFTS_TO || sim.hour < 10;
  const chances: Partial<Record<WeatherKind, number>> = {
    ...seasonal,
    fog: (seasonal.fog ?? 0) * (afternoon ? 0 : early ? FOG_EARLY : 1),
  };
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
  // Below freezing, rain and storms come down as snow; and well above it, snow comes down as rain (snow chosen on
  // a mild winter's day thawed and cleared within the hour).
  const air = base();
  if ((kind === 'rain' || kind === 'storm') && air < SNOW_BELOW) {
    kind = 'snow';
  } else if (kind === 'snow' && air > RAIN_ABOVE) {
    kind = 'rain';
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

// An hour's snow settling or melting: falling snow covers the ground in about eight hours; above freezing it melts,
// faster the warmer it is, and faster still in the rain. At or below freezing it lies.
function settle(sim: Simulation): void {
  const w = sim.weather;
  const t = sim.outdoorTemperature();
  let snow = w.snow ?? 0;
  if (w.kind === 'snow') {
    snow += 0.12;
  } else if (t > 0) {
    snow -= 0.02 * t * (WEATHER[w.kind].wet ? 2 : 1);
  }
  w.snow = Math.max(0, Math.min(1, snow));
}

// Snow lying deep enough to show.
export const snowOnGround = (sim: Simulation): boolean => (sim.weather.snow ?? 0) >= 0.35;

// ---- Sun and wind ----

// Solar output through the day: nothing at night, full strength at 13:00.
export function daylight(hour: number): number {
  return hour < 6 || hour > 20 ? 0 : Math.sin(((hour - 6) / 14) * Math.PI);
}

// How strong the sun is by season (lower and shorter in winter, between in spring and autumn).
const SEASON_SUN: Record<Season, number> = { Spring: 0.9, Summer: 1, Autumn: 0.85, Winter: 0.6 };

// How strongly the sun falls on a solar panel now, 0 to 1: by the hour and the season, through the cloud, and none
// in an eclipse. (It once ignored the weather: a panel gave as much in a storm as on a clear day.)
export function sunStrength(sim: Simulation): number {
  return eclipseOn(sim) ? 0 : daylight(sim.hour) * SEASON_SUN[sim.season] * weatherDef(sim).sun;
}

// How hard the wind blows, as a share of a turbine's full output: by the weather, and gusting hour to hour (the
// same in a replay of the same colony). Over a year it comes to about half, night and day alike. The one wind:
// turbines turn with it, and the rain, the snow, the leaves and the sound of it follow it too.
const WIND_BY_WEATHER: Record<WeatherKind, number> = {
  storm: 1,
  rain: 0.75,
  snow: 0.65,
  clear: 0.45,
  drought: 0.4,
  fog: 0.12,
};
export function windStrength(sim: Simulation): number {
  const base = WIND_BY_WEATHER[sim.weather.kind] ?? 0.45;
  const hour = Math.floor(sim.tick / TICKS_PER_HOUR);
  const gust = (hash2(hour, 7, 911) - 0.5) * 0.5;
  return Math.max(0, Math.min(1, base + gust * base));
}

// Which way it blows across the map: from the west (1) or the east (-1), changing day to day.
export const windFrom = (sim: Simulation): number => (hash2(sim.day, 13, 577) < 0.5 ? 1 : -1);

// The wind in words.
export function windWords(strength: number): string {
  return strength >= 0.85
    ? 'a gale'
    : strength >= 0.6
      ? 'a strong wind'
      : strength >= 0.35
        ? 'a stiff breeze'
        : strength >= 0.15
          ? 'a light breeze'
          : 'barely a breath of wind';
}

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
  // Wooden buildings burn; stone, metal and anything that's itself a fire (a torch too) don't. Bridges are
  // left out so a fire never strands anyone in deep water.
  // (Torches burn by design, and a grave doesn't: burned out and rebuilt, it forgot who lay there.)
  const wooden = def.build?.cost.some((c) => c.item === itemId('wood'));
  return wooden && !def.bridge && def.heater === 0 && !def.burns && !def.power && def.key !== 'grave' ? 1.5 : 0;
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
const FIREPROOF = new Set(['stone', 'stoneBlocks', 'silver', 'iron', 'ironOre', 'bricks', 'clay']);

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
    // Rain falls on the burning thing itself: a door counts as dry for whoever stands in the doorway, but not
    // for the door (a burning door in the rain burned down, leaving the room open).
    const raining = weatherDef(sim).wet && w.roof[tile] === NONE && !sim.isIndoors(tile);
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
      // (Said only if it is: a sculpture is gone for good, and so is anything that was to come down anyway.)
      const again = sim.rebuild(tile, feature);
      const name = def.name.toLowerCase();
      sim.addLog(
        `Fire destroyed ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}.${again ? " It's marked for rebuilding." : ''}`,
        'warn',
      );
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
    sim.addLog('Lightning struck near the colony and started a fire!', 'danger', true, { tile });
    sim.events.push('fire');
  }
}
