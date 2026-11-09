// Headless balance harness: an "autoplayer" runs a sensible colony on many seeds and prints
// survival, combat, health, mood and social statistics.
//
//   npx tsx scripts/balance.ts [days=20] [seeds=8] [passive|defend] [craft] [diplomat] [peaceful|harsh] [trace] [size=64] [seed=N] [start=K] [nohunt] [surplus] [pen] [flow]
//     [biome=tundra|desert|forest] [map=river|island]
//
// "passive" never drafts during raids, to measure the worst case; "defend" holds a sandbag line; "craft" builds a
// kiln and a smelter and makes bricks, iron and iron goods; "diplomat" buys off raids, sets the village policies
// as things go and answers the Meadow Kin's requests; "peaceful" and "harsh" pick the
// storyteller difficulty (standard otherwise); "trace" prints the colony whenever someone dies;
// "size=96" or "size=128" plays on a bigger map; "seed=N" replays one colony; "start=K" skips the
// first K seeds; "nohunt" leaves the wildlife alone. With DEBUG=1 in the environment, a trace also
// shows research, production, bills, rooms and heaters.
import { Biome, MapKind } from '../src/sim/biomes';
import { colonistTarget, lineOfSight } from '../src/sim/combat';
import {
  ANIMALS,
  FACTIONS,
  FEATURES,
  NONE,
  RECIPES,
  RESEARCH,
  featureDef,
  featureId,
  itemDef,
  itemId,
  researchDef,
  terrainDef,
  weaponDef,
} from '../src/sim/defs';
import { painOf } from '../src/sim/health';
import {
  SETTLER_GOODWILL,
  atPeace,
  tributeCost,
  TRUCE_GOODWILL,
  fightersHired,
  giftGoodwill,
  hireCost,
  onGoodTerms,
  settlerCost,
  settlerDays,
  truceDays,
} from '../src/sim/diplomacy';
import { RUINS, cannotGo, supplyCost } from '../src/sim/expeditions';
import { PRISONER_BED, roomToJoin } from '../src/sim/prisoners';
import { isAvailable, researchCost } from '../src/sim/research';
import { applyTrade, colonyStock, goodwillOf, tradeOpen } from '../src/sim/trade';
import { OBJECTIVES, Simulation, TICKS_PER_HOUR } from '../src/sim/simulation';
import { mutualOpinion } from '../src/sim/social';
import { Difficulty, foodDays } from '../src/sim/storyteller';
import { Designation, GROW_ZONE, STOCKPILE_ZONE } from '../src/sim/world';

const days = Number(process.argv[2] ?? 20);
const seeds = Number(process.argv[3] ?? 8);
const passive = process.argv.includes('passive');
// "defend" fights from cover: a ring of sandbags round the hut once fortifications are known, and in a
// raid colonists hold just inside it on the side facing the raiders instead of advancing.
const defend = process.argv.includes('defend');
// "craft": a craftsman. Pottery and smelting early, a kiln and a smelter, clay and iron ore dug, bricks fired and
// iron smelted while there's clay and ore, and iron made into tool kits, swords and mail.
const craft = process.argv.includes('craft');
// "diplomat": pays a raiding faction off when it can spare the silver, keeps the village policies in step with
// food and mood, gifts only while goodwill is low, and answers requests (making what's asked for, or turning it
// down in good time rather than letting it lapse).
const diplomat = process.argv.includes('diplomat');
const trace = process.argv.includes('trace');
const noHunt = process.argv.includes('nohunt');
// "surplus" sets the hunting policy to leave a breeding pair of each kind.
const surplus = process.argv.includes('surplus');
// "flow" prints a day-by-day table of food, materials and wildlife, averaged over the seeds.
const flow = process.argv.includes('flow');
// "pen" fences a pen with a gate and a trough once the colony is settled, and tames a pair to keep in it.
const keepPen = process.argv.includes('pen');
// Nutrition a colonist eats in a day (as the top bar's "days of food" counts it).
const DAILY_NUTRITION = 1.4;
// "policy=frugal,long,rest" sets the colony's policies from the start.
const policy =
  process.argv
    .find((a) => a.startsWith('policy='))
    ?.slice(7)
    .split(',') ?? [];
const mapSize = Number(process.argv.find((a) => a.startsWith('size='))?.slice(5) ?? 64);
// "biome=tundra" (or desert, forest) and "map=river" (or island) pick the land.
const biome = (process.argv.find((a) => a.startsWith('biome='))?.slice(6) ?? 'temperate') as Biome;
const mapKind = (process.argv.find((a) => a.startsWith('map='))?.slice(4) ?? 'valley') as MapKind;
const difficulty: Difficulty = process.argv.includes('harsh')
  ? 'harsh'
  : process.argv.includes('peaceful')
    ? 'peaceful'
    : 'standard';

const crop = (key: string) => GROW_ZONE + featureId(key);
const RESEARCH_ORDER = [
  'hearths',
  'cropRotation',
  'milling',
  'tailoring',
  'archery',
  'fieldMedicine',
  'insulation',
  'bedding',
  'fortifications',
  'electricity',
  'refrigeration',
  'solarPower',
  'sunLamps',
  'optics',
  'signalBeacon',
  'pottery',
  'smelting',
  'deepMining',
  'masonry',
  'irrigation',
  'preserving',
  'husbandry',
  'herbalism',
  'engineering',
  'prospecting',
  'fineArts',
  'civics',
  'longbows',
  'tactics',
  'surgery',
];

// A defending colony learns longbows (which outrange raiders' bows) straight after fortifications; a crafting one
// learns pottery and smelting after field medicine.
const reorder = (order: string[], after: string, keys: string[]) =>
  order.filter((k) => !keys.includes(k)).flatMap((k) => (k === after ? [k, ...keys] : [k]));
const researchOrder = reorder(
  defend ? reorder(RESEARCH_ORDER, 'fortifications', ['longbows']) : RESEARCH_ORDER,
  craft ? 'fieldMedicine' : '',
  craft ? ['pottery', 'smelting'] : [],
);
const ARMS = ['crossbow', 'recurveBow', 'scaleArmor', 'leather'];

// Finds the nearest w×h rectangle to the colonists where every tile can take a blueprint.
function findSite(sim: Simulation, w: number, h: number, avoid: Set<number>): { x: number; y: number } | null {
  const world = sim.world;
  // Around (and reachable from) someone still alive.
  const anchor = (sim.living()[0] ?? sim.colonists[0]).tile;
  const cx = world.xOf(anchor);
  const cy = world.yOf(anchor);
  // Only where the colonists can walk to.
  const home = sim.regionOf(anchor);
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 1; y + h < world.height - 1; y++) {
    for (let x = 1; x + w < world.width - 1; x++) {
      const d = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
      if (best && d >= best.d) {
        continue;
      }
      let ok = true;
      for (let ty = y; ty < y + h && ok; ty++) {
        for (let tx = x; tx < x + w && ok; tx++) {
          const i = world.idx(tx, ty);
          const f = world.feature[i];
          ok =
            !avoid.has(i) &&
            sim.regionOf(i) === home &&
            terrainDef(world.terrain[i]).buildable &&
            terrainDef(world.terrain[i]).fertility > 0 &&
            (f === NONE || !!FEATURES[f - 1].harvest) &&
            world.blueprint[i] === NONE;
        }
      }
      if (ok) {
        best = { x, y, d };
      }
    }
  }
  return best;
}

function claim(avoid: Set<number>, sim: Simulation, x: number, y: number, w: number, h: number): void {
  for (let ty = y - 1; ty <= y + h; ty++) {
    for (let tx = x - 1; tx <= x + w; tx++) {
      if (sim.world.inBounds(tx, ty)) {
        avoid.add(sim.world.idx(tx, ty));
      }
    }
  }
}

interface Result {
  seed: number;
  living: number;
  total: number;
  deaths: string[];
  deathCauses: Record<string, number>;
  raids: number;
  raidKills: number;
  diseaseCases: number;
  diseaseDeaths: number;
  breaks: number;
  avgMood: number;
  minMood: number;
  friendDay: number;
  rivals: number;
  lovers: number;
  starvingHours: number;
  starvingByDay: Record<number, number>;
  objectives: number;
  research: number;
  // Day Tailoring (and so parkas) arrived; -1 if never.
  tailoringDay: number;
  frost: number;
  events: Record<string, number>;
  // One row per day at dawn, for the "flow" report.
  daily: Record<string, number>[];
  // Summed mood from each thought over every colonist-hour, and how many colonist-hours were counted.
  moodBy: Record<string, number>;
  colonistHours: number;
  // Colonist-hours with the recreation need under 30%.
  joyLowHours: number;
  // Impressiveness of each enclosed room at the end, by role.
  rooms: { role: string; impressiveness: number }[];
  mess: number;
  births: number;
  smashed: number;
  infections: number;
  scars: number;
  obsessions: number;
  legends: number;
  grown: number;
  children: number;
  oldAge: number;
  fellWounded: number;
  captured: number;
  elections: number;
  shaftDepth: number;
  breaches: number;
  requestsDone: number;
  requestsFailed: number;
  gifts: number;
  kinGoodwill: number;
  // The other friendly faction, and the raiders (lowest of them).
  hillGoodwill: number;
  raiderGoodwill: number;
  truces: number;
  settlers: number;
  ransomed: number;
  expeditions: number;
  alliances: number;
  callsAnswered: number;
  callsRefused: number;
  silver: number;
  goods: number;
  leaderless: number;
  recruited: number;
  prisonBeds: number;
  // "craft": the workshops standing at the end, and what went through them.
  kilns: number;
  smelters: number;
  made: Record<string, number>;
  // "diplomat": tribute paid (times, silver), raids bought off on the way in, policy changes, the days spent
  // under each policy, requests turned down in time, and fighters hired.
  tributes: number;
  tributeSilver: number;
  boughtOff: number;
  policyChanges: number;
  policyDays: Record<string, number>;
  declined: number;
  hired: number;
}

// What the craft report counts as made (or dug).
const CRAFT_GOODS = ['clay', 'ironOre', 'bricks', 'iron', 'toolKit', 'ironSword', 'ironMail'];
// Silver the diplomat keeps back after paying tribute.
const TRIBUTE_RESERVE = 50;
// The most prisoner beds the colony builds.
const MAX_PRISON_BEDS = 8;

// Every enclosed room on the map, once each.
function roomsAtEnd(sim: Simulation): { role: string; impressiveness: number }[] {
  const seen = new Map<number, { role: string; impressiveness: number }>();
  for (let i = 0; i < sim.world.size; i++) {
    const r = sim.roomAt(i);
    if (r && r.enclosed && !seen.has(r.id)) {
      seen.set(r.id, { role: r.role, impressiveness: r.impressiveness });
    }
  }
  return [...seen.values()];
}

// What the "flow" report tracks each dawn.
const FLOW_STOCKS = ['wood', 'stone', 'stoneBlocks', 'cloth', 'leather', 'herbalMedicine', 'silver'];
const FLOW_MADE = [
  'potatoes',
  'berries',
  'rawMeat',
  'rawFish',
  'meal',
  'fineMeal',
  'milk',
  'egg',
  'grain',
  'bread',
  'driedMeat',
  'wood',
  'stone',
];
function snapshot(sim: Simulation): Record<string, number> {
  const totals = sim.resourceTotals();
  const nutrition = totals.reduce((sum, t) => sum + itemDef(t.item).nutrition * t.total, 0);
  const living = Math.max(1, sim.living().length);
  const row: Record<string, number> = {
    day: sim.day,
    living: sim.living().length,
    foodDays: nutrition / (living * DAILY_NUTRITION),
    meals: sim.stockOf(itemId('meal')) + sim.stockOf(itemId('fineMeal')),
    crops: sim.countFeature((f) => !!featureDef(f).crop),
    wild: sim.animals.filter((a) => !a.tame).length,
    prey: sim.animals.filter((a) => !a.tame && !ANIMALS[a.kind].preys).length,
    predators: sim.animals.filter((a) => !a.tame && !!ANIMALS[a.kind].preys).length,
    tame: sim.animals.filter((a) => a.tame).length,
    trees: sim.countFeature((f) => featureDef(f).key === 'tree'),
    hunger: sim.living().filter((c) => c.needs.food < 0.25).length,
  };
  for (const key of FLOW_STOCKS) {
    row[key] = sim.stockOf(itemId(key));
  }
  for (const key of FLOW_MADE) {
    row[`+${key}`] = sim.stats.produced[key] ?? 0;
  }
  return row;
}

function play(seed: number): Result {
  const sim = Simulation.newColony(seed, difficulty, mapSize, { biome, map: mapKind });
  sim.apply({
    type: 'policy',
    rations: policy.includes('frugal') ? 'frugal' : policy.includes('generous') ? 'generous' : 'normal',
    hours: policy.includes('long') ? 'long' : policy.includes('short') ? 'short' : 'normal',
    restDays: policy.includes('rest'),
    hunting: surplus ? 'surplus' : 'all',
  });
  const w = sim.world;
  const avoid = new Set<number>();
  const at = (x: number, y: number) => w.idx(x, y);
  const cx = w.xOf(sim.colonists[0].tile);
  const cy = w.yOf(sim.colonists[0].tile);

  // Like a sensible player, make the best researcher research first, so tailoring (parkas) and
  // hearths arrive well before winter.
  const researcher = [...sim.colonists].sort((a, b) => b.skills.research - a.skills.research)[0];
  sim.apply({ type: 'priority', colonist: researcher.id, work: 'research', value: 1 });
  // A craftsman puts the best crafter (other than the researcher) on crafting first.
  const crafter = [...sim.colonists]
    .filter((c) => c !== researcher)
    .sort((a, b) => b.skills.crafting - a.skills.crafting)[0];
  if (craft && crafter) {
    sim.apply({ type: 'priority', colonist: crafter.id, work: 'crafting', value: 1 });
  }

  // Day 1: chop and forage nearby, mine a little, a stockpile, and a 9x7 hut with a door, beds and a fire.
  sim.apply({ type: 'designate', rect: { x0: cx - 15, y0: cy - 15, x1: cx + 15, y1: cy + 15 }, kind: 'chop' });
  sim.apply({ type: 'designate', rect: { x0: cx - 20, y0: cy - 20, x1: cx + 20, y1: cy + 20 }, kind: 'forage' });
  sim.apply({ type: 'designate', rect: { x0: cx - 10, y0: cy - 10, x1: cx + 10, y1: cy + 10 }, kind: 'mine' });
  const hut = findSite(sim, 9, 7, avoid);
  // Up to twelve beds in two rows, clear of the door, fire and armchair.
  const bedSlots = [...[1, 2, 3, 4, 5, 6, 7].map((k) => [k, 1]), ...[1, 2, 3, 4, 5].map((k) => [k, 2])];
  let bedsBuilt = 0;
  // The sandbag ring two tiles out from the hut, and the line just inside it where defenders stand.
  const ring = (offset: number) => {
    const tiles: number[] = [];
    if (hut) {
      const [x0, y0, x1, y1] = [hut.x - offset, hut.y - offset, hut.x + 8 + offset, hut.y + 6 + offset];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if ((x === x0 || x === x1 || y === y0 || y === y1) && w.inBounds(x, y)) {
            tiles.push(at(x, y));
          }
        }
      }
    }
    return tiles;
  };
  const sandbagRing = ring(2);
  const holdLine = ring(1);
  let sandbagsPlaced = false;
  if (hut) {
    claim(avoid, sim, hut.x - (defend ? 2 : 0), hut.y - (defend ? 2 : 0), defend ? 13 : 9, defend ? 11 : 7);
    const walls: number[] = [];
    for (let y = hut.y; y < hut.y + 7; y++) {
      for (let x = hut.x; x < hut.x + 9; x++) {
        if (x === hut.x || y === hut.y || x === hut.x + 8 || y === hut.y + 6) {
          walls.push(at(x, y));
        }
      }
    }
    sim.apply({ type: 'build', feature: featureId('woodWall'), tiles: walls });
    sim.apply({ type: 'build', feature: featureId('door'), tiles: [at(hut.x + 4, hut.y + 6)] });
    sim.apply({
      type: 'build',
      feature: featureId('bed'),
      tiles: bedSlots.slice(0, sim.colonists.length).map(([bx, by]) => at(hut.x + bx, hut.y + by)),
    });
    bedsBuilt = sim.colonists.length;
    sim.apply({ type: 'build', feature: featureId('campfire'), tiles: [at(hut.x + 7, hut.y + 3)] });
  }
  const stock = findSite(sim, 5, 3, avoid);
  if (stock) {
    claim(avoid, sim, stock.x, stock.y, 5, 3);
    sim.apply({
      type: 'zone',
      rect: { x0: stock.x, y0: stock.y, x1: stock.x + 4, y1: stock.y + 2 },
      zone: STOCKPILE_ZONE,
    });
  }

  let builtDay2 = false;
  let secondFarm = false;
  let thirdFarm = false;
  let hearthPlaced = false;
  let gamesPlaced = false;
  let artPlaced = false;
  let lutePlaced = false;
  let gravesPlaced = false;
  let rackPlaced = false;
  let hospitalPlaced = false;
  let cutterPlanned = false;
  let millPlaced = false;
  let prisonPlaced = false;
  let prisonBeds = 0;
  let kilnPlaced = false;
  let smelterPlaced = false;
  let tributeSilver = 0;
  let boughtOff = 0;
  let policyChanges = 0;
  let declined = 0;
  const policyDays: Record<string, number> = {};
  const fell = new Set<number>();
  let beaconPlaced = false;
  let shaftPlaced = false;
  let poplarsPlanted = 0;
  let shipsLanded = 0;
  let bannerPlaced = false;
  let labTile = -1;
  let lessonBoardPlaced = false;
  let telescopePlaced = false;
  let fishingPlaced = false;
  let penBuilt = false;
  let chopRadius = 15;
  const setBill = (key: string, target: number) => {
    const recipe = RECIPES.find((r) => r.key === key)!;
    if (sim.bills[recipe.id].target !== target) {
      sim.apply({ type: 'bill', recipe: recipe.id, target });
    }
  };
  // One building on a free tile near the colonists; the tile, or null if there's no room.
  const buildOne = (key: string): number | null => {
    const spot = findSite(sim, 1, 1, avoid);
    if (!spot) {
      return null;
    }
    claim(avoid, sim, spot.x, spot.y, 1, 1);
    sim.apply({ type: 'build', feature: featureId(key), tiles: [at(spot.x, spot.y)] });
    return at(spot.x, spot.y);
  };
  // Marks the nearest few deposits of a kind the colonists can get at for mining, unless enough are marked already.
  const dig = (key: string, count: number) => {
    const f = featureId(key);
    const home = (sim.living()[0] ?? sim.colonists[0]).tile;
    const region = sim.regionOf(home);
    const reachable = (i: number) =>
      sim.regionOf(i) === region || w.neighbors(i).some((n) => sim.regionOf(n) === region);
    const marked = sim.nearest(home, (i) => w.feature[i] === f && w.designation[i] === Designation.MINE, count);
    const more = sim.nearest(
      home,
      (i) => w.feature[i] === f && w.designation[i] === Designation.NONE && reachable(i),
      count,
    );
    for (const i of more.slice(0, count - marked.length)) {
      sim.apply({ type: 'designate', rect: { x0: w.xOf(i), y0: w.yOf(i), x1: w.xOf(i), y1: w.yOf(i) }, kind: 'mine' });
    }
  };
  let friendDay = -1;
  let starvingHours = 0;
  const starvingByDay: Record<number, number> = {};
  let moodSum = 0;
  let moodSamples = 0;
  let minMood = 100;
  const hours = days * 24;
  const daily: Record<string, number>[] = [];
  const moodBy: Record<string, number> = {};
  let colonistHours = 0;
  let joyLowHours = 0;

  for (let hour = 0; hour < hours; hour++) {
    for (let t = 0; t < TICKS_PER_HOUR; t += 20) {
      // Raid response, checked frequently like a player would: draft once the raiders close in
      // (on a big map they can take hours to walk in from the edge).
      // Maddened animals get the same answer as raiders.
      const manhunters = sim.animals.some((a) => a.manhunter && a.hp > 0 && a.revengeOn >= 0);
      // The diplomat buys off a raid still on its way in (or a siege still camped), if the silver can be spared.
      const raid = sim.raid;
      if (diplomat && raid && !raid.outcome && (raid.arrivedTick === undefined || !raid.siege?.attacking)) {
        const cost = tributeCost(sim);
        if (!atPeace(sim, raid.faction) && colonyStock(sim, itemId('silver')) >= cost + TRIBUTE_RESERVE) {
          sim.apply({ type: 'tribute', faction: raid.faction });
          tributeSilver += cost;
          boughtOff++;
        }
      }
      if (!passive && ((sim.enemies.some((e) => !e.fleeing) && sim.raid?.arrivedTick !== undefined) || manhunters)) {
        for (const c of sim.living()) {
          const fit = !c.health.downed && painOf(c) < 0.35;
          if (fit !== c.drafted) {
            sim.apply({ type: 'draft', colonist: c.id, drafted: fit });
          }
          // Advance on the raiders only as far as the first spot in bow range with a clear shot
          // (drafted colonists walking to a spot don't stop to shoot on the way).
          const target = sim.enemies.find((e) => !e.fleeing);
          const reach = weaponDef(c.weapon).range - 1;
          if (defend && sandbagsPlaced && target && c.drafted && c.path.length === 0 && !colonistTarget(sim, c)) {
            // Hold the line: the free spot just inside the sandbags nearest the raiders.
            const taken = new Set(
              sim
                .living()
                .filter((o) => o !== c)
                .map((o) => o.path[o.path.length - 1] ?? o.tile),
            );
            const spot = holdLine
              .filter((i) => w.isPassable(i) && !taken.has(i))
              .sort((a, b) => w.distance(a, target.tile) - w.distance(b, target.tile))[0];
            if (spot !== undefined && spot !== c.tile) {
              sim.apply({ type: 'move', colonist: c.id, tile: spot });
            }
          } else if (c.drafted && target && c.path.length === 0 && !colonistTarget(sim, c)) {
            const route = sim.pathfinder.find(c.tile, [target.tile]) ?? [];
            const spot = route.find((i) => w.distance(i, target.tile) <= reach && lineOfSight(w, i, target.tile));
            if (spot !== undefined) {
              sim.apply({ type: 'move', colonist: c.id, tile: spot });
            }
          }
        }
      }
      for (let i = 0; i < 20; i++) {
        sim.step();
      }
    }

    // Day 2 onwards: farming, kitchen, workshop and recreation.
    if (!builtDay2 && sim.day >= 2) {
      builtDay2 = true;
      const farm = findSite(sim, 7, 5, avoid);
      if (farm) {
        claim(avoid, sim, farm.x, farm.y, 7, 5);
        sim.apply({
          type: 'zone',
          rect: { x0: farm.x, y0: farm.y, x1: farm.x + 6, y1: farm.y + 4 },
          zone: crop('potatoPlant'),
        });
      }
      const herbs = findSite(sim, 4, 3, avoid);
      if (herbs) {
        claim(avoid, sim, herbs.x, herbs.y, 4, 3);
        sim.apply({
          type: 'zone',
          rect: { x0: herbs.x, y0: herbs.y, x1: herbs.x + 3, y1: herbs.y + 2 },
          zone: crop('healrootPlant'),
        });
      }
      const cotton = findSite(sim, 4, 3, avoid);
      if (cotton) {
        claim(avoid, sim, cotton.x, cotton.y, 4, 3);
        sim.apply({
          type: 'zone',
          rect: { x0: cotton.x, y0: cotton.y, x1: cotton.x + 3, y1: cotton.y + 2 },
          zone: crop('cottonPlant'),
        });
      }
      const kitchen = findSite(sim, 7, 1, avoid);
      if (kitchen) {
        claim(avoid, sim, kitchen.x, kitchen.y, 7, 1);
        sim.apply({ type: 'build', feature: featureId('stove'), tiles: [at(kitchen.x, kitchen.y)] });
        sim.apply({ type: 'build', feature: featureId('table'), tiles: [at(kitchen.x + 2, kitchen.y)] });
        sim.apply({ type: 'build', feature: featureId('craftingBench'), tiles: [at(kitchen.x + 4, kitchen.y)] });
        sim.apply({ type: 'build', feature: featureId('horseshoePin'), tiles: [at(kitchen.x + 6, kitchen.y)] });
      }
      if (hut) {
        sim.apply({ type: 'build', feature: featureId('armchair'), tiles: [at(hut.x + 1, hut.y + 5)] });
      }
      const lab = findSite(sim, 1, 1, avoid);
      if (lab) {
        claim(avoid, sim, lab.x, lab.y, 1, 1);
        labTile = at(lab.x, lab.y);
        sim.apply({ type: 'build', feature: featureId('researchBench'), tiles: [labTile] });
      }
    }
    // No spot for the bench on day 2 (someone standing in the way, say): try again each morning.
    const bench = featureId('researchBench');
    if (builtDay2 && labTile < 0 && Math.floor(sim.hour) === 6) {
      const lab = findSite(sim, 1, 1, avoid);
      if (lab) {
        claim(avoid, sim, lab.x, lab.y, 1, 1);
        labTile = at(lab.x, lab.y);
        sim.apply({ type: 'build', feature: bench, tiles: [labTile] });
      }
    }
    // Mining and building can wall a planned bench off; a player would notice and plan it elsewhere.
    if (
      labTile >= 0 &&
      Math.floor(sim.hour) === 6 &&
      w.feature[labTile] !== bench &&
      sim.regionOf(labTile) !== sim.regionOf(sim.living()[0]?.tile ?? labTile)
    ) {
      sim.apply({
        type: 'cancel',
        rect: { x0: w.xOf(labTile), y0: w.yOf(labTile), x1: w.xOf(labTile), y1: w.yOf(labTile) },
      });
      const lab = findSite(sim, 1, 1, avoid);
      labTile = lab ? at(lab.x, lab.y) : -1;
      if (lab) {
        claim(avoid, sim, lab.x, lab.y, 1, 1);
        sim.apply({ type: 'build', feature: bench, tiles: [labTile] });
      }
    }
    // Keep research going, in a sensible order, and use what it unlocks. After the list, whatever else can be
    // studied; and a project stuck waiting on a building or materials is set aside for one that isn't.
    const held = (key: string) => {
      const hold = sim.researchHold(key);
      return (
        !!hold.building ||
        (hold.short.length > 0 &&
          (sim.research.progress[key] ?? 0) >= researchCost(sim.research, researchDef(key)!) - 1)
      );
    };
    // (Further study never ends: it's taken up only while nothing else can be, and looked past every time.)
    const current = sim.research.current ? researchDef(sim.research.current) : undefined;
    if (!current || held(current.key) || current.repeatable) {
      const ready = (key: string) => isAvailable(sim.research, researchDef(key)!) && !held(key);
      const once = (key: string) => ready(key) && !researchDef(key)!.repeatable;
      const next =
        researchOrder.find(once) ?? RESEARCH.map((r) => r.key).find(once) ?? RESEARCH.map((r) => r.key).find(ready);
      if (next && next !== sim.research.current) {
        sim.apply({ type: 'research', project: next });
      }
    }
    // The forest running out: plant a grove of poplars for firewood.
    // (And a second one later, if wood still runs short.)
    if (
      Math.floor(sim.hour) === 8 &&
      ((poplarsPlanted === 0 && sim.countFeature((f) => f === featureId('tree')) < 60) ||
        (poplarsPlanted === 1 && sim.day > 60 && sim.stockOf(itemId('wood')) < 150))
    ) {
      poplarsPlanted++;
      const grove = findSite(sim, 6, 5, avoid);
      if (grove) {
        claim(avoid, sim, grove.x, grove.y, 6, 5);
        sim.apply({
          type: 'zone',
          rect: { x0: grove.x, y0: grove.y, x1: grove.x + 5, y1: grove.y + 4 },
          zone: crop('poplarPlant'),
        });
      }
    }
    // Fortifications known: sandbags round the hut (the ring was kept clear for them).
    if (defend && !sandbagsPlaced && hut && sim.isResearched('fortifications')) {
      sandbagsPlaced = true;
      sim.apply({ type: 'build', feature: featureId('sandbags'), tiles: sandbagRing });
    }
    // Deep mining researched: sink a shaft (it's marked for digging once built).
    if (!shaftPlaced && sim.isResearched('deepMining')) {
      shaftPlaced = true;
      const site = findSite(sim, 1, 1, avoid);
      if (site) {
        claim(avoid, sim, site.x, site.y, 1, 1);
        sim.apply({ type: 'build', feature: featureId('mineShaft'), tiles: [at(site.x, site.y)] });
      }
    }
    // The long game: once the signal beacon is researched, build it beside two wood generators.
    if (!beaconPlaced && sim.isResearched('signalBeacon')) {
      beaconPlaced = true;
      const site = findSite(sim, 5, 1, avoid);
      if (site) {
        claim(avoid, sim, site.x, site.y, 5, 1);
        sim.apply({
          type: 'build',
          feature: featureId('woodGenerator'),
          tiles: [at(site.x, site.y), at(site.x + 4, site.y)],
        });
        sim.apply({ type: 'build', feature: featureId('signalBeacon'), tiles: [at(site.x + 2, site.y)] });
      }
    }
    // When a ship lands, stay (so the run carries on to the end of the measured days).
    if (sim.beacon.landed) {
      shipsLanded++;
      sim.apply({ type: 'shipChoice', board: false });
    }
    // Two graves on day 6, so the fallen can be laid to rest.
    // A prisoner bed on day 8; every wounded raider is marked for capture once the fighting stops.
    // A bed for each one marked (up to eight), since the wounded die within a day.
    const prisonBedsAt = (n: number) => {
      const row = findSite(sim, n, 1, avoid);
      if (row) {
        claim(avoid, sim, row.x, row.y, n, 1);
        const tiles = Array.from({ length: n }, (_, k) => at(row.x + k, row.y));
        sim.apply({ type: 'build', feature: PRISONER_BED, tiles });
        prisonBeds += n;
      }
      return !!row;
    };
    if (!prisonPlaced && sim.day >= 8) {
      prisonPlaced = true;
      prisonBedsAt(1);
    }
    for (const p of sim.captives) {
      fell.add(p.id);
    }
    if (!passive && sim.captives.some((p) => p.state === 'downed' && !p.capture)) {
      sim.apply({
        type: 'capture',
        rect: { x0: 0, y0: 0, x1: sim.world.width - 1, y1: sim.world.height - 1 },
        add: true,
      });
    }
    const beds = Math.min(MAX_PRISON_BEDS, sim.captives.filter((p) => p.capture || p.state === 'prisoner').length);
    // ...and a warden who puts it first (with everything at the same priority, other work always comes first).
    if (!passive && beds > 0 && !sim.living().some((c) => c.priorities.warden === 1)) {
      const warden = sim
        .living()
        .filter((c) => c.id !== researcher.id && !c.health.downed && c.age >= 18)
        .sort((a, b) => b.mood - a.mood)[0];
      if (warden) {
        sim.apply({ type: 'priority', colonist: warden.id, work: 'warden', value: 1 });
      }
    }
    if (!passive && beds > prisonBeds) {
      // A row if there's room for one, else one at a time.
      if (!prisonBedsAt(beds - prisonBeds)) {
        while (prisonBeds < beds && prisonBedsAt(1)) {
          // One more.
        }
      }
    }
    // The neighbours' requests: send the goods once they're in store; hunt the great boar down.
    const request = sim.diplomacy.request;
    if (!passive && request && request.kind !== 'hunt' && colonyStock(sim, request.item) >= request.count) {
      sim.apply({ type: 'fulfilRequest' });
    }
    if (!passive && request?.kind === 'hunt') {
      const beast = sim.animals.find((a) => a.id === request.quarry);
      if (beast && !beast.hunted) {
        const bx = w.xOf(beast.tile);
        const by = w.yOf(beast.tile);
        sim.apply({ type: 'hunt', rect: { x0: bx, y0: by, x1: bx, y1: by }, add: true });
      }
    }
    // Spare silver goes on keeping the neighbours friendly (not on buying their love): whichever of them thinks
    // least of the colony, while below 50.
    if (!passive && hour % 24 === 12 && colonyStock(sim, itemId('silver')) > 400) {
      const coolest = FACTIONS.filter(
        (f) => !f.hostile && onGoodTerms(sim, f.id) && goodwillOf(sim, f.id) < 50 && giftGoodwill(sim, f.id, 50) > 0,
      ).sort((a, b) => goodwillOf(sim, a.id) - goodwillOf(sim, b.id))[0];
      if (coolest) {
        sim.apply({ type: 'gift', faction: coolest.id, silver: 50 });
      }
    }
    if (!passive) {
      worldDealings(sim, seed, hour);
    }
    // Silver to spare: keep the Meadow Kin's fighters hired.
    if (
      !passive &&
      hour % 24 === 13 &&
      !fightersHired(sim) &&
      colonyStock(sim, itemId('silver')) >= hireCost(sim) + 300
    ) {
      sim.apply({ type: 'hireFighters', faction: FACTIONS.find((f) => !f.hostile)!.id });
    }
    if (!gravesPlaced && sim.day >= 6) {
      gravesPlaced = true;
      const plot = findSite(sim, 3, 1, avoid);
      if (plot) {
        claim(avoid, sim, plot.x, plot.y, 3, 1);
        sim.apply({ type: 'build', feature: featureId('grave'), tiles: [at(plot.x, plot.y), at(plot.x + 2, plot.y)] });
      }
    }
    // A lute on day 4, for music and the odd evening concert.
    if (!lutePlaced && sim.day >= 4) {
      lutePlaced = true;
      const spot = findSite(sim, 1, 1, avoid);
      if (spot) {
        claim(avoid, sim, spot.x, spot.y, 1, 1);
        sim.apply({ type: 'build', feature: featureId('lute'), tiles: [at(spot.x, spot.y)] });
      }
    }
    // Some art and flowers in the hut on day 4, and a banner once there's cloth to spare.
    if (hut && !artPlaced && sim.day >= 4) {
      artPlaced = true;
      sim.apply({ type: 'build', feature: featureId('sculptureSmall'), tiles: [at(hut.x + 4, hut.y + 4)] });
      sim.apply({
        type: 'build',
        feature: featureId('flowerPot'),
        tiles: [at(hut.x + 2, hut.y + 4), at(hut.x + 6, hut.y + 4)],
      });
    }
    if (hut && !bannerPlaced && sim.stockOf(itemId('cloth')) >= 20) {
      bannerPlaced = true;
      sim.apply({ type: 'build', feature: featureId('banner'), tiles: [at(hut.x + 6, hut.y + 5)] });
    }
    // A games corner on day 3, and a telescope once Optics is in.
    if (!gamesPlaced && sim.day >= 3) {
      gamesPlaced = true;
      const corner = findSite(sim, 4, 1, avoid);
      if (corner) {
        claim(avoid, sim, corner.x, corner.y, 4, 1);
        sim.apply({ type: 'build', feature: featureId('chessTable'), tiles: [at(corner.x, corner.y)] });
        sim.apply({ type: 'build', feature: featureId('cardTable'), tiles: [at(corner.x + 3, corner.y)] });
      }
    }
    if (!telescopePlaced && sim.isResearched('optics')) {
      telescopePlaced = true;
      const spot = findSite(sim, 1, 1, avoid);
      if (spot) {
        claim(avoid, sim, spot.x, spot.y, 1, 1);
        sim.apply({ type: 'build', feature: featureId('telescope'), tiles: [at(spot.x, spot.y)] });
      }
    }
    // A lesson board once there are children about.
    if (!lessonBoardPlaced && sim.living().some((c) => c.age < 13)) {
      lessonBoardPlaced = true;
      const spot = findSite(sim, 1, 1, avoid);
      if (spot) {
        claim(avoid, sim, spot.x, spot.y, 1, 1);
        sim.apply({ type: 'build', feature: featureId('lessonBoard'), tiles: [at(spot.x, spot.y)] });
      }
    }
    // A drying rack on day 3, so meat and fish keep without power.
    if (!rackPlaced && sim.day >= 3) {
      rackPlaced = true;
      const spot = findSite(sim, 2, 1, avoid);
      if (spot) {
        claim(avoid, sim, spot.x, spot.y, 2, 1);
        sim.apply({
          type: 'build',
          feature: featureId('dryingRack'),
          tiles: [at(spot.x, spot.y), at(spot.x + 1, spot.y)],
        });
      }
    }
    // Once milling is known: a grain field, a millstone, and bread on the bills.
    if (!millPlaced && sim.isResearched('milling')) {
      millPlaced = true;
      const field = findSite(sim, 6, 4, avoid);
      const mill = findSite(sim, 1, 1, avoid);
      if (field && mill) {
        claim(avoid, sim, field.x, field.y, 6, 4);
        claim(avoid, sim, mill.x, mill.y, 1, 1);
        sim.apply({
          type: 'zone',
          rect: { x0: field.x, y0: field.y, x1: field.x + 5, y1: field.y + 3 },
          zone: crop('grainPlant'),
        });
        sim.apply({ type: 'build', feature: featureId('millstone'), tiles: [at(mill.x, mill.y)] });
        sim.apply({ type: 'bill', recipe: RECIPES.find((r) => r.key === 'millFlour')!.id, target: 20 });
        sim.apply({ type: 'bill', recipe: RECIPES.find((r) => r.key === 'bakeBread')!.id, target: 30 });
      }
    }
    // Two hospital beds once Field medicine is known.
    if (!hospitalPlaced && sim.isResearched('fieldMedicine')) {
      hospitalPlaced = true;
      const spot = findSite(sim, 2, 1, avoid);
      if (spot) {
        claim(avoid, sim, spot.x, spot.y, 2, 1);
        sim.apply({
          type: 'build',
          feature: featureId('hospitalBed'),
          tiles: [at(spot.x, spot.y), at(spot.x + 1, spot.y)],
        });
      }
    }
    if (hut && !hearthPlaced && sim.isResearched('hearths')) {
      hearthPlaced = true;
      sim.apply({ type: 'build', feature: featureId('hearth'), tiles: [at(hut.x + 7, hut.y + 4)] });
    }
    // An obsessed artist's vision needs granite blocks: cut plenty while it lasts, as a player would.
    const blocks = RECIPES.find((r) => r.key === 'cutBlocks')!;
    const wanted = sim.obsession ? 70 : 30;
    // ...and granite to cut them from.
    if (sim.obsession && Math.floor(sim.hour) === 7 && sim.stockOf(itemId('stone')) < 30) {
      const c = sim.living()[0];
      if (c) {
        const cx = w.xOf(c.tile);
        const cy = w.yOf(c.tile);
        sim.apply({ type: 'designate', rect: { x0: cx - 18, y0: cy - 18, x1: cx + 18, y1: cy + 18 }, kind: 'mine' });
      }
    }
    if (sim.obsession && sim.countFeature((f) => f === featureId('stonecutterTable')) === 0 && !cutterPlanned) {
      const spot = findSite(sim, 1, 1, avoid);
      if (spot) {
        cutterPlanned = true;
        claim(avoid, sim, spot.x, spot.y, 1, 1);
        sim.apply({ type: 'build', feature: featureId('stonecutterTable'), tiles: [at(spot.x, spot.y)] });
      }
    }
    if (sim.bills[blocks.id].target !== wanted) {
      sim.apply({ type: 'bill', recipe: blocks.id, target: wanted });
    }
    // A parka for everyone before winter.
    if (defend) {
      // A longbow for everyone once they're known, and the caravans' bows, armour and leather bought.
      const longbow = RECIPES.find((r) => r.key === 'makeLongbow')!;
      if (sim.isResearched('longbows') && sim.bills[longbow.id].target !== sim.living().length) {
        sim.apply({ type: 'bill', recipe: longbow.id, target: sim.living().length });
      }
      if (sim.caravan && tradeOpen(sim)) {
        for (const key of ARMS) {
          const have = sim.caravan.stock.find((st) => st.item === itemId(key))?.count ?? 0;
          for (let n = have; n > 0 && applyTrade(sim, [[itemId(key), n]], []) !== null; n--) {
            // Fewer, until it's affordable.
          }
        }
      }
    }
    const parka = RECIPES.find((r) => r.key === 'tailorParka')!;
    if (sim.bills[parka.id].target !== sim.living().length) {
      sim.apply({ type: 'bill', recipe: parka.id, target: sim.living().length });
    }
    // Running short of wood: chop further out, like a player would on a map with few trees nearby.
    if (Math.floor(sim.hour) === 6 && sim.stockOf(itemId('wood')) < 40 && chopRadius < w.width) {
      chopRadius += 8;
      sim.apply({
        type: 'designate',
        rect: { x0: cx - chopRadius, y0: cy - chopRadius, x1: cx + chopRadius, y1: cy + chopRadius },
        kind: 'chop',
      });
    }
    // Out of wood: someone other than the researcher chops first until there's a stock again.
    const lumberjack = sim.living().find((c) => c.id !== researcher.id && !c.health.downed);
    if (lumberjack) {
      const wood = sim.stockOf(itemId('wood'));
      const want = wood < 20 ? 1 : wood > 80 ? 3 : lumberjack.priorities.plantCutting;
      if (want !== lumberjack.priorities.plantCutting) {
        sim.apply({ type: 'priority', colonist: lumberjack.id, work: 'plantCutting', value: want });
      }
    }
    // Hunt whatever wildlife is around once the colony is settled (leather becomes recurve bows).
    if (sim.day >= 3 && !noHunt) {
      sim.apply({ type: 'hunt', rect: { x0: 0, y0: 0, x1: w.width - 1, y1: w.height - 1 }, add: true });
    }
    // A 7×7 pen with a gate and a trough, then a pair of grazers tamed to keep in it (and spared the hunt).
    if (keepPen && !penBuilt && sim.day >= 6) {
      const site = findSite(sim, 7, 7, avoid);
      if (site) {
        penBuilt = true;
        claim(avoid, sim, site.x, site.y, 7, 7);
        const ring: number[] = [];
        for (let y = site.y; y < site.y + 7; y++) {
          for (let x = site.x; x < site.x + 7; x++) {
            if (x === site.x || y === site.y || x === site.x + 6 || y === site.y + 6) {
              ring.push(at(x, y));
            }
          }
        }
        const gate = at(site.x + 3, site.y);
        const trough = at(site.x + 3, site.y + 6);
        sim.apply({
          type: 'build',
          feature: featureId('fence'),
          tiles: ring.filter((i) => i !== gate && i !== trough),
        });
        sim.apply({ type: 'build', feature: featureId('gate'), tiles: [gate] });
        sim.apply({ type: 'build', feature: featureId('trough'), tiles: [trough] });
      }
    }
    if (keepPen && penBuilt && Math.floor(sim.hour) === 8 && sim.tick % TICKS_PER_HOUR === 0) {
      const grazers = ['grouse', 'deer', 'muskox', 'hare'];
      const kept = sim.animals.filter((a) => a.tame || a.taming);
      if (kept.length < 2) {
        const wild = sim.animals.filter((a) => !a.tame && !a.taming && grazers.includes(a.kind));
        const kind = grazers.find((k) => wild.filter((a) => a.kind === k).length >= 2);
        for (const a of wild.filter((b) => b.kind === kind).slice(0, 2 - kept.length)) {
          const r = { x0: w.xOf(a.tile), y0: w.yOf(a.tile), x1: w.xOf(a.tile), y1: w.yOf(a.tile) };
          sim.apply({ type: 'tame', rect: r, add: true });
        }
      }
    }
    if (keepPen) {
      for (const a of sim.animals.filter((b) => b.taming && b.hunted)) {
        sim.apply({
          type: 'hunt',
          rect: { x0: w.xOf(a.tile), y0: w.yOf(a.tile), x1: w.xOf(a.tile), y1: w.yOf(a.tile) },
          add: false,
        });
      }
    }
    // A couple of fishing spots on the nearest shore, for food through the winter.
    if (!fishingPlaced && sim.day >= 4) {
      fishingPlaced = true;
      const start = sim.colonists[0].tile;
      // Not on a tile already planned for something else (that would replace the plan).
      const spots = sim.nearest(
        start,
        (i) => w.blueprint[i] === NONE && !avoid.has(i) && sim.canPlaceBlueprint(i, featureId('fishingSpot')),
        2,
      );
      sim.apply({ type: 'build', feature: featureId('fishingSpot'), tiles: spots });
    }
    // A second field early enough to stock up for winter, as a player would.
    if (!secondFarm && (sim.living().length >= 7 || sim.day >= 5)) {
      secondFarm = true;
      const field = findSite(sim, 7, 5, avoid);
      if (field) {
        claim(avoid, sim, field.x, field.y, 7, 5);
        sim.apply({
          type: 'zone',
          rect: { x0: field.x, y0: field.y, x1: field.x + 6, y1: field.y + 4 },
          zone: crop('potatoPlant'),
        });
      }
    }
    // A third field once the colony outgrows the first two (a big map's colony runs to fifteen or more).
    if (secondFarm && !thirdFarm && sim.living().length >= 11) {
      thirdFarm = true;
      const field = findSite(sim, 7, 5, avoid);
      if (field) {
        claim(avoid, sim, field.x, field.y, 7, 5);
        sim.apply({
          type: 'zone',
          rect: { x0: field.x, y0: field.y, x1: field.x + 6, y1: field.y + 4 },
          zone: crop('potatoPlant'),
        });
      }
    }
    // A bed for every newcomer, while there's room in the hut.
    if (hut && sim.colonists.length > bedsBuilt && bedsBuilt < bedSlots.length) {
      const [bx, by] = bedSlots[bedsBuilt];
      sim.apply({ type: 'build', feature: featureId('bed'), tiles: [at(hut.x + bx, hut.y + by)] });
      bedsBuilt++;
    }

    if (craft) {
      // The workshops, as soon as they're known (the smelter waits on bricks from the kiln).
      if (!kilnPlaced && sim.isResearched('pottery')) {
        kilnPlaced = buildOne('kiln') !== null;
        setBill('fireBricks', 60);
      }
      if (!smelterPlaced && sim.isResearched('smelting')) {
        smelterPlaced = buildOne('smelter') !== null;
        setBill('smeltIron', 40);
        // Iron tool kits rather than stone ones from here on; a sword for every other colonist, mail for all.
        setBill('makeTools', 0);
        setBill('makeIronTools', 4);
      }
      if (smelterPlaced) {
        setBill('makeIronSword', Math.ceil(sim.living().length / 2));
        setBill('makeIronMail', sim.living().length);
      }
      // Each morning, dig more clay and ore when the stock runs low and little is marked.
      if (Math.floor(sim.hour) === 6) {
        if (kilnPlaced && sim.stockOf(itemId('clay')) < 12) {
          dig('clayBank', 4);
        }
        if (smelterPlaced && sim.stockOf(itemId('ironOre')) < 12) {
          dig('ironVein', 3);
        }
      }
    }

    if (diplomat) {
      // The village policies each morning: rations by the food in store, hours and days of rest by mood.
      if (Math.floor(sim.hour) === 7) {
        const v = sim.village;
        const food = foodDays(sim);
        const living = sim.living();
        const mood = living.reduce((n, c) => n + c.mood, 0) / Math.max(1, living.length);
        const rations =
          food < 3
            ? 'frugal'
            : food > 12
              ? 'generous'
              : (v.rations === 'frugal' && food > 5) || (v.rations === 'generous' && food < 8)
                ? 'normal'
                : v.rations;
        const hours =
          mood < 35
            ? 'short'
            : mood > 65
              ? 'long'
              : (v.hours === 'short' && mood > 45) || (v.hours === 'long' && mood < 55)
                ? 'normal'
                : v.hours;
        const restDays = mood < 45 ? true : mood > 60 ? false : v.restDays;
        if (rations !== v.rations || hours !== v.hours || restDays !== v.restDays) {
          sim.apply({ type: 'policy', rations, hours, restDays });
          policyChanges++;
        }
        for (const key of [`rations ${rations}`, `hours ${hours}`, restDays ? 'rest days' : 'no rest days']) {
          policyDays[key] = (policyDays[key] ?? 0) + 1;
        }
      }
      // The Meadow Kin's requests: make what they ask for if a bill can, and turn down what can't be done in time
      // (a refusal costs less goodwill than letting it lapse).
      const asked = sim.diplomacy.request;
      const short = asked?.kind === 'deliver' && colonyStock(sim, asked.item) < asked.count;
      if (asked && short) {
        const recipe = RECIPES.find(
          (r) => r.product.item === asked.item && !r.mend && (!r.research || sim.isResearched(r.research)),
        );
        if (recipe && sim.bills[recipe.id].target < asked.count + 5) {
          sim.apply({ type: 'bill', recipe: recipe.id, target: asked.count + 5 });
        }
      }
      const noHunter =
        asked?.kind === 'hunt' &&
        !sim.living().some((c) => !c.health.downed && c.priorities.hunting > 0 && weaponDef(c.weapon).range > 1);
      // (A hunt still going this late is unlikely to end in time either.)
      const late = asked && asked.until - sim.tick < 12 * TICKS_PER_HOUR && (short || asked.kind === 'hunt');
      if (noHunter || late) {
        sim.apply({ type: 'declineRequest' });
        declined++;
      }
    }

    if (flow && Math.floor(sim.hour) === 6) {
      daily.push(snapshot(sim));
    }
    for (const c of sim.living()) {
      colonistHours++;
      if (c.needs.joy < 0.3) {
        joyLowHours++;
      }
      if (c.job?.type === 'joy') {
        const doing = c.job.gathering
          ? `gathering:${sim.gathering?.kind ?? 'ending'}`
          : c.job.listening
            ? 'concert'
            : c.job.target >= 0
              ? (FEATURES[sim.world.feature[c.job.target] - 1]?.key ?? 'gone')
              : 'walk';
        joyTime[doing] = (joyTime[doing] ?? 0) + 1;
      }
      if (c.job?.type === 'clean') {
        cleaningHours++;
      }
      for (const t of sim.thoughtsOf(c)) {
        moodBy[t.label] = (moodBy[t.label] ?? 0) + t.mood;
      }
      moodSum += c.mood;
      moodSamples++;
      minMood = Math.min(minMood, c.mood);
      if (c.needs.food <= 0) {
        // What starving colonists are busy with instead of eating.
        const doing = `${c.job?.type ?? 'idle'}${c.health.downed ? ' (downed)' : ''}${sim.inMentalBreak(c) ? ' (break)' : ''}`;
        starvingDoing[doing] = (starvingDoing[doing] ?? 0) + 1;
        starvingHours++;
        starvingByDay[sim.day] = (starvingByDay[sim.day] ?? 0) + 1;
      }
    }
    if (friendDay < 0) {
      const l = sim.living();
      if (l.some((a) => l.some((b) => a !== b && mutualOpinion(a, b) >= 30))) {
        friendDay = sim.day;
      }
    }
    if (sim.living().length === 0) {
      break;
    }
  }

  const story = fullStories.get(sim) ?? [];
  const count = (re: RegExp) => story.filter((s) => re.test(s)).length;
  const events: Record<string, number> = {
    raid: count(/^(Raid|Siege)!/),
    disease: count(/came down with/),
    wanderer: count(/asked to join/),
    coldSnap: count(/cold snap/),
    supplies: count(/gift of supplies/),
    blight: count(/Blight/),
    caravan: count(/^Traders from .* have arrived/),
    heatWave: count(/heat wave has settled/),
    eclipse: count(/^An eclipse/),
    manhunters: count(/maddened .* is charging/),
    meteorite: count(/^A meteorite/),
    refugee: count(/wounded and fleeing raiders/),
    aurora: count(/^An aurora/),
    inspiration: count(/is inspired/),
    bumperCrop: count(/^Perfect growing weather/),
    lightning: count(/^Lightning struck/),
    concerts: sim.stats.concerts ?? 0,
    parties: sim.stats.parties ?? 0,
    feasts: sim.stats.feasts ?? 0,
    festivals: count(/^(It's Planting Day|The harvest festival is tonight|The midwinter bonfire will be lit)/),
    weddings: sim.stats.weddings ?? 0,
    funerals: sim.stats.funerals ?? 0,
    beaconHours: sim.beacon.hours,
    shipsLanded,
    burned: burnCounts.get(sim) ?? 0,
  };
  return {
    seed,
    // (Away on an expedition counts as alive.)
    living: sim.headcount(),
    total: sim.colonists.length,
    // The latest few, with when (the log keeps only so much); every one is counted in deathCauses.
    deaths: sim.storyLog.filter((s) => s.text.includes('has died')).map((s) => `day ${s.day} ${s.hour}h: ${s.text}`),
    deathCauses: { ...(sim.stats.deaths ?? {}) },
    raids: events.raid,
    raidKills: sim.stats.kills,
    diseaseCases: story
      .filter((s) => s.includes('came down with'))
      .reduce((n, s) => n + (s.includes(' and ') ? 2 : 1), 0),
    diseaseDeaths: count(/died of marsh fever/),
    breaks: sim.log.length >= 0 ? countBreaks(sim) : 0,
    avgMood: moodSum / Math.max(1, moodSamples),
    minMood,
    friendDay,
    rivals: count(/become rivals/),
    lovers: count(/fallen in love/),
    starvingHours,
    starvingByDay,
    // (Goals only, not the phase:N markers.)
    objectives: OBJECTIVES.filter((o) => sim.objectivesDone[o.id]).length,
    research: sim.research.done.length,
    tailoringDay: tailoringDays.get(sim) ?? -1,
    frost: story.filter((s) => s.startsWith('Frost killed')).length,
    events,
    daily,
    moodBy,
    colonistHours,
    joyLowHours,
    rooms: roomsAtEnd(sim),
    births: sim.stats.births ?? 0,
    smashed: sim.stats.smashed ?? 0,
    infections: sim.stats.infections ?? 0,
    scars: sim.stats.scars ?? 0,
    obsessions: sim.stats.obsessions ?? 0,
    legends: sim.stats.legends ?? 0,
    grown: sim.living().filter((c) => c.backstory === 'colonyBorn' && c.age >= 18).length,
    children: sim.living().filter((c) => c.age < 18).length + sim.infants.length,
    oldAge:
      sim.unburied.filter((f) => f.cause === 'old age').length +
      [...sim.graves.values()].filter((g) => g.cause === 'old age').length,
    fellWounded: fell.size,
    captured: sim.stats.captured ?? 0,
    elections: sim.stats.elections ?? 0,
    shaftDepth: Math.max(0, ...Object.values(sim.shafts).map((s) => s.depth)),
    breaches: sim.stats.breaches ?? 0,
    requestsDone: sim.stats.requestsDone ?? 0,
    requestsFailed: sim.stats.requestsFailed ?? 0,
    gifts: sim.stats.gifts ?? 0,
    kinGoodwill: goodwillOf(sim, FACTIONS.find((f) => !f.hostile)!.id),
    hillGoodwill: goodwillOf(sim, FACTIONS.find((f) => f.key === 'hollowstone')!.id),
    raiderGoodwill: Math.min(...FACTIONS.filter((f) => f.hostile).map((f) => goodwillOf(sim, f.id))),
    truces: sim.stats.truces ?? 0,
    settlers: sim.stats.settlers ?? 0,
    ransomed: sim.stats.ransomed ?? 0,
    expeditions: sim.stats.expeditions ?? 0,
    alliances: sim.stats.alliances ?? 0,
    callsAnswered: sim.stats.callsAnswered ?? 0,
    callsRefused: sim.stats.callsRefused ?? 0,
    silver: colonyStock(sim, itemId('silver')),
    goods: sim.resourceTotals().reduce((n, t) => n + t.total, 0),
    leaderless: sim.village.leader < 0 ? 1 : 0,
    recruited: sim.stats.recruited ?? 0,
    prisonBeds: sim.countFeature((f) => f === PRISONER_BED),
    kilns: sim.countFeature((f) => f === featureId('kiln')),
    smelters: sim.countFeature((f) => f === featureId('smelter')),
    made: Object.fromEntries(CRAFT_GOODS.map((k) => [k, sim.stats.produced[k] ?? 0])),
    tributes: sim.stats.tributes ?? 0,
    tributeSilver,
    boughtOff,
    policyChanges,
    policyDays,
    declined,
    hired: sim.stats.hired ?? 0,
    mess: [...sim.world.tilesWith('filth')].filter((i) => sim.isRoofed(i)).length,
  };
}

// Mental breaks aren't story entries, so count them via a wrapped logger.
// The whole story of each colony (the game's own log keeps only the latest entries).
const fullStories = new Map<Simulation, string[]>();
const breakCounts = new WeakMap<Simulation, number>();
// The day Tailoring arrives (the story log is capped, so early entries may be gone by the end).
const tailoringDays = new WeakMap<Simulation, number>();
// Buildings and plants lost to fire aren't story entries either.
const burnCounts = new WeakMap<Simulation, number>();
function countBreaks(sim: Simulation): number {
  return breakCounts.get(sim) ?? 0;
}
const originalAddLog = Simulation.prototype.addLog;
Simulation.prototype.addLog = function (this: Simulation, text, tone, story) {
  // Every story entry, kept here in full (the game keeps only the latest).
  if (story) {
    const all = fullStories.get(this) ?? [];
    all.push(text);
    fullStories.set(this, all);
  }
  if (text.includes('has had enough')) {
    breakCounts.set(this, (breakCounts.get(this) ?? 0) + 1);
  }
  if (text.startsWith('Research complete: Tailoring')) {
    tailoringDays.set(this, this.day);
  }
  if (text.startsWith('Fire destroyed')) {
    burnCounts.set(this, (burnCounts.get(this) ?? 0) + 1);
  }
  if (trace && text.includes('has died')) {
    console.log(`  --- trace day ${this.day} ${Math.floor(this.hour)}h: ${text}`);
    const count = (key: string) => this.stockOf(itemId(key));
    console.log(
      `      outdoors ${this.outdoorTemperature().toFixed(0)}°C, parkas ${count('parka')} spare, leather ${count('leather')}, ` +
        `wood ${count('wood')}, food ${count('meal') + count('potatoes') + count('rawMeat') + count('rawFish') + count('berries')}`,
    );
    if (process.env.DEBUG) {
      console.log('      research', this.research.done.join(','), 'produced', JSON.stringify(this.stats.produced));
      console.log(
        '      ',
        this.storyLog
          .filter((e) => /Research complete|Winter/.test(e.text))
          .map((e) => `d${e.day}: ${e.text.slice(0, 40)}`)
          .join(' | '),
      );
      const rooms = new Map<number, string>();
      for (const c of this.living()) {
        const r = this.roomAt(c.tile);
        if (r) {
          rooms.set(
            r.id,
            `${r.role} size ${r.size} beds ${r.beds} heaters ${r.heaters} ${r.temperature.toFixed(0)}°C enclosed ${r.enclosed}`,
          );
        }
      }
      console.log('      rooms', [...rooms.values()].join(' | '));
      console.log(
        '      heaters',
        this.countFeature((f) => FEATURES[f - 1]?.heater > 0),
        'beds',
        this.countFeature((f) => !!FEATURES[f - 1]?.bed),
      );
      console.log('      bills', JSON.stringify(this.bills.map((b) => [RECIPES[b.recipe].key, b.target])));
      console.log(
        '      jobs',
        this.colonists
          .map((c) => `${c.name}:${c.job?.type ?? '-'}:${c.priorities.crafting}:${c.skills.crafting}`)
          .join(' '),
      );
    }
    for (const entry of this.log.slice(-14)) {
      console.log(`      ${entry.text}`);
    }
    for (const c of this.colonists) {
      console.log(
        `      ${c.name}: ${this.describe(c)} | injuries ${c.health.injuries.map((i) => `${i.severity.toFixed(2)}${i.tended ? 't' : ''}`).join(',')} ` +
          `blood ${c.health.bloodLoss.toFixed(2)} doctor prio ${c.priorities.doctor} drafted ${c.drafted} ` +
          `cold ${c.health.hypothermia.toFixed(2)} at ${this.temperatureAt(c.tile).toFixed(0)}°C ` +
          `wearing ${c.apparel ? itemDef(c.apparel.item).key : 'nothing'} indoors ${this.isIndoors(c.tile)}`,
      );
    }
  }
  originalAddLog.call(this, text, tone, story);
};

const starvingDoing: Record<string, number> = {};
// Colonist-hours spent on each kind of recreation (a building, or a walk).
const joyTime: Record<string, number> = {};
// Colonist-hours spent cleaning, and mess left indoors at the end of each run.
let cleaningHours = 0;
let messIndoors = 0;
const results: Result[] = [];
const started = performance.now();
// "seed=47514" replays just that colony.
const onlySeed = Number(process.argv.find((a) => a.startsWith('seed='))?.slice(5) ?? 0);
// "start=25" skips the first 25 seeds, so a long batch can be split across processes.
const startAt = Number(process.argv.find((a) => a.startsWith('start='))?.slice(6) ?? 0);
const seedList = onlySeed ? [onlySeed] : Array.from({ length: seeds }, (_, s) => (startAt + s + 1) * 7919);
for (const seed of seedList) {
  const r = play(seed);
  results.push(r);
  messIndoors += r.mess;
  console.log(
    `seed ${String(r.seed).padStart(6)}  alive ${r.living}/${r.total}  raids ${r.raids} (kills ${r.raidKills})  ` +
      `fever ${r.diseaseCases} (deaths ${r.diseaseDeaths})  breaks ${r.breaks}  mood avg ${r.avgMood.toFixed(0)} min ${r.minMood.toFixed(0)}  ` +
      `friends day ${r.friendDay}  rivals ${r.rivals} lovers ${r.lovers}  starving h ${r.starvingHours}  objectives ${r.objectives}/${OBJECTIVES.length}  research ${r.research} (tailoring day ${r.tailoringDay})  frost ${r.frost}`,
  );
  for (const d of r.deaths) {
    console.log(`    ${d}`);
  }
  if (r.starvingHours > 0) {
    console.log(`    starving colonist-hours by day: ${JSON.stringify(r.starvingByDay)}`);
  }
}
const sum = (f: (r: Result) => number) => results.reduce((n, r) => n + f(r), 0);
const modes = [defend && 'defend', craft && 'craft', diplomat && 'diplomat', noHunt && 'nohunt'].filter(
  (m): m is string => !!m,
);
console.log(
  `\n${passive ? 'PASSIVE' : 'ACTIVE'}${modes.length > 0 ? ` [${modes.join(', ')}]` : ''} ${difficulty} ${biome} ${mapKind} ${mapSize}×${mapSize} ${days} days × ${seeds} seeds in ${((performance.now() - started) / 1000).toFixed(1)}s\n` +
    `  survivors ${sum((r) => r.living)}/${sum((r) => r.total)}, colonies wiped ${results.filter((r) => r.living === 0).length}\n` +
    `  deaths by cause ${JSON.stringify(
      results.reduce<Record<string, number>>((all, r) => {
        for (const [cause, n] of Object.entries(r.deathCauses)) {
          all[cause] = (all[cause] ?? 0) + n;
        }
        return all;
      }, {}),
    )}\n` +
    `  raids ${sum((r) => r.raids)}, kills ${sum((r) => r.raidKills)}\n` +
    `  fever cases ${sum((r) => r.diseaseCases)}, fever deaths ${sum((r) => r.diseaseDeaths)}\n` +
    `  mental breaks ${sum((r) => r.breaks)}, mean mood ${(sum((r) => r.avgMood) / results.length).toFixed(1)}\n` +
    `  first friendship day (median) ${results.map((r) => r.friendDay).sort((a, b) => a - b)[Math.floor(results.length / 2)]}\n` +
    `  rivals ${sum((r) => r.rivals)}, couples ${sum((r) => r.lovers)}, starving colonist-hours ${sum((r) => r.starvingHours)}\n` +
    `  events ${JSON.stringify(Object.fromEntries(Object.keys(results[0].events).map((k) => [k, sum((r) => r.events[k])])))}`,
);

// Where mood comes from: the average contribution of each thought per colonist, biggest first.
const allHours = sum((r) => r.colonistHours);
const moodTotals: Record<string, number> = {};
for (const r of results) {
  for (const [label, total] of Object.entries(r.moodBy)) {
    moodTotals[label] = (moodTotals[label] ?? 0) + total;
  }
}
const moodRanked = Object.entries(moodTotals)
  .map(([label, total]) => [label, total / Math.max(1, allHours)] as const)
  .filter(([, avg]) => Math.abs(avg) >= 0.2)
  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
console.log(
  `  mood by thought (average per colonist): ${moodRanked.map(([label, avg]) => `${label} ${avg > 0 ? '+' : ''}${avg.toFixed(1)}`).join(', ')}`,
);
console.log(
  `  recreation time: ${Object.entries(joyTime)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}h`)
    .join(', ')}`,
);
console.log(
  `  recreation under 30%: ${((100 * sum((r) => r.joyLowHours)) / Math.max(1, allHours)).toFixed(1)}% of colonist-hours`,
);
const byRole = new Map<string, number[]>();
for (const r of results) {
  for (const room of r.rooms) {
    byRole.set(room.role, [...(byRole.get(room.role) ?? []), room.impressiveness]);
  }
}
console.log(
  `  rooms at the end (average impressiveness): ${[...byRole]
    .map(
      ([role, values]) =>
        `${role} ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(0)} (${values.length})`,
    )
    .join(', ')}`,
);
console.log(`  bodies: ${sum((r) => r.infections)} wounds infected, ${sum((r) => r.scars)} lasting injuries`);
console.log(
  `  minds: ${sum((r) => r.smashed)} things smashed in rages, ${sum((r) => r.obsessions)} obsessions, ` +
    `${sum((r) => r.legends)} legendary works made`,
);
console.log(
  `  families: ${sum((r) => r.births)} born, ${sum((r) => r.children)} still children at the end, ` +
    `${sum((r) => r.grown)} grown up into adults, ${sum((r) => r.oldAge)} died of old age`,
);
console.log(
  `  prisoners: ${sum((r) => r.fellWounded)} raiders fell wounded, ${sum((r) => r.captured)} taken prisoner, ` +
    `${sum((r) => r.recruited)} won over; prisoner beds at the end ${results
      .map((r) => r.prisonBeds)
      .sort((a, b) => a - b)
      .join(' ')}`,
);
if (craft) {
  console.log(
    `  craft: kilns built in ${results.filter((r) => r.kilns > 0).length}/${results.length} colonies, smelters in ` +
      `${results.filter((r) => r.smelters > 0).length}; made in all ${CRAFT_GOODS.map((k) => `${k} ${sum((r) => r.made[k])}`).join(', ')}`,
  );
}
if (diplomat) {
  const underPolicy = results.reduce<Record<string, number>>((all, r) => {
    for (const [k, n] of Object.entries(r.policyDays)) {
      all[k] = (all[k] ?? 0) + n;
    }
    return all;
  }, {});
  const allDays = Math.max(1, sum((r) => Object.values(r.policyDays).reduce((a, b) => a + b, 0)) / 3);
  console.log(
    `  diplomat: ${sum((r) => r.tributes)} tributes (${sum((r) => r.tributeSilver)} silver; ${sum((r) => r.boughtOff)} raids ` +
      `bought off on the way in), ${sum((r) => r.hired)} times fighters hired, ${sum((r) => r.declined)} requests ` +
      `turned down in time, ${sum((r) => r.policyChanges)} policy changes; days under each policy ` +
      Object.entries(underPolicy)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${((100 * n) / allDays).toFixed(0)}%`)
        .join(', '),
  );
}
console.log(
  `  neighbours: ${sum((r) => r.requestsDone)} requests done, ${sum((r) => r.requestsFailed)} turned down or lapsed, ` +
    `${sum((r) => r.gifts)} gifts; goodwill at the end ${results
      .map((r) => r.kinGoodwill)
      .sort((a, b) => a - b)
      .join(' ')}`,
);
const spread = (pick: (r: Result) => number) =>
  results
    .map(pick)
    .sort((a, b) => a - b)
    .join(' ');
console.log(
  `  wider world: Hollowstone goodwill at the end ${spread((r) => r.hillGoodwill)}; raiders' (warier of the two) ` +
    `${spread((r) => r.raiderGoodwill)}; ${sum((r) => r.truces)} truces, ${sum((r) => r.ransomed)} ransomed, ` +
    `${sum((r) => r.settlers)} settlers bought, ${sum((r) => r.expeditions)} expeditions, ${sum((r) => r.alliances)} ` +
    `alliances (${sum((r) => r.callsAnswered)} calls answered, ${sum((r) => r.callsRefused)} refused); ` +
    `silver at the end ${spread((r) => r.silver)}`,
);
console.log(
  `  depths: shafts dug to ${results
    .map((r) => r.shaftDepth)
    .sort((a, b) => a - b)
    .join(' ')} levels; ${sum((r) => r.breaches)} breaches`,
);
console.log(
  `  village: ${sum((r) => r.elections)} votes held, ${sum((r) => r.leaderless)} colonies left without a leader; ` +
    `${(sum((r) => r.goods) / results.length).toFixed(0)} goods on hand at the end (average)` +
    (policy.length > 0 ? ` [policy ${policy.join(', ')}]` : ''),
);
console.log(
  `  cleaning: ${((100 * cleaningHours) / Math.max(1, allHours)).toFixed(1)}% of colonist-hours, ` +
    `${(messIndoors / results.length).toFixed(1)} messy tiles under a roof at the end (average)`,
);
if (Object.keys(starvingDoing).length > 0) {
  const sorted = Object.entries(starvingDoing).sort((a, b) => b[1] - a[1]);
  console.log(`  starving colonists were busy with: ${sorted.map(([k, n]) => `${k} ${n}`).join(', ')}`);
}

// Day-by-day averages over the seeds: stocks at dawn, and what was gathered or made since the
// previous dawn (columns starting "+").
if (flow) {
  const length = Math.max(...results.map((r) => r.daily.length));
  const keys = Object.keys(results.find((r) => r.daily.length > 0)?.daily[0] ?? {}).filter((k) => k !== 'day');
  const width = (k: string) => Math.max(6, k.length + 1);
  console.log('\nday ' + keys.map((k) => k.padStart(width(k))).join(''));
  for (let d = 0; d < length; d++) {
    const rows = results.filter((r) => r.daily[d]);
    const cells = keys.map((k) => {
      const avg =
        rows.reduce((n, r) => n + (k.startsWith('+') ? r.daily[d][k] - (r.daily[d - 1]?.[k] ?? 0) : r.daily[d][k]), 0) /
        rows.length;
      return (Math.abs(avg) < 10 && !Number.isInteger(avg) ? avg.toFixed(1) : Math.round(avg).toString()).padStart(
        width(k),
      );
    });
    // Taken at dawn: the day just begun ("+" columns cover the day before it).
    console.log(String(rows[0]?.daily[d].day ?? d + 1).padStart(3) + ' ' + cells.join(''));
  }
}

// A colony's dealings with the wider world, as a sensible player might: take a side in the neighbours'
// quarrels (usually the friend it likes better, not always), take up an alliance and answer its calls, make a
// truce with raiders when they'll have one, sell back prisoners it has no room for, buy a settler and send
// expeditions with silver to spare. Its whims come from the seed, not the game's dice.
function worldDealings(sim: Simulation, seed: number, hour: number): void {
  const d = sim.diplomacy;
  const whim = (salt: number) => {
    const x = Math.sin(seed * 12.9898 + sim.day * 78.233 + salt * 37.719) * 43758.5453;
    return x - Math.floor(x);
  };
  const silver = colonyStock(sim, itemId('silver'));
  if (d.dispute && hour % 24 === 14) {
    const { a, b } = d.dispute;
    const [liked, other] = goodwillOf(sim, a) >= goodwillOf(sim, b) ? [a, b] : [b, a];
    const roll = whim(1);
    sim.apply({ type: 'world', action: { kind: 'dispute', side: roll < 0.5 ? liked : roll < 0.85 ? other : null } });
  }
  if (d.envoy && hour % 24 === 14) {
    sim.apply({ type: 'world', action: { kind: 'envoy', accept: whim(2) < 0.7 } });
  }
  if (d.call && hour % 24 === 15) {
    const free = sim.living().filter((c) => !cannotGo(sim, c) && !c.drafted);
    if (colonyStock(sim, d.call.item) >= d.call.count) {
      sim.apply({ type: 'world', action: { kind: 'call', answer: 'goods' } });
    } else if (free.length >= 4) {
      sim.apply({ type: 'world', action: { kind: 'call', answer: free[0].id } });
    } else {
      sim.apply({ type: 'world', action: { kind: 'call', answer: 'refuse' } });
    }
  }
  // Raiders lying wounded with nobody to bring them in are let go rather than left to die (it softens their
  // people, towards a truce).
  for (const p of sim.captives.filter((q) => q.state === 'downed' && sim.tick - q.since > TICKS_PER_HOUR * 20)) {
    sim.apply({ type: 'release', captive: p.id });
  }
  if (hour % 24 === 16) {
    for (const f of FACTIONS.filter((x) => x.hostile)) {
      if (goodwillOf(sim, f.id) >= TRUCE_GOODWILL && truceDays(sim, f.id) === 0) {
        sim.apply({ type: 'world', action: { kind: 'truce', faction: f.id } });
      }
    }
    // A full colony has no use for prisoners: sell them back.
    if (!roomToJoin(sim)) {
      for (const p of sim.captives.filter((q) => q.state === 'prisoner')) {
        sim.apply({ type: 'world', action: { kind: 'ransom', captive: p.id } });
      }
    }
  }
  const kin = FACTIONS.find((f) => f.key === 'meadowKin')!.id;
  if (
    hour % 24 === 17 &&
    sim.day >= 10 &&
    roomToJoin(sim) &&
    goodwillOf(sim, kin) >= SETTLER_GOODWILL &&
    settlerDays(sim) === 0 &&
    silver >= settlerCost(sim) + 300
  ) {
    sim.apply({ type: 'world', action: { kind: 'settler', faction: kin } });
  }
  // A party of two every four days or so, once there are hands to spare: to the ruins, or to whichever
  // neighbour it gets on with less well. With silver piling up, a trading party of three every other day.
  const rich = silver > 1500;
  if (
    hour % 24 === 8 &&
    sim.day >= 12 &&
    sim.day % (rich ? 2 : 4) === seed % (rich ? 2 : 4) &&
    !(sim.raid && !sim.raid.outcome)
  ) {
    const free = sim.living().filter((c) => !cannotGo(sim, c) && !c.drafted);
    const salvage = !rich && whim(3) < 0.5;
    const friends = FACTIONS.filter((f) => !f.hostile && goodwillOf(sim, f.id) >= 0).sort(
      (a, b) => goodwillOf(sim, a.id) - goodwillOf(sim, b.id),
    );
    const to = salvage || friends.length === 0 ? RUINS : friends[0].id;
    const purpose = to === RUINS ? 'salvage' : 'trade';
    const size = Math.min(rich ? 3 : 2, free.length - 3);
    if (size > 0 && silver >= supplyCost(sim, purpose, size) + 300) {
      const party = free.slice(-size).map((c) => c.id);
      sim.apply({ type: 'world', action: { kind: 'expedition', to, purpose, colonists: party } });
    }
  }
}
