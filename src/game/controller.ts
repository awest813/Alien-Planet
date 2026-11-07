import { TRANSMIT_HOURS, beaconTile } from '../sim/beacon';
import { Musician, SoundScene, sound } from './audio';
import { isInstrument } from './music';
import { impressivenessLabel } from '../sim/climate';
import {
  BenchType,
  FACTIONS,
  Ingredient,
  MENDABLE,
  NONE,
  RECIPES,
  RESEARCH,
  TRAITS,
  featureDef,
  featureId,
  itemDef,
  quantity,
  itemId,
  researchDef,
  terrainDef,
  weaponDef,
  JOY_KIND_LABELS,
  type JoyKind,
} from '../sim/defs';
import { availableProjects, isAvailable } from '../sim/research';
import { DAYS_PER_SEASON, daysUntilWinter, seasonDay, yearOf } from '../sim/seasons';
import { animalName } from '../sim/animals';
import { armorOf } from '../sim/combat';
import { POISONING_HOURS, bleedingOf, needsBedRest, painOf } from '../sim/health';
import { comfortRange, qualityLabel } from '../sim/apparel';
import { MAX_SKILL, SKILL_LABELS, xpToNext } from '../sim/skills';
import { relationLabel } from '../sim/social';
import { hashSeed } from '../sim/rng';
import { SAVE_VERSION, deserialize, serialize } from '../sim/serialize';
import { MAP_SIZE, NIGHT_START, OBJECTIVES, Simulation, StoryEntry, TICKS_PER_HOUR } from '../sim/simulation';
import { DOWNED_TICKS, persuasion } from '../sim/prisoners';
import { DRAFT_AGE, TEEN, backstoryOf, canWork, stageOf } from '../sim/lifespans';
import { LEGEND } from '../sim/minds';
import { PART_LABELS, SCAR_LABELS, isInfected, scarsOf } from '../sim/body';
import { Hours, Rations, tally } from '../sim/village';
import {
  applyTrade,
  colonyStock,
  goodwillOf,
  prices,
  standingLabel,
  tradableItems,
  tradeOpen,
  artForSale,
} from '../sim/trade';
import { METRES_PER_LEVEL, breachFrom, oreChances } from '../sim/depths';
import { GIFT_SIZES, atPeace, describeRequest, giftGoodwill, tributeCost } from '../sim/diplomacy';
import { weatherDef } from '../sim/weather';
import {
  Colonist,
  Command,
  DesignationKind,
  LogEntry,
  Needs,
  Priorities,
  SKILL_KEYS,
  ScheduleSlot,
  Skills,
  Stance,
} from '../sim/types';
import {
  Designation,
  GROW_ZONE,
  STOCKPILE_ZONE,
  STORAGE_GROUPS,
  StockpilePriority,
  isStockpileZone,
  refusedGroups,
  stockpilePriority,
} from '../sim/world';
import { Difficulty, coldSnapOn, eclipseOn, heatWaveOn } from '../sim/storyteller';
import { SaveMeta, deleteSave, listSaves, readSave, writeSave } from './save-store';
import { Settings, loadSettings, storeSettings } from './settings';

export type Tool =
  | { kind: 'select' }
  | { kind: 'designate'; designation: DesignationKind }
  | { kind: 'cancel' }
  | { kind: 'zone'; zone: number }
  | { kind: 'build'; feature: number }
  | { kind: 'hunt' }
  | { kind: 'tame' }
  | { kind: 'capture' }
  | { kind: 'forbid'; on: boolean };

export interface ToolDef {
  id: string;
  label: string;
  hotkey: string;
  tool: Tool;
  group: ToolGroup;
  hint: string;
}

export type ToolGroup =
  | 'orders'
  | 'zones'
  | 'structure'
  | 'floors'
  | 'furniture'
  | 'decor'
  | 'production'
  | 'power'
  | 'climate'
  | 'security';

// Architect menu categories, in display order.
export const TOOL_GROUPS: { key: ToolGroup; label: string }[] = [
  { key: 'orders', label: 'Orders' },
  { key: 'zones', label: 'Zones' },
  { key: 'structure', label: 'Structure' },
  { key: 'floors', label: 'Floors' },
  { key: 'furniture', label: 'Furniture' },
  { key: 'decor', label: 'Art & decor' },
  { key: 'production', label: 'Production' },
  { key: 'power', label: 'Power' },
  { key: 'climate', label: 'Climate' },
  { key: 'security', label: 'Security' },
];

// Build tools list their materials straight from the building data, so hints can't drift.
const build = (key: string, label: string, hotkey: string, group: ToolDef['group'], hint: string): ToolDef => {
  const cost = (featureDef(featureId(key)).build?.cost ?? [])
    .map((c) => `${c.count} ${itemDef(c.item).name.toLowerCase()}`)
    .join(', ');
  return {
    id: key,
    label,
    hotkey,
    tool: { kind: 'build', feature: featureId(key) },
    group,
    hint: cost ? `${hint} · costs ${cost}` : hint,
  };
};

// For each goal: how to get it done, plus the tool to pick or the screen to open.
const GOAL_HELP: Record<string, { how: string; tool?: string; screen?: ObjectiveView['screen'] }> = {
  wood: { how: 'Pick Chop and drag over trees: colonists cut them down for wood.', tool: 'chop' },
  stockpile: { how: 'Drag out a stockpile zone on open ground near your colonists.', tool: 'stockpile' },
  haul: { how: 'Haulers carry loose items into stockpiles on their own. Give them time.' },
  shelter: { how: 'Drag a rectangle of wood walls, then click a door into one side.', tool: 'woodWall' },
  bed: { how: 'Click beds inside the shelter, one per colonist.', tool: 'bed' },
  night: { how: 'Have walls, a door and beds up before 22:00, when colonists go to sleep.' },
  grow: { how: 'Drag a potato field over soil or grass.', tool: 'growPotatoes' },
  harvest: { how: 'Potatoes take a few days to ripen; growers harvest them on their own.' },
  meals: { how: 'Build a stove from granite (mine rock for it); cooks turn raw food into meals.', tool: 'stove' },
  rec: { how: 'Build a horseshoe pin so colonists have something to do for fun.', tool: 'horseshoePin' },
  heat: { how: 'Build a campfire inside a bedroom.', tool: 'campfire' },
  cloth: { how: 'Grow cotton, build a crafting bench to weave it, then build an armchair.', tool: 'craftingBench' },
  medicine: { how: 'Drag a healroot field; growers harvest herbal medicine from it.', tool: 'growHealroot' },
  tend: { how: 'Doctors tend wounds and illness on their own. Keep someone on Doctor work.', screen: 'work' },
  friends: { how: 'Colonists chat while they work and relax together; a table and recreation help.' },
  raid: { how: 'When raiders come, press Q to draft everyone and fight from cover.' },
  hunt: { how: 'Pick Hunt and drag over animals; hunters track and shoot them.', tool: 'hunt' },
  firstChild: {
    how: 'Lovers who marry may start a family: keep them happy, fed and safe, with room in the colony to grow.',
  },
  bread: {
    how: 'Research Milling, grow grain (Zones), build a millstone and a stove, and set bills to mill flour and bake bread.',
    tool: 'growGrain',
  },
  iron: {
    how: 'Mine iron veins (rusty streaks in the rock), research Pottery then Smelting, and fire up a smelter with wood.',
    tool: 'mine',
  },
  recruit: {
    how: 'Build a prisoner bed (Security). After a raid, drag Capture over raiders lying wounded; Warden colonists bring them in, feed them and talk them round.',
    tool: 'capture',
  },
  researchBench: { how: 'Build a research bench, then pick a project in Research.', tool: 'researchBench' },
  research3: { how: 'Pick projects in Research; colonists with Research work study them.', screen: 'research' },
  hearth: { how: 'Research Hearths, then build a stone hearth in your bedrooms.', screen: 'research' },
  bow: { how: 'Research Archery; crafters then make recurve bows (see Production).', screen: 'research' },
  sandbags: { how: 'Research Fortifications, then build sandbags where you will fight.', screen: 'research' },
  winter: { how: 'Stock food, keep rooms heated and get parkas made before winter.' },
  survive: { how: 'Keep everyone fed, warm, rested and patched up.' },
  power: { how: 'Research Electricity, then build a wood generator.', screen: 'research' },
  coldStore: { how: 'Research Refrigeration and build an icebox, or a freezer in a sealed room.', screen: 'research' },
  recVariety: {
    how: 'Colonists tire of doing the same thing for fun. Build different kinds: an armchair, horseshoes, a chess or card table.',
    tool: 'chessTable',
  },
  chess: {
    how: 'Build a chess table; two colonists off work at the same time will sit down to a game.',
    tool: 'chessTable',
  },
  tame: { how: 'Pick Tame and drag over animals; colonists with Handle work win them over.', tool: 'tame' },
  fineMeals: {
    how: 'A cook with skill 6 makes fine meals from meat and vegetables; set a target in Production.',
    screen: 'production',
  },
  parkas: { how: 'Research Tailoring; crafters then make parkas from leather (see Production).', screen: 'research' },
  feast: {
    how: 'The harvest festival comes in mid-autumn. Have meals in store (fine ones best) and colonists free that evening.',
  },
  wedding: {
    how: 'Lovers who think the world of each other may decide to marry. A fine room makes a fine wedding.',
  },
  funeral: { how: 'Build a grave (Art & decor). The colony gathers there to lay the fallen to rest.', tool: 'grave' },
  memorial: {
    how: 'Build a memorial stone (Art & decor); an artist carves it with the names of the fallen.',
    tool: 'memorial',
  },
  beaconResearch: { how: 'Research Electricity, then the Signal beacon (Research).', screen: 'research' },
  beaconBuilt: {
    how: 'Build the signal beacon (Power tab) and keep the grid running: it draws a lot of power.',
    tool: 'signalBeacon',
  },
  beaconSignal: {
    how: 'Five days of power without a break in the signal… and raiders will come for it. Keep the generators fed.',
  },
  shipChoice: { how: 'When the ship lands, decide: board it and end the story here, or stay.', screen: 'ship' },
  instrument: {
    how: 'Build a drum, flute or lute (Furniture). Colonists play it for fun, and everyone nearby enjoys the music.',
    tool: 'lute',
  },
  concert: {
    how: 'A player with Artistic 6 or more may give a concert in the evening (17:00–22:00) when others are off duty. Give colonists some Recreation hours in the Schedule.',
    screen: 'schedule',
  },
  sculpture: {
    how: 'Build a sculpture (Art & decor). Colonists with Art work carve it; Artistic skill sets how well it turns out.',
    tool: 'sculptureSmall',
  },
  fineArt: {
    how: 'Skilled artists (Artistic 10+) make the best pieces; an inspired artist does better still. Give your best artist Art work at priority 1.',
    screen: 'work',
  },
  impressiveRoom: {
    how: 'Fill a room with beauty: sculptures, flower pots, banners, fine floors and furniture. Smaller rooms show it off more.',
    tool: 'sculptureLarge',
  },
  population: {
    how: 'Wanderers ask to join now and then until the valley is full (6 on a small map, 9 medium, 12 large); keep the colony comfortable and fed.',
  },
  secondWinter: { how: 'Everything from the first winter, with a bigger colony.' },
};

export const TOOLS: ToolDef[] = [
  {
    id: 'select',
    label: 'Select',
    hotkey: 'Escape',
    tool: { kind: 'select' },
    group: 'orders',
    hint: 'Inspect tiles and colonists',
  },
  {
    id: 'mine',
    label: 'Mine',
    hotkey: 'm',
    tool: { kind: 'designate', designation: 'mine' },
    group: 'orders',
    hint: 'Drag over rock to mine it for granite',
  },
  {
    id: 'chop',
    label: 'Chop',
    hotkey: 'c',
    tool: { kind: 'designate', designation: 'chop' },
    group: 'orders',
    hint: 'Drag over trees to cut them for wood',
  },
  {
    id: 'forage',
    label: 'Forage',
    hotkey: 'g',
    tool: { kind: 'designate', designation: 'forage' },
    group: 'orders',
    hint: 'Drag over berry bushes to gather berries',
  },
  {
    id: 'deconstruct',
    label: 'Deconstruct',
    hotkey: 'r',
    tool: { kind: 'designate', designation: 'deconstruct' },
    group: 'orders',
    hint: 'Drag over buildings to take them apart',
  },
  {
    id: 'hunt',
    label: 'Hunt',
    hotkey: 'v',
    tool: { kind: 'hunt' },
    group: 'orders',
    hint: 'Drag over animals to hunt them for meat and leather (boars fight back)',
  },
  {
    id: 'tame',
    label: 'Tame',
    hotkey: '',
    tool: { kind: 'tame' },
    group: 'orders',
    hint: 'Drag over wild animals to tame them: deer give milk, muskoxen wool, grouse eggs; boars and wolves guard the colony; pairs breed',
  },
  {
    id: 'capture',
    label: 'Capture',
    hotkey: '',
    tool: { kind: 'capture' },
    group: 'orders',
    hint: 'Drag over raiders lying wounded: Warden colonists carry them to a prisoner bed, to win them over',
  },
  {
    id: 'forbid',
    label: 'Forbid',
    hotkey: '',
    tool: { kind: 'forbid', on: true },
    group: 'orders',
    hint: 'Drag over items to forbid them: colonists leave them where they are and never use them',
  },
  {
    id: 'allow',
    label: 'Allow',
    hotkey: '',
    tool: { kind: 'forbid', on: false },
    group: 'orders',
    hint: 'Drag over forbidden items to let colonists use them again',
  },
  {
    id: 'cancel',
    label: 'Cancel',
    hotkey: 'x',
    tool: { kind: 'cancel' },
    group: 'orders',
    hint: 'Drag to remove orders and blueprints',
  },
  {
    id: 'stockpile',
    label: 'Stockpile',
    hotkey: 'z',
    tool: { kind: 'zone', zone: STOCKPILE_ZONE },
    group: 'zones',
    hint: 'Drag to mark storage; colonists haul items here',
  },
  {
    id: 'growPotatoes',
    label: 'Grow potatoes',
    hotkey: 'p',
    tool: { kind: 'zone', zone: GROW_ZONE + featureId('potatoPlant') },
    group: 'zones',
    hint: 'Drag over soil or grass to plant potatoes (food)',
  },
  {
    id: 'growGrain',
    label: 'Grow grain',
    hotkey: '',
    tool: { kind: 'zone', zone: GROW_ZONE + featureId('grainPlant') },
    group: 'zones',
    hint: 'Drag over soil or grass to plant grain: milled into flour and baked into bread that keeps (Milling)',
  },
  {
    id: 'growCotton',
    label: 'Grow cotton',
    hotkey: 't',
    tool: { kind: 'zone', zone: GROW_ZONE + featureId('cottonPlant') },
    group: 'zones',
    hint: 'Drag over soil or grass to plant cotton (for cloth)',
  },
  {
    id: 'growHealroot',
    label: 'Grow healroot',
    hotkey: 'y',
    tool: { kind: 'zone', zone: GROW_ZONE + featureId('healrootPlant') },
    group: 'zones',
    hint: 'Drag over soil or grass to grow healroot (herbal medicine)',
  },
  {
    id: 'unzone',
    label: 'Clear zone',
    hotkey: 'u',
    tool: { kind: 'zone', zone: 0 },
    group: 'zones',
    hint: 'Drag to remove stockpile and growing zones',
  },
  build('woodWall', 'Wood wall', 'b', 'structure', 'Drag a rectangle outline of walls'),
  build('stoneWall', 'Granite wall', 'n', 'structure', 'Drag a rectangle outline of walls'),
  build(
    'blockWall',
    'Block wall',
    '',
    'structure',
    'Sturdier and prettier than granite: raiders take twice as long to break through',
  ),
  build('brickWall', 'Brick wall', '', 'structure', 'Sturdy fired bricks: between granite and blocks (Pottery)'),
  build('door', 'Door', 'o', 'structure', 'Click a wall gap to place a door'),
  build(
    'roof',
    'Roof',
    '',
    'structure',
    'Drag over an open area to keep the rain off (rooms are roofed already). Not over crops or growing zones: they need the sun. Roofs only show while this tool is picked',
  ),
  build('woodFloor', 'Wood floor', '', 'floors', 'Faster to walk on, and a little prettier'),
  build('stoneTiles', 'Stone tiles', '', 'floors', 'Fast underfoot and handsome; made from granite blocks'),
  build('brickFloor', 'Brick floor', '', 'floors', 'A warm-coloured floor of fired bricks (Pottery)'),
  build('carpet', 'Carpet', '', 'floors', 'The prettiest floor; woven from cloth'),
  build('bridge', 'Bridge', '', 'structure', 'Walkway over shallow or deep water'),
  build('bed', 'Bed', 'e', 'furniture', 'Colonists sleep better in beds'),
  build('fineBed', 'Fine bed', '', 'furniture', 'Prettier, and colonists rest 25% faster'),
  build(
    'hospitalBed',
    'Hospital bed',
    '',
    'furniture',
    'Patients heal half again as fast, are tended better and catch fewer infections (Field medicine)',
  ),
  build('table', 'Table', 'l', 'furniture', 'Colonists dislike eating without a table'),
  build('armchair', 'Armchair', 'h', 'furniture', 'Comfortable recreation (relaxing) and decor'),
  build('horseshoePin', 'Horseshoe pin', 'i', 'furniture', 'Recreation spot (games)'),
  build(
    'chessTable',
    'Chess table',
    '',
    'furniture',
    'Games for two: players chat as they play. Alone, it is much less fun',
  ),
  build('cardTable', 'Card table', '', 'furniture', 'Social recreation for up to four. Alone, it is much less fun'),
  build('telescope', 'Telescope', '', 'furniture', 'Stargazing on clear nights; it must stand under the open sky'),
  build('drum', 'Drum', '', 'furniture', 'Music: players train Artistic and anyone within earshot enjoys it'),
  build('flute', 'Flute stand', '', 'furniture', 'Music: players train Artistic and anyone within earshot enjoys it'),
  build('lute', 'Lute stand', '', 'furniture', 'Music: a skilled player may give an evening concert'),
  build('harp', 'Harp', '', 'furniture', 'The finest instrument: a skilled harpist can hold the whole colony'),
  build(
    'sculptureSmall',
    'Small sculpture',
    '',
    'decor',
    'Carved by an artist (Art work): the more skilled, the more beautiful. Colonists admire it for fun',
  ),
  build('sculptureLarge', 'Large sculpture', '', 'decor', 'A granite piece, twice the beauty of a small one'),
  build('sculptureGrand', 'Grand sculpture', '', 'decor', 'Granite and silver: the finest piece a colony can make'),
  build('flowerPot', 'Flower pot', '', 'decor', 'Pretty while in bloom; little to look at in winter'),
  build('grave', 'Grave', '', 'decor', 'A resting place: the colony holds a funeral here for someone who has died'),
  build(
    'memorial',
    'Memorial stone',
    '',
    'decor',
    'Carved by an artist (Art work) in memory of the fallen. While it stands, the fallen are remembered',
  ),
  build('banner', 'Banner', '', 'decor', 'A splash of colour for a room'),
  build('torch', 'Torch', '', 'decor', 'Lights up the dark around it; burns a little wood'),
  build('standingLamp', 'Standing lamp', '', 'decor', 'Steady light after dark, while the power grid is running'),
  build('stove', 'Stove', 'k', 'production', 'Cooks meals from raw food'),
  build('craftingBench', 'Crafting bench', 'j', 'production', 'Weaves cloth and crafts bows'),
  build('researchBench', 'Research bench', '', 'production', 'Where colonists research new technology'),
  build('stonecutterTable', "Stonecutter's table", '', 'production', 'Cuts granite chunks into blocks for block walls'),
  build('millstone', 'Millstone', '', 'production', 'Cooks grind grain into flour here, for baking bread (Milling)'),
  build(
    'dryingRack',
    'Drying rack',
    '',
    'production',
    'Haulers hang meat, fish and berries here; in half a day they dry into food that keeps for months',
  ),
  build(
    'kiln',
    'Kiln',
    '',
    'production',
    'Fires clay from the riverbanks into bricks; burns wood while in use (Pottery)',
  ),
  build(
    'smelter',
    'Smelter',
    '',
    'production',
    'Smelts iron ore from the rock into iron for tools, swords and mail; burns wood while in use (Smelting)',
  ),
  build(
    'mineShaft',
    'Mine shaft',
    '',
    'production',
    'Drag Mine over it and miners dig it deeper for stone, iron ore and silver; dig too deep and something may come up (Deep mining)',
  ),
  build(
    'fishingSpot',
    'Fishing spot',
    '',
    'production',
    'Build on the shore; hunters fish here when food runs short and all winter',
  ),
  build('icebox', 'Icebox', '', 'production', 'Food storage that keeps food fresh while powered (50 W)'),
  build('shelf', 'Shelf', '', 'production', 'Storage for three stacks of one kind of item on a single tile'),
  build('sunLamp', 'Sun lamp', '', 'production', 'Crops nearby grow day and night, all year (300 W)'),
  build('woodGenerator', 'Wood generator', '', 'power', '1000 W while fuelled; haulers refuel it with wood'),
  build('solarPanel', 'Solar panel', '', 'power', 'Up to 1200 W in daylight, less in winter'),
  build('battery', 'Battery', '', 'power', 'Stores 8 kWh of spare power for the night'),
  build(
    'signalBeacon',
    'Signal beacon',
    '',
    'power',
    'Draws 400 W. Transmit for five days and a ship may answer; raiders will hear it too',
  ),
  build('campfire', 'Campfire', 'f', 'climate', 'Heats the room it is in; burns wood, which haulers bring'),
  build('hearth', 'Stone hearth', '', 'climate', 'A strong heater for cold winters; burns wood'),
  build('electricHeater', 'Electric heater', '', 'climate', 'Strong heater, keeps rooms at 21°C (175 W)'),
  build('airConditioner', 'Air conditioner', '', 'climate', 'Cools a room to 20°C in hot weather (200 W)'),
  build('freezer', 'Freezer unit', '', 'climate', 'Chills a room to −6°C: a walk-in freezer for food (300 W)'),
  build('sandbags', 'Sandbags', '', 'security', 'Cover: cuts the chance of being hit from that side to about a third'),
  build(
    'embrasure',
    'Embrasure',
    '',
    'security',
    'A stone wall slot: colonists shoot out through it while it shields them, and nobody walks through',
  ),
  build('spikeTrap', 'Spike trap', '', 'security', 'Wounds the first raider to step on it, then gets rebuilt'),
  build(
    'prisonerBed',
    'Prisoner bed',
    '',
    'security',
    'Where a captured raider is held while Warden colonists feed them and win them over',
  ),
];

export const SPEEDS = [0, 1, 2, 4];

const BENCH_NAMES: Record<BenchType, string> = {
  cooking: 'stove',
  crafting: 'crafting bench',
  stonecutting: "stonecutter's table",
  mill: 'millstone',
  kiln: 'kiln',
  smelter: 'smelter',
};

const FOOD_KIND_NAMES: Record<string, string> = { meat: 'meat or fish', veg: 'vegetables', dairy: 'dairy' };

function ingredientName(ing: Ingredient): string {
  if (ing.item !== undefined) {
    return itemDef(ing.item).name.toLowerCase();
  }
  if (ing.foodKind !== undefined) {
    return FOOD_KIND_NAMES[ing.foodKind] ?? ing.foodKind;
  }
  if (ing.worn) {
    return 'worn clothing';
  }
  return (ing.category ?? '').replace(/([A-Z])/g, ' $1').toLowerCase();
}

const WORK_NAMES: Partial<Record<keyof Priorities, string>> = {
  mining: 'mining',
  plantCutting: 'cutting plants',
  construction: 'construction',
  hunting: 'hunting',
  handling: 'animal handling',
};
// Roughly how much nutrition a colonist eats per day.
const DAILY_NUTRITION = 1.4;
export const TICKS_PER_SECOND = 20;
export const SAVE_SLOTS = ['autosave', 'slot-1', 'slot-2', 'slot-3'];

export const slotLabel = (slot: string): string => (slot === 'autosave' ? 'Autosave' : `Slot ${slot.slice(5)}`);

export interface ColonistView {
  id: number;
  name: string;
  color: string;
  activity: string;
  carrying: string | null;
  skills: Skills;
  needs: Needs;
  mood: number;
  inBreak: boolean;
  thoughts: { label: string; mood: number }[];
  priorities: Priorities;
  schedule: ScheduleSlot[];
  traits: { label: string; description: string }[];
  // Chosen to lead the colony.
  leader: boolean;
  // Age in whole years, life stage, past, and family lines ("Mother of …", "Caring for baby …").
  age: number;
  stage: string;
  backstory: { title: string; description: string };
  family: string[];
  status: 'Healthy' | 'Injured' | 'Sick' | 'Downed' | 'Dead';
  bleeding: boolean;
  sleeping: boolean;
  injuries: { label: string; severity: number; tended: boolean; infected: boolean }[];
  // Lasting marks of old wounds, as lines ("Limp: walks slower").
  scars: string[];
  bloodLoss: number;
  disease: { label: string; severity: number; immunity: number } | null;
  relations: { name: string; opinion: number; label: string | null }[];
  drafted: boolean;
  dead: boolean;
  skillList: { key: string; label: string; level: number; passion: number; progress: number }[];
  weapon: string;
  armor: string;
  // How they fight when drafted, and the raider they were told to concentrate on.
  stance: Stance;
  focus: string | null;
  tool: string;
  // e.g. "Good parka (80%)".
  apparel: string;
  // Comfortable temperature range in what they're wearing.
  comfort: string;
  // Exposure and food poisoning, each 0..1.
  conditions: { label: string; value: number }[];
  // Kinds of recreation had lately, most first, e.g. "Relaxing, Outdoors".
  recentRecreation: string;
}

// A story event shown briefly as a card, so major moments aren't missed.
export interface Notification {
  id: number;
  text: string;
  tone: LogEntry['tone'];
}

export interface RaidView {
  faction: string;
  remaining: number;
}

export interface TileView {
  x: number;
  y: number;
  terrain: string;
  feature: string | null;
  items: string | null;
  orders: string[];
  temperature: number;
  room: string | null;
  animal: string | null;
  // Extra lines about the building or items (fuel, power, freshness…).
  details: string[];
  // On a stockpile: its settings (the groups it refuses, as a bit mask over STORAGE_GROUPS, and its
  // priority), for the controls in the tile card.
  stockpile: { tile: number; refused: number; priority: StockpilePriority } | null;
  // On a door: whether it's locked, for the lock button.
  door: { tile: number; locked: boolean } | null;
}

export interface CaptiveView {
  id: number;
  name: string;
  faction: string;
  state: 'downed' | 'prisoner';
  capture: boolean;
  // Downed: hours before they die of their wounds. Prisoner: 0.
  hoursLeft: number;
  food: number;
  // Talks still needed before they'll consider joining (0: ready).
  talksLeft: number;
}

export interface PowerView {
  hasGrid: boolean;
  supply: number;
  demand: number;
  stored: number;
  capacity: number;
  powered: boolean;
}

export type Overlay = 'none' | 'temperature';

export interface BillView {
  recipe: number;
  name: string;
  product: string;
  target: number;
  stock: number;
  // What one batch consumes and makes, e.g. "6 raw food → 1 simple meal".
  recipeText: string;
  // A mending bill: on or off, rather than a stock target.
  mend: boolean;
  bench: string;
  hasBench: boolean;
  // Research project that must be finished first, if any.
  locked: string | null;
  // Skill a colonist needs to work it, e.g. "Cooking 6".
  minSkill: string | null;
  step: number;
}

export interface TradeLine {
  item: number;
  name: string;
  count: number;
  // Silver per unit.
  price: number;
}

export interface TradeView {
  open: boolean;
  faction: string;
  relation: string;
  goodwill: number;
  leavesIn: number;
  // Silver in the colony's stockpiles, and the traders' purse.
  silver: number;
  traderSilver: number;
  theirs: TradeLine[];
  ours: TradeLine[];
  // Sculptures the traders would buy, where they stand.
  art: { tile: number; name: string; title: string; byline: string; price: number; affordable: boolean }[];
}

export interface ObjectiveView {
  id: string;
  label: string;
  phase: number;
  done: boolean;
  failed: boolean;
  progress?: string;
  // A line on how to get it done, and the tool or screen that does it.
  how: string;
  tool?: string;
  screen?: 'work' | 'production' | 'research' | 'schedule' | 'ship';
}

export interface FactionView {
  id: number;
  name: string;
  description: string;
  relation: string;
  hostile: boolean;
  goodwill: number | null;
  // Friendly: the goodwill each gift size would earn. Hostile: days of bought peace left (0: none).
  giftGains: number[];
  peaceDays: number;
}

export interface DiplomacyView {
  request: {
    faction: string;
    kind: 'deliver' | 'hunt';
    text: string;
    // Deliveries: how many the stockpiles hold of what's asked.
    have: number;
    count: number;
    hoursLeft: number;
    // Hunts: where the beast is.
    quarryTile: number | null;
  } | null;
  silver: number;
  tributeCost: number;
  giftSizes: readonly number[];
}

export interface Alert {
  text: string;
  // Calm: good news to look forward to (a festival, a wedding).
  tone: 'warn' | 'danger' | 'calm';
  // Who or where it's about: clicking the alert takes the camera there.
  colonist?: number;
  tile?: number;
}

export interface ResearchView {
  key: string;
  name: string;
  description: string;
  cost: number;
  progress: number;
  done: boolean;
  available: boolean;
  current: boolean;
  requires: string[];
}

export interface UiState {
  season: string;
  year: number;
  daysUntilWinter: number;
  research: ResearchView[];
  researchBench: boolean;
  // Tool id → name of the research project it still needs.
  lockedTools: Record<string, string>;
  day: number;
  time: string;
  night: boolean;
  outdoorTemp: number;
  speed: number;
  toolId: string;
  colonists: ColonistView[];
  selectedColonist: number | null;
  resources: { item: number; name: string; stored: number; total: number }[];
  // Days the colony's food would last at the current headcount.
  foodDays: number;
  objectives: ObjectiveView[];
  bills: BillView[];
  alerts: Alert[];
  log: LogEntry[];
  story: StoryEntry[];
  // Whether the colony keeps the seasonal festivals.
  festivals: boolean;
  // The colony's leader (null: none yet), when they were chosen, how a vote would go now, and the policies.
  village: {
    leader: { id: number; name: string; mood: number } | null;
    electedOn: number;
    standings: { name: string; votes: number }[];
    rations: Rations;
    hours: Hours;
    restDays: boolean;
  };
  raid: RaidView | null;
  hover: TileView | null;
  hoverColonist: number | null;
  selectedTile: TileView | null;
  power: PowerView;
  overlay: Overlay;
  saves: SaveMeta[];
  toast: string | null;
  // Everyone has died.
  fallen: boolean;
  // The signal beacon and its ship: 'landed' means the colony must choose; 'departed' is the end.
  ship: 'none' | 'transmitting' | 'answered' | 'landed' | 'departed';
  // Hours the beacon has transmitted towards the next ship.
  beaconHours: number;
  // For the closing summary.
  legacy: { label: string; value: string | number }[];
  settings: Settings;
  // Whether the player is playing this colony (false for the backdrop behind the title screen).
  inPlay: boolean;
  // The most recent save this version can load, for Continue.
  latestSave: SaveMeta | null;
  // A trade caravan: on its way (not open yet), here (open), or null when none is about.
  trade: TradeView | null;
  // Raiders lying wounded, and prisoners.
  captives: CaptiveView[];
  factions: FactionView[];
  // A favour the neighbours have asked, and what the colony can pay with.
  diplomacy: DiplomacyView;
  // Current weather, e.g. { label: 'Rain', icon: '🌧' } (no icon when clear).
  weather: { label: string; icon: string };
  // Tiles on fire anywhere on the map.
  fires: number;
  stats: {
    raidsRepelled: number;
    kills: number;
    hunted: number;
    tamed: number;
    wintersSurvived: number;
    built: number;
  };
  notifications: Notification[];
  seed: number;
  difficulty: Difficulty;
  // Tiles per side.
  mapSize: number;
}

const toolId = (tool: Tool): string =>
  TOOLS.find((t) => JSON.stringify(t.tool) === JSON.stringify(tool))?.id ?? 'select';

// Owns the running simulation and mediates between it, the Phaser renderer, and the React UI.
export class GameController {
  public sim: Simulation;
  public tool: Tool = { kind: 'select' };
  public selectedColonist: number | null = null;
  public hoverTile: number | null = null;
  public hoverColonist: number | null = null;
  public selectedTile: number | null = null;
  public overlay: Overlay = 'none';
  // Incremented whenever `sim` is replaced, so the renderer knows to rebuild.
  public simVersion = 0;
  public focusRequest: number | null = null;
  // The tiles the camera can see, kept up to date by the renderer (for the minimap).
  public cameraView = { x0: 0, y0: 0, x1: 0, y1: 0 };

  private speedIndex = 1;
  // Speed to restore when a menu that paused the game closes.
  private heldSpeed: number | null = null;
  private resumeSpeed = 1;
  private accumulator = 0;
  private lastFrame = performance.now();
  private sinceUiUpdate = Infinity;
  private saves: SaveMeta[] = [];
  private toast: string | null = null;
  private toastTimer = 0;
  private notifications: (Notification & { expires: number })[] = [];
  private nextNotification = 0;
  // How much of the story log has already been shown as notifications.
  private storySeen = 0;
  // Tick at which each colonist last started idling, for the idle alert.
  private idleSince = new Map<number, number>();
  // Set once everyone has died (the game pauses and offers a new colony).
  private fallen = false;
  private state: UiState;
  private readonly listeners = new Set<() => void>();

  constructor() {
    // A colony to look at behind the title screen; it only counts once the player starts playing.
    this.sim = Simulation.newColony(Math.floor(Math.random() * 1e9));
    this.focusRequest = this.sim.colonists[0].tile;
    this.storySeen = this.sim.storyLog.length;
    this.state = this.buildState();
    this.refreshSaves();
    this.applySound();
    // Leaving the page (closing the tab, switching away on a phone) saves the colony.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        sound.setHidden(document.hidden);
        if (document.hidden) {
          this.autosave();
        }
      });
    }
  }

  // Player preferences, remembered between visits.
  public settings: Settings = loadSettings();
  // False until the player starts, continues or loads a colony, and again after quitting to the title.
  private inPlay = false;

  public setSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    storeSettings(this.settings);
    this.applySound();
    this.publish();
  }

  // What the colony leaves behind, for the closing summary.
  private legacySummary(): { label: string; value: string | number }[] {
    const sim = this.sim;
    if (!sim.departed) {
      return [];
    }
    const st = sim.stats;
    const fallen = sim.colonists.filter((c) => c.health.dead).length;
    const married = sim.living().filter((c) => c.spouse >= 0).length / 2;
    return [
      { label: 'Days in the valley', value: sim.day },
      { label: 'Boarded the ship', value: sim.living().length },
      { label: 'Lost along the way', value: fallen },
      { label: 'Winters survived', value: st.wintersSurvived },
      { label: 'Raids repelled', value: st.raidsRepelled },
      { label: 'Research completed', value: sim.research.done.length },
      { label: 'Sculptures carved', value: st.sculptures ?? 0 },
      { label: 'Concerts given', value: st.concerts ?? 0 },
      { label: 'Weddings', value: st.weddings ?? 0 },
      { label: 'Children born', value: st.births ?? 0 },
      { label: 'Legendary works', value: st.legends ?? 0 },
      { label: 'Couples leaving together', value: Math.floor(married) },
      { label: 'Buildings built', value: st.built },
    ];
  }

  private applySound(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const s = this.settings;
    sound.configure({ enabled: s.sound, master: s.masterVolume, music: s.musicVolume, effects: s.effectsVolume });
  }

  // What the sound needs from the colony each frame: who's playing what, and the weather.
  private soundScene(): SoundScene {
    const sim = this.sim;
    const w = sim.world;
    const view = this.cameraView;
    const musicians: Musician[] = [];
    for (const c of sim.living()) {
      const job = c.job;
      if (job?.type !== 'joy' || job.listening || job.target < 0 || c.path.length > 0) {
        continue;
      }
      const f = w.feature[job.target];
      const key = f !== NONE ? featureDef(f).key : '';
      if (!featureDef(f)?.joy?.instrument || !isInstrument(key)) {
        continue;
      }
      const x = w.xOf(c.tile);
      const y = w.yOf(c.tile);
      musicians.push({
        id: c.id,
        instrument: key,
        skill: c.skills.artistic,
        inView: x >= view.x0 && x <= view.x1 && y >= view.y0 && y <= view.y1,
      });
    }
    const weather = sim.weather.kind;
    return {
      musicians,
      paused: this.speedIndex === 0 || !this.inPlay,
      night: sim.isNight(),
      rain: weather === 'rain' || weather === 'storm',
      storm: weather === 'storm',
    };
  }

  private autosave(): void {
    if (this.inPlay && this.settings.autosave && this.sim.living().length > 0) {
      this.save('autosave', true);
    }
  }

  // The most recent save made by this version of the game.
  private latestSave(): SaveMeta | null {
    return this.saves.filter((s) => s.version === SAVE_VERSION).sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
  }

  public async continueLatest(): Promise<boolean> {
    const latest = this.latestSave();
    return latest ? this.load(latest.slot) : false;
  }

  // Back to the title screen; the colony is autosaved first (if autosave is on) so Continue
  // picks it up again.
  // Returns whether the quit went ahead (a failed save keeps the player in their colony).
  public async quitToTitle(): Promise<boolean> {
    const version = this.simVersion;
    if (this.inPlay && this.settings.autosave && this.sim.living().length > 0) {
      if (!(await this.save('autosave', true))) {
        this.notify('Autosave failed, so the colony is still open. Save to a slot, or turn autosave off.');
        return false;
      }
    }
    // A different colony started while the save was writing: stay with that one.
    if (this.simVersion !== version) {
      return false;
    }
    this.inPlay = false;
    this.publish();
    return true;
  }

  // ---- React store interface ----

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public getState = (): UiState => this.state;

  public publish(): void {
    this.state = this.buildState();
    this.listeners.forEach((listener) => listener());
  }

  // Fraction of the way to the next tick, for smooth rendering between ticks.
  public get tickFraction(): number {
    return SPEEDS[this.speedIndex] > 0 ? this.accumulator : 0;
  }

  // ---- Called every render frame by the Phaser scene ----

  public frame(): void {
    // Use real elapsed time rather than the renderer's smoothed delta, so the simulation
    // keeps pace on slow frames. Long gaps (a backgrounded tab) are clamped to one second.
    const now = performance.now();
    const deltaMs = Math.min(now - this.lastFrame, 1000);
    this.lastFrame = now;
    this.accumulator += (deltaMs / 1000) * TICKS_PER_SECOND * SPEEDS[this.speedIndex];
    while (this.accumulator >= 1) {
      this.sim.step();
      this.accumulator--;
    }
    for (const event of this.sim.events.splice(0)) {
      if (event === 'raid' || event === 'manhunters') {
        sound.alert('raid');
      } else if (event === 'death') {
        sound.alert('death');
      } else if (event === 'goal' || event === 'concert') {
        sound.alert(event);
      } else if (event === 'shipAnswered') {
        sound.alert('goal');
        this.notify('A ship has answered the signal. It lands in two days.');
      } else if (event === 'shipLanded') {
        sound.alert('goal');
        this.setSpeed(0);
      } else if (event === 'gathering') {
        // A funeral gets a sombre note, not a cheerful chime.
        sound.alert(this.sim.gathering?.kind === 'funeral' ? 'death' : 'concert');
      }
      if (event === 'dawn') {
        this.autosave();
      } else if (event === 'fire' && this.settings.pauseOnEmergency) {
        this.setSpeed(0);
        this.notify('Game paused: fire near the colony.');
      } else if (event === 'raidNear' && this.settings.pauseOnRaid) {
        // On a big map the raid was announced hours ago; stop again as it arrives.
        this.setSpeed(0);
        this.notify('Game paused: the raiders are closing in.');
      } else if (event === 'manhunters' && this.settings.pauseOnRaid) {
        this.setSpeed(0);
        this.notify('Game paused: maddened animals are coming. Press Q to draft your colonists.');
      } else if (event === 'raid' && this.settings.pauseOnRaid) {
        // Give the player a moment to react.
        this.setSpeed(0);
        this.notify('Game paused. Press Q to draft your colonists.');
      } else if (
        (event === 'death' || event === 'collapse') &&
        this.settings.pauseOnEmergency &&
        this.sim.living().length > 0
      ) {
        this.setSpeed(0);
        this.notify(event === 'death' ? 'Game paused: a colonist has died.' : 'Game paused: a colonist collapsed.');
      }
    }
    if (this.sim.living().length === 0 && !this.fallen) {
      this.fallen = true;
      this.setSpeed(0);
    }
    if (this.toast && (this.toastTimer -= deltaMs) <= 0) {
      this.toast = null;
    }
    this.collectNotifications(now);
    if (this.settings.sound) {
      sound.update(this.soundScene());
    }
    this.sinceUiUpdate += deltaMs;
    this.sinceHoverUpdate += deltaMs;
    if (this.sinceUiUpdate >= 200 || (this.hoverChanged && this.sinceHoverUpdate >= 80)) {
      this.sinceUiUpdate = 0;
      this.sinceHoverUpdate = 0;
      this.hoverChanged = false;
      this.publish();
    }
  }

  // ---- Player actions ----

  public command(cmd: Command): void {
    this.commandCount++;
    this.sim.apply(cmd);
    this.publish();
  }

  public setResearch(project: string | null): void {
    this.command({ type: 'research', project });
  }

  public setTool(tool: Tool): void {
    const needs = tool.kind === 'build' ? featureDef(tool.feature).research : undefined;
    if (needs && !this.sim.isResearched(needs)) {
      this.notify(`Requires research: ${researchDef(needs)?.name ?? needs}.`);
      return;
    }
    this.tool = tool;
    this.publish();
  }

  // Pauses while a full-screen menu is open, then picks up at the speed the player had.
  public holdPause(): void {
    if (this.heldSpeed === null) {
      this.heldSpeed = this.speedIndex;
      this.setSpeed(0);
    }
  }

  public releasePause(): void {
    if (this.heldSpeed !== null) {
      const speed = this.heldSpeed;
      this.heldSpeed = null;
      this.setSpeed(speed);
    }
  }

  public setSpeed(index: number): void {
    this.speedIndex = index;
    if (index > 0) {
      this.resumeSpeed = index;
    }
    this.publish();
  }

  public togglePause(): void {
    this.setSpeed(this.speedIndex === 0 ? this.resumeSpeed : 0);
  }

  public toggleDraft(id: number): void {
    const c = this.sim.colonists[id];
    if (c) {
      this.command({ type: 'draft', colonist: id, drafted: !c.drafted });
    }
  }

  // Drafts every able colonist, or stands everyone down if they're all drafted already.
  public toggleDraftAll(): void {
    const able = this.sim.living().filter((c) => !c.health.downed && c.age >= DRAFT_AGE);
    const draft = able.some((c) => !c.drafted);
    for (const c of able) {
      this.command({ type: 'draft', colonist: c.id, drafted: draft });
    }
  }

  // Right-click with drafted colonists: on a raider, concentrate fire on them (the selected
  // colonist, or everyone drafted if none is selected); elsewhere, send the selected colonist
  // there. Returns false if there was no one to order.
  public orderMove(tile: number): boolean {
    const id = this.selectedColonist;
    const raider = this.sim.enemies.find((e) => e.hp > 0 && e.tile === tile);
    if (raider) {
      const selected = id !== null && this.sim.colonists[id]?.drafted;
      if (!selected && !this.sim.living().some((c) => c.drafted)) {
        return false;
      }
      this.command({ type: 'focus', colonist: selected ? id : -1, enemy: raider.id });
      this.notify(`${selected ? this.sim.colonists[id].name : 'Everyone drafted'} will concentrate on ${raider.name}.`);
      return true;
    }
    if (id === null || !this.sim.colonists[id]?.drafted) {
      return false;
    }
    this.command({ type: 'move', colonist: id, tile });
    return true;
  }

  public setStance(colonist: number, stance: Stance): void {
    this.command({ type: 'stance', colonist, stance });
  }

  public clearFocus(colonist: number): void {
    this.command({ type: 'focus', colonist, enemy: -1 });
  }

  public selectTile(tile: number | null): void {
    this.selectedTile = tile;
    if (tile !== null) {
      this.selectedColonist = null;
    }
    this.publish();
  }

  public setOverlay(overlay: Overlay): void {
    this.overlay = overlay;
    this.publish();
  }

  // Selects the next living colonist after the current one and centres the view on them.
  public cycleColonist(): void {
    const living = this.sim.living();
    if (living.length === 0) {
      return;
    }
    const at = living.findIndex((c) => c.id === this.selectedColonist);
    this.selectColonist(living[(at + 1) % living.length].id, true);
  }

  // Takes the camera to whoever or wherever an alert is about (and selects them).
  public focusAlert(alert: Alert): void {
    if (alert.colonist !== undefined) {
      this.selectColonist(alert.colonist, true);
    } else if (alert.tile !== undefined) {
      this.focusRequest = alert.tile;
      this.selectTile(alert.tile);
    }
  }

  // Picks a tool by its id (goals use this); returns false if it's locked or unknown.
  public selectToolById(id: string): boolean {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) {
      return false;
    }
    const before = this.tool;
    this.setTool(tool.tool);
    return this.tool !== before;
  }

  public selectColonist(id: number | null, focus = false): void {
    this.selectedColonist = id;
    if (id !== null) {
      this.selectedTile = null;
    }
    if (id !== null && focus) {
      this.focusRequest = this.sim.colonists[id].tile;
    }
    this.publish();
  }

  // Hover changes as fast as the mouse moves; the card under it refreshes at most every 80 ms.
  public setHover(tile: number | null, colonist: number | null = null): void {
    if (tile !== this.hoverTile || colonist !== this.hoverColonist) {
      this.hoverTile = tile;
      this.hoverColonist = colonist;
      this.hoverChanged = true;
    }
  }

  private hoverChanged = false;
  private sinceHoverUpdate = 0;

  // Set by the UI while a full-screen menu is open, so game hotkeys don't act behind it.
  public modalOpen = false;

  public newColony(seedText: string, difficulty: Difficulty = 'standard', size = MAP_SIZE): void {
    // Offer the same choices next time.
    this.setSettings({ newDifficulty: difficulty, newMapSize: size });
    const trimmed = seedText.trim();
    const seed =
      trimmed === '' ? Math.floor(Math.random() * 1e9) : /^\d+$/.test(trimmed) ? Number(trimmed) : hashSeed(trimmed);
    this.replaceSim(Simulation.newColony(seed, difficulty, size));
    this.inPlay = true;
    this.notify(`New colony founded (seed ${seed}).`);
  }

  public async deleteSave(slot: string): Promise<void> {
    try {
      await deleteSave(slot);
      await this.refreshSaves();
      this.notify(`Deleted ${slotLabel(slot).toLowerCase()}.`);
    } catch (error) {
      console.error(error);
      this.notify('Deleting failed.');
    }
  }

  public dismissNotification(id: number): void {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.publish();
  }

  // Turns new story entries into short-lived notification cards.
  private collectNotifications(now: number): void {
    const story = this.sim.storyLog;
    const before = this.notifications.length;
    // The story log is capped, so count entries ever written rather than its length.
    const fresh = Math.min(this.sim.storyCount - this.storySeen, story.length);
    for (const entry of story.slice(story.length - fresh)) {
      this.notifications.push({
        id: this.nextNotification++,
        text: entry.text,
        tone: entry.tone,
        expires: now + this.settings.noticeSeconds * 1000,
      });
    }
    this.storySeen = this.sim.storyCount;
    // Keep at most four cards; the oldest calm ones make way first, so danger is never pushed out.
    this.notifications = this.notifications.filter((n) => n.expires > now);
    while (this.notifications.length > 4) {
      const calm = this.notifications.findIndex((n) => n.tone !== 'danger');
      this.notifications.splice(calm >= 0 ? calm : 0, 1);
    }
    if (this.notifications.length !== before) {
      this.publish();
    }
  }

  private tradeView(): TradeView | null {
    const sim = this.sim;
    const caravan = sim.caravan;
    if (!caravan) {
      return null;
    }
    const price = prices(sim, caravan.faction);
    const silver = itemId('silver');
    const goodwill = goodwillOf(sim, caravan.faction);
    // What the colony's stockpiles hold, in one pass.
    const stock = new Map<number, number>();
    for (const i of sim.world.tilesWith('items')) {
      if (sim.isStockpile(i)) {
        const item = sim.world.itemType[i];
        stock.set(item, (stock.get(item) ?? 0) + sim.world.itemCount[i]);
      }
    }
    return {
      open: tradeOpen(sim),
      faction: FACTIONS[caravan.faction].name,
      relation: standingLabel(goodwill, false),
      goodwill,
      leavesIn: Math.max(0, Math.ceil((caravan.leaveAt - sim.tick) / TICKS_PER_HOUR)),
      silver: stock.get(silver) ?? 0,
      traderSilver: caravan.silver,
      theirs: caravan.stock.map((s) => ({
        item: s.item,
        name: itemDef(s.item).name,
        count: s.count,
        price: price.buy(s.item),
      })),
      ours: tradableItems()
        .map((item) => ({ item, name: itemDef(item).name, count: stock.get(item) ?? 0, price: price.sell(item) }))
        .filter((line) => line.count > 0),
      art: artForSale(sim).map((offer) => ({
        tile: offer.tile,
        name: offer.name,
        title: offer.title,
        byline: `${qualityLabel(offer.quality)} quality, by ${offer.artist}`,
        price: offer.price,
        affordable: offer.price <= caravan.silver,
      })),
    };
  }

  // One deal with the visiting traders.
  public trade(buy: [number, number][], sell: [number, number][]): boolean {
    const error = applyTrade(this.sim, buy, sell);
    this.commandCount++;
    this.notify(error ?? 'Deal done.');
    this.publish();
    return error === null;
  }

  // Returns whether the save was written.
  public async save(slot: string, auto = false): Promise<boolean> {
    const sim = this.sim;
    try {
      await writeSave(
        {
          slot,
          day: sim.day,
          hour: Math.floor(sim.hour),
          seed: sim.seed,
          savedAt: Date.now(),
          version: SAVE_VERSION,
          colonists: sim.living().length,
          difficulty: sim.story.difficulty,
          mapSize: sim.world.width,
        },
        serialize(sim),
      );
      await this.refreshSaves();
      if (!auto) {
        this.notify(`Saved to ${slotLabel(slot).toLowerCase()}.`);
      }
      return true;
    } catch (error) {
      console.error(error);
      this.notify('Saving failed.');
      return false;
    }
  }

  // Returns whether the save loaded.
  public async load(slot: string): Promise<boolean> {
    const version = this.simVersion;
    try {
      const data = await readSave(slot);
      // The player started or loaded another colony while this was reading: keep that one.
      if (this.simVersion !== version) {
        return false;
      }
      if (!data) {
        this.notify(`Nothing saved in ${slotLabel(slot).toLowerCase()}.`);
        return false;
      }
      if (data.version !== SAVE_VERSION) {
        this.notify('That save is from an older version and cannot be loaded.');
        return false;
      }
      this.replaceSim(deserialize(data));
      this.inPlay = true;
      this.notify(`Loaded ${slotLabel(slot).toLowerCase()}.`);
      return true;
    } catch (error) {
      console.error(error);
      this.notify('That save could not be loaded.');
      return false;
    }
  }

  private replaceSim(sim: Simulation): void {
    this.sim = sim;
    this.simVersion++;
    this.idleSince.clear();
    // A colony started after the last one fell shouldn't sit paused: resume at the player's speed,
    // now or (if a menu is holding the pause) when the menu closes.
    if (this.fallen) {
      if (this.heldSpeed !== null) {
        this.heldSpeed = this.resumeSpeed;
      } else {
        this.setSpeed(this.resumeSpeed);
      }
    }
    // Tools and overlays belong to the old colony (its research, its map).
    this.tool = { kind: 'select' };
    this.overlay = 'none';
    this.fallen = false;
    this.selectedColonist = null;
    this.selectedTile = null;
    // The new map may be smaller than the old one.
    this.hoverTile = null;
    this.hoverColonist = null;
    this.accumulator = 0;
    this.focusRequest = sim.colonists[0].tile;
    // Don't replay a loaded colony's history as notifications.
    this.storySeen = sim.storyCount;
    this.notifications = [];
    this.publish();
  }

  private async refreshSaves(): Promise<void> {
    try {
      this.saves = await listSaves();
      this.publish();
    } catch (error) {
      console.error(error);
    }
  }

  private notify(text: string): void {
    this.toast = text;
    this.toastTimer = 2500;
    this.publish();
  }

  // ---- Snapshot for the UI ----

  private buildState(): UiState {
    const sim = this.sim;
    const hour = sim.hour;
    const hh = Math.floor(hour);
    const mm = Math.floor((hour - hh) * 60);
    const totals = sim.resourceTotals();
    return {
      season: `${sim.season} ${seasonDay(sim.totalHours)}/${DAYS_PER_SEASON}`,
      year: yearOf(sim.totalHours),
      daysUntilWinter: Math.ceil(daysUntilWinter(sim.totalHours)),
      research: RESEARCH.map((p) => ({
        key: p.key,
        name: p.name,
        description: p.description,
        cost: p.cost,
        progress: Math.min(1, (sim.research.progress[p.key] ?? 0) / p.cost),
        done: sim.research.done.includes(p.key),
        available: isAvailable(sim.research, p),
        current: sim.research.current === p.key,
        requires: p.requires.map((r) => researchDef(r)?.name ?? r),
      })),
      researchBench: sim.countFeature((f) => featureDef(f).researchStation) > 0,
      lockedTools: Object.fromEntries(
        TOOLS.flatMap((t) => {
          const needs = t.tool.kind === 'build' ? featureDef(t.tool.feature).research : undefined;
          return needs && !sim.isResearched(needs) ? [[t.id, researchDef(needs)?.name ?? needs]] : [];
        }),
      ),
      day: sim.day,
      time: `${String(hh).padStart(2, '0')}:${String(mm - (mm % 10)).padStart(2, '0')}`,
      night: sim.isNight(),
      outdoorTemp: Math.round(sim.outdoorTemperature()),
      speed: this.speedIndex,
      toolId: toolId(this.tool),
      colonists: sim.colonists.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        activity: sim.describe(c),
        carrying: c.carrying && `${c.carrying.count} ${itemDef(c.carrying.item).name.toLowerCase()}`,
        skills: { ...c.skills },
        needs: { ...c.needs },
        recentRecreation: (Object.entries(c.recentJoy) as [JoyKind, number][])
          .filter(([, amount]) => amount >= 0.05)
          .sort((a, b) => b[1] - a[1])
          .map(([kind]) => JOY_KIND_LABELS[kind])
          .join(', '),
        mood: Math.round(c.mood),
        inBreak: sim.inMentalBreak(c),
        thoughts: sim.thoughtsOf(c),
        priorities: { ...c.priorities },
        schedule: [...c.schedule],
        traits: c.traits.map((key) => ({ label: TRAITS[key].label, description: TRAITS[key].description })),
        leader: sim.village.leader === c.id,
        age: Math.floor(c.age),
        stage: stageOf(c.age),
        backstory: (({ title, description }) => ({ title, description }))(backstoryOf(c.backstory)),
        family: this.familyOf(c),
        bleeding: !c.health.dead && bleedingOf(c) > 0,
        sleeping: c.sleeping,
        status: c.health.dead
          ? 'Dead'
          : c.health.downed
            ? 'Downed'
            : c.health.disease
              ? 'Sick'
              : c.health.injuries.length > 0
                ? 'Injured'
                : 'Healthy',
        injuries: c.health.injuries.map((injury) => ({
          label: injury.part ? `${injury.label} (${PART_LABELS[injury.part]})` : injury.label,
          severity: injury.severity,
          tended: injury.tended > 0,
          infected: isInfected(injury),
        })),
        scars: scarsOf(c).map((s) => SCAR_LABELS[s.kind]),
        bloodLoss: c.health.bloodLoss,
        disease: c.health.disease && {
          label: c.health.disease.label,
          severity: c.health.disease.severity,
          immunity: c.health.disease.immunity,
        },
        relations: sim.colonists
          .filter((o) => o !== c && !o.health.dead)
          .map((o) => ({ name: o.name, opinion: Math.round(c.opinions[o.id] ?? 0), label: relationLabel(c, o) }))
          .sort((a, b) => b.opinion - a.opinion),
        drafted: c.drafted,
        dead: c.health.dead,
        skillList: SKILL_KEYS.map((key) => ({
          key,
          label: SKILL_LABELS[key],
          level: c.skills[key],
          passion: c.passions[key],
          progress: c.skills[key] >= MAX_SKILL ? 1 : c.skillXp[key] / xpToNext(c.skills[key]),
        })),
        weapon:
          weaponDef(c.weapon).item !== undefined
            ? `${qualityLabel(c.weaponQuality)} ${weaponDef(c.weapon).name.toLowerCase()}`
            : weaponDef(c.weapon).name,
        armor: c.armor
          ? `${itemDef(c.armor.item).name} (${Math.round(armorOf(c).protection * 100)}%, ${Math.round(c.armor.wear * 100)}% condition)`
          : 'None',
        stance: c.stance,
        focus: sim.enemies.find((e) => e.id === c.focus && e.hp > 0)?.name ?? null,
        tool: c.tool ? `${qualityLabel(c.tool.quality)} tool kit (${Math.round(c.tool.wear * 100)}%)` : 'None',
        apparel: c.apparel
          ? `${qualityLabel(c.apparel.quality)} ${itemDef(c.apparel.item).name.toLowerCase()} (${Math.round(c.apparel.wear * 100)}%)`
          : 'Nothing',
        comfort: ((r) => `${Math.round(r.min)}°C to ${Math.round(r.max)}°C`)(comfortRange(c)),
        conditions: [
          { label: 'Hypothermia', value: c.health.hypothermia },
          { label: 'Heatstroke', value: c.health.heatstroke },
          { label: 'Food poisoning', value: c.health.poisoned / POISONING_HOURS },
        ].filter((condition) => condition.value > 0.02),
      })),
      selectedColonist: this.selectedColonist,
      resources: totals.map((r) => ({ item: r.item, name: itemDef(r.item).name, stored: r.stored, total: r.total })),
      foodDays:
        totals.reduce((sum, t) => sum + itemDef(t.item).nutrition * t.total, 0) /
        (Math.max(1, sim.living().length) * DAILY_NUTRITION),
      objectives: OBJECTIVES.filter((o) => !o.hidden?.(sim)).map((o) => ({
        id: o.id,
        label: o.label,
        phase: o.phase,
        done: !!sim.objectivesDone[o.id],
        failed: sim.objectiveFailed(o.id),
        progress: o.progress?.(sim),
        ...(GOAL_HELP[o.id] ?? { how: '' }),
      })),
      bills: sim.bills.map((bill) => {
        const recipe = RECIPES[bill.recipe];
        const input = recipe.ingredients.map((ing) => `${ing.count} ${ingredientName(ing)}`).join(' + ');
        const product = itemDef(recipe.product.item);
        // Mending's "stock" is the worn clothing waiting for it.
        const worn = [...sim.world.tilesWith('items')].filter(
          (i) => !!itemDef(sim.world.itemType[i]).apparel && sim.world.fresh[i] < MENDABLE,
        ).length;
        return {
          recipe: bill.recipe,
          name: recipe.name,
          product: product.name,
          target: bill.target,
          stock: recipe.mend ? worn : totals[recipe.product.item - 1].total,
          mend: recipe.mend,
          recipeText: recipe.mend
            ? `${input} → mended`
            : `${input} → ${recipe.product.count} ${product.name.toLowerCase()}`,
          bench: BENCH_NAMES[recipe.bench],
          hasBench: sim.countFeature((f) => featureDef(f).workbench === recipe.bench) > 0,
          minSkill:
            recipe.minSkill > 0 ? `${recipe.bench === 'cooking' ? 'Cooking' : 'Crafting'} ${recipe.minSkill}` : null,
          locked:
            recipe.research && !sim.isResearched(recipe.research)
              ? (researchDef(recipe.research)?.name ?? recipe.research)
              : null,
          // Single items (bows) step by one; stackable goods by five.
          step: product.stackLimit === 1 ? 1 : 5,
        };
      }),
      alerts: this.alertsFor(totals),
      log: sim.log.slice(-12).reverse(),
      story: [...sim.storyLog].reverse(),
      festivals: sim.story.festivals !== false,
      village: this.villageView(),
      raid:
        sim.enemies.length > 0
          ? { faction: FACTIONS[sim.enemies[0].faction].name, remaining: sim.enemies.filter((e) => !e.fleeing).length }
          : null,
      hover: this.hoverTile === null ? null : this.describeTile(this.hoverTile),
      hoverColonist: this.hoverColonist,
      selectedTile: this.selectedTile === null ? null : this.describeTile(this.selectedTile),
      power: {
        hasGrid: sim.power.supply > 0 || sim.power.demand > 0 || sim.power.capacity > 0,
        supply: Math.round(sim.power.supply),
        demand: Math.round(sim.power.demand),
        stored: Math.round(sim.power.stored),
        capacity: sim.power.capacity,
        powered: sim.power.powered,
      },
      overlay: this.overlay,
      saves: this.saves,
      toast: this.toast,
      fallen: this.fallen,
      ship: sim.departed
        ? 'departed'
        : sim.beacon.landed
          ? 'landed'
          : sim.beacon.answeredAt !== undefined
            ? 'answered'
            : sim.beacon.hours > 0
              ? 'transmitting'
              : 'none',
      beaconHours: sim.beacon.hours,
      legacy: this.legacySummary(),
      settings: this.settings,
      inPlay: this.inPlay,
      latestSave: this.latestSave(),
      weather: { label: weatherDef(sim).label, icon: weatherDef(sim).icon },
      trade: this.tradeView(),
      captives: this.captivesView(),
      factions: FACTIONS.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        relation: f.hostile && atPeace(sim, f.id) ? 'Paid off' : standingLabel(goodwillOf(sim, f.id), f.hostile),
        hostile: f.hostile,
        goodwill: f.hostile ? null : goodwillOf(sim, f.id),
        giftGains: f.hostile ? [] : GIFT_SIZES.map((s) => giftGoodwill(sim, f.id, s)),
        peaceDays: atPeace(sim, f.id)
          ? Math.ceil((sim.diplomacy.peaceUntil[f.id] - sim.tick) / (TICKS_PER_HOUR * 24))
          : 0,
      })),
      diplomacy: this.diplomacyView(),
      fires: sim.burning.size,
      stats: {
        raidsRepelled: sim.stats.raidsRepelled,
        kills: sim.stats.kills,
        hunted: sim.stats.hunted,
        tamed: sim.stats.tamed,
        wintersSurvived: sim.stats.wintersSurvived,
        built: sim.stats.built,
      },
      notifications: this.notifications.map(({ id, text, tone }) => ({ id, text, tone })),
      seed: sim.seed,
      difficulty: sim.story.difficulty,
      mapSize: sim.world.width,
    };
  }

  // Problems worth the player's attention right now, most urgent first.
  // Alerts scan the map, so they're worked out once per game tick, not on every mouse move.
  private alertsFor(totals: ReturnType<Simulation['resourceTotals']>): Alert[] {
    // Orders given while paused change alerts too, so they count as well as ticks.
    const key = `${this.simVersion}:${Math.floor(this.sim.tick / 20)}:${this.commandCount}`;
    if (key !== this.alertsKey) {
      this.alertsKey = key;
      this.alerts = this.buildAlerts(totals);
    }
    return this.alerts;
  }

  private alertsKey = '';
  private commandCount = 0;
  private alerts: Alert[] = [];

  private buildAlerts(totals: ReturnType<Simulation['resourceTotals']>): Alert[] {
    const sim = this.sim;
    const w = sim.world;
    const alerts: Alert[] = [];
    const raiders = sim.enemies.filter((e) => !e.fleeing).length;
    // The signal beacon and its ship.
    const beacon = beaconTile(sim);
    if (sim.departed) {
      // The story is over: nothing more to say about the beacon.
    } else if (sim.beacon.landed) {
      alerts.push({
        text: 'The ship is waiting beside the beacon: board it, or stay (Legacy goal)',
        tone: 'calm',
        tile: beacon,
      });
    } else if (sim.beacon.answeredAt !== undefined && sim.beacon.landsAt !== undefined) {
      const hours = Math.max(0, Math.ceil((sim.beacon.landsAt - sim.tick) / TICKS_PER_HOUR));
      alerts.push({
        text: `A ship is coming: it lands in ${hours} ${hours === 1 ? 'hour' : 'hours'}`,
        tone: 'calm',
        tile: beacon,
      });
    } else if (beacon !== undefined && !sim.power.powered) {
      alerts.push({ text: 'The signal beacon has no power: it isn’t transmitting', tone: 'warn', tile: beacon });
    } else if (beacon !== undefined && sim.beacon.hours > 0) {
      alerts.push({
        text: `Signal beacon transmitting: ${sim.beacon.hours}/${TRANSMIT_HOURS} hours. Raiders are drawn to it.`,
        tone: 'calm',
        tile: beacon,
      });
    }
    const gathering = sim.gatheringNotice();
    if (gathering) {
      // Good news, except a funeral.
      const tone = sim.gathering?.kind === 'funeral' ? 'warn' : 'calm';
      alerts.push({ text: gathering, tone, tile: sim.gathering?.tile });
    }
    if (sim.caravan && tradeOpen(sim)) {
      const hours = Math.max(0, Math.ceil((sim.caravan.leaveAt - sim.tick) / TICKS_PER_HOUR));
      alerts.push({
        text: `Traders are visiting for ${hours} more ${hours === 1 ? 'hour' : 'hours'}: open Trade in the top bar.`,
        tone: 'warn',
      });
    }
    if (sim.burning.size > 0) {
      const n = sim.burning.size;
      alerts.push({
        text: `Fire! ${n} tile${n > 1 ? 's' : ''} burning. Colonists who haul or build will fight fires near home.`,
        tone: 'danger',
        tile: sim.burning.values().next().value,
      });
    }
    if (raiders > 0) {
      alerts.push({
        text: `Raid: ${raiders} raider${raiders > 1 ? 's' : ''} from ${FACTIONS[sim.enemies[0].faction].name}. Draft with Q.`,
        tone: 'danger',
        tile: sim.enemies.find((e) => !e.fleeing)?.tile,
      });
    }
    // An obsessed artist's vision: what it still needs, and how long is left.
    const ob = sim.obsession;
    const artist = ob ? sim.colonists[ob.colonist] : undefined;
    if (ob && artist && !artist.health.dead && w.blueprint[ob.tile] === LEGEND) {
      const cost = featureDef(LEGEND).build!.cost;
      const missing = cost
        .map((k, line) => ({
          item: k.item,
          need: k.count - w.deliveredAt(ob.tile, line),
          have: this.availableStock(k.item),
        }))
        .filter((m) => m.need > 0 && m.have < m.need)
        .map((m) => `${m.need - m.have} ${itemDef(m.item).name.toLowerCase()}`);
      const days = Math.max(0, (ob.deadline - sim.tick) / (TICKS_PER_HOUR * 24));
      const left = days < 1 ? 'less than a day' : Math.floor(days) === 1 ? '1 day' : `${Math.floor(days)} days`;
      alerts.push({
        text:
          `${artist.name} is obsessed with a vision (${left} left)` +
          (missing.length > 0 ? `: still short of ${missing.join(', ')}` : ': everything is there'),
        tone: missing.length > 0 && days < 2 ? 'danger' : 'warn',
        tile: ob.tile,
      });
    }
    // Wounded raiders worth taking in, while there's time.
    const lying = sim.captives.filter((p) => p.state === 'downed');
    if (lying.length > 0 && raiders === 0) {
      const marked = lying.filter((p) => p.capture);
      const hasBed = sim.countFeature((f) => featureDef(f).key === 'prisonerBed') > 0;
      const hasWarden = sim.living().some((c) => c.priorities.warden > 0 && !c.health.downed);
      alerts.push({
        text:
          marked.length === 0
            ? `${lying.length} raider${lying.length > 1 ? 's lie' : ' lies'} wounded: drag Capture over them to take them prisoner`
            : !hasBed
              ? 'Build a prisoner bed (Security) so captives can be brought in'
              : !hasWarden
                ? 'Nobody does Warden work: give someone Warden priority to bring captives in'
                : `${marked.length} wounded raider${marked.length > 1 ? 's' : ''} to be brought in`,
        tone: marked.length > 0 && hasBed && hasWarden ? 'calm' : 'warn',
        tile: (marked[0] ?? lying[0]).tile,
      });
    }
    for (const p of sim.captives) {
      if (p.state === 'prisoner' && p.hungryHours > 0) {
        alerts.push({ text: `The prisoner ${p.name} is starving`, tone: 'danger', tile: p.tile });
      }
    }
    for (const c of sim.living()) {
      if (c.health.downed) {
        alerts.push({ text: `${c.name} has collapsed and needs a doctor`, tone: 'danger', colonist: c.id });
      } else if (bleedingOf(c) > 0) {
        alerts.push({ text: `${c.name} is bleeding`, tone: 'danger', colonist: c.id });
      } else if (c.health.injuries.some(isInfected)) {
        alerts.push({
          text: `${c.name} has an infected wound: a doctor should treat it, with herbal medicine if there's any`,
          tone: 'danger',
          colonist: c.id,
        });
      }
      const disease = c.health.disease;
      if (disease) {
        const sev = Math.round(disease.severity * 100);
        const imm = Math.round(disease.immunity * 100);
        alerts.push({
          text: `${c.name} has ${disease.label.toLowerCase()} (severity ${sev}%, immunity ${imm}%)`,
          tone: disease.severity > disease.immunity ? 'danger' : 'warn',
          colonist: c.id,
        });
      }
    }
    for (const a of sim.animals) {
      // A manhunter pack has its own alert.
      const victim = a.revengeOn >= 0 && !a.manhunter ? sim.colonists[a.revengeOn] : undefined;
      if (victim && !victim.health.dead) {
        alerts.push({
          text: `A ${animalName(a).toLowerCase()} is attacking ${victim.name}`,
          tone: 'danger',
          colonist: victim.id,
        });
      }
    }
    const hurt = sim.living().some((c) => c.health.injuries.length > 0 || c.health.disease || painOf(c) > 0);
    if (hurt && sim.stockOf(itemId('herbalMedicine')) === 0) {
      alerts.push({ text: 'No medicine: grow healroot for better treatment', tone: 'warn' });
    }
    // Fires gone out for want of wood.
    const cold = [...w.tilesWith('features')].filter(
      (i) => featureDef(w.feature[i]).burns && featureDef(w.feature[i]).heater > 0 && w.fuel[i] <= 0,
    );
    // Burning through the woodpile: warn while there's still time to chop more.
    // Fires that burn all the time (a kiln or smelter only burns while it's worked).
    const burning = [...w.tilesWith('features')].filter(
      (i) => featureDef(w.feature[i]).burns && !featureDef(w.feature[i]).workbench && w.fuel[i] > 0,
    );
    const perDay = burning.reduce((sum, i) => sum + featureDef(w.feature[i]).burns!.perDay, 0);
    if (cold.length === 0 && perDay > 0 && this.availableStock(itemId('wood')) < perDay * 3) {
      alerts.push({
        text: `Wood is running low: the fires burn about ${Math.round(perDay)} a day. Chop trees (C)`,
        tone: sim.season === 'Winter' || daysUntilWinter(sim.totalHours) < 4 ? 'danger' : 'warn',
      });
    }
    if (cold.length > 0) {
      const wood = this.availableStock(itemId('wood'));
      alerts.push({
        text:
          wood === 0
            ? `${cold.length} fire${cold.length > 1 ? 's have' : ' has'} gone out and there's no wood: chop trees (C)`
            : `${cold.length} fire${cold.length > 1 ? 's have' : ' has'} gone out: colonists with Haul work bring wood`,
        tone: sim.season === 'Winter' || sim.outdoorTemperature() < 5 ? 'danger' : 'warn',
        tile: cold[0],
      });
    }
    const request = sim.diplomacy.request;
    if (request) {
      const hours = Math.max(0, Math.ceil((request.until - sim.tick) / TICKS_PER_HOUR));
      const left = hours > 24 ? `${Math.ceil(hours / 24)} days` : `${hours}h`;
      const quarry = request.kind === 'hunt' ? sim.animals.find((a) => a.id === request.quarry) : undefined;
      alerts.push({
        text:
          request.kind === 'hunt'
            ? `${FACTIONS[request.faction].name} ask: hunt the great boar (${left} left). Drag Hunt over it`
            : `${FACTIONS[request.faction].name} ask for ${quantity(request.item, request.count)} (${colonyStock(sim, request.item)} stored, ${left} left): send it from Factions`,
        tone: hours <= 24 ? 'warn' : 'calm',
        tile: quarry?.tile,
      });
    }
    const untilWinter = daysUntilWinter(sim.totalHours);
    // Winter kills a colony with nowhere warm to go: say so plainly, before and during.
    // A room whose fire has merely gone out counts: the fire alert says to bring wood.
    const warmRoom =
      sim.allRooms().some((r) => r.enclosed && r.heaters > 0) ||
      cold.some((i) => {
        const room = sim.roomAt(i);
        return !!room && room.enclosed;
      });
    if (!warmRoom && sim.living().length > 0 && (sim.season === 'Winter' || (untilWinter > 0 && untilWinter <= 6))) {
      alerts.push({
        text:
          sim.season === 'Winter'
            ? 'Nowhere warm to shelter: build an enclosed room with a campfire before the colonists freeze'
            : `Winter in ${Math.ceil(untilWinter)} day${untilWinter > 1 ? 's' : ''} and nowhere warm to shelter: build an enclosed room with a campfire`,
        tone: 'danger',
      });
    } else if (untilWinter > 0 && untilWinter <= 5) {
      alerts.push({
        text: `Winter in ${Math.ceil(untilWinter)} day${untilWinter > 1 ? 's' : ''}: harvest crops and stock food`,
        tone: 'warn',
      });
    }
    const researching = sim.research.current !== null;
    if (
      !researching &&
      sim.countFeature((f) => featureDef(f).researchStation) > 0 &&
      availableProjects(sim.research).length > 0
    ) {
      alerts.push({ text: 'No research project selected', tone: 'warn' });
    }
    if (coldSnapOn(sim)) {
      alerts.push({ text: 'Cold snap: keep colonists warm indoors', tone: 'warn' });
    }
    if (heatWaveOn(sim)) {
      const hours = Math.ceil(((sim.story.heatWaveUntil ?? 0) - sim.tick) / TICKS_PER_HOUR);
      alerts.push({
        text: `Heat wave for ${hours} more ${hours === 1 ? 'hour' : 'hours'}: keep colonists cool indoors`,
        tone: 'warn',
      });
    }
    if (eclipseOn(sim) && sim.countFeature((f) => !!featureDef(f).power?.solar) > 0) {
      alerts.push({ text: 'Eclipse: solar panels are dark until the sun comes back', tone: 'warn' });
    }
    const manhunters = sim.animals.filter((a) => a.manhunter && a.hp > 0 && a.revengeOn >= 0);
    if (manhunters.length > 0) {
      alerts.push({
        text: manhunters.every((a) => a.kind === 'crawler')
          ? `${manhunters.length} cave crawler${manhunters.length > 1 ? 's are' : ' is'} hunting colonists: draft and fight (Q)`
          : `${manhunters.length} maddened animal${manhunters.length > 1 ? 's are' : ' is'} hunting colonists: draft and fight (Q)`,
        tone: 'danger',
        tile: manhunters[0].tile,
      });
    }
    // Cold indoors: a warm room is the only answer, and this one isn't warm enough. Said as soon as it's
    // colder than their clothes can take, not once they're dying of it.
    const coldInside = sim
      .living()
      .filter(
        (c) => c.health.hypothermia > 0.05 && sim.isIndoors(c.tile) && sim.temperatureAt(c.tile) < comfortRange(c).min,
      );
    if (coldInside.length > 0) {
      const room = sim.roomAt(coldInside[0].tile);
      alerts.push({
        text: `It's ${Math.round(sim.temperatureAt(coldInside[0].tile))}°C in the ${room?.role.toLowerCase() ?? 'room'} and colonists are getting dangerously cold: add a campfire or a hearth, or make parkas`,
        tone: 'danger',
        colonist: coldInside[0].id,
      });
    }
    for (const c of sim.living()) {
      if (sim.inMentalBreak(c)) {
        alerts.push({ text: `${c.name} is having a mental break`, tone: 'danger', colonist: c.id });
      } else if (c.health.hypothermia > 0.4 || c.health.heatstroke > 0.4) {
        const what = c.health.hypothermia > c.health.heatstroke ? 'hypothermia' : 'heatstroke';
        alerts.push({
          text: `${c.name} has ${what}: get them somewhere ${what === 'hypothermia' ? 'warm' : 'cool'}`,
          tone: 'danger',
          colonist: c.id,
        });
      } else if (c.needs.food <= 0) {
        alerts.push({ text: `${c.name} is starving`, tone: 'danger', colonist: c.id });
      } else if (c.mood < 25) {
        alerts.push({ text: `${c.name} is unhappy (mood ${Math.round(c.mood)})`, tone: 'warn', colonist: c.id });
      }
    }
    if (!sim.hasShelter() && sim.hour >= 16 && sim.hour < NIGHT_START) {
      alerts.push({ text: 'No shelter yet, and night falls at 22:00', tone: 'warn' });
    }
    const nutrition = totals.reduce((sum, t) => sum + itemDef(t.item).nutrition * t.total, 0);
    const days = nutrition / (Math.max(1, sim.living().length) * DAILY_NUTRITION);
    if (days < 2) {
      alerts.push({
        text: `Food is running low (about ${days.toFixed(1)} days left): forage berries (G), hunt or fish`,
        tone: days < 1 ? 'danger' : 'warn',
      });
    }
    const beds = sim.countFeature((f) => featureDef(f).bed);
    const alive = sim.living().length;
    if (sim.day > 1 && alive > 0 && beds < alive) {
      const missing = alive - beds;
      alerts.push({ text: `${missing} colonist${missing > 1 ? 's' : ''} without a bed`, tone: 'warn' });
    }
    // Beds nobody can get to: a door opening onto rock, say, or a room walled in on every side.
    if (beds > 0) {
      const bedTiles = [...sim.world.tilesWith('features')].filter((i) => featureDef(sim.world.feature[i]).bed);
      const regions = new Set(
        sim
          .living()
          .filter((c) => !c.health.downed)
          .map((c) => sim.regionOf(c.tile)),
      );
      if (regions.size > 0 && !bedTiles.some((i) => regions.has(sim.regionOf(i)))) {
        alerts.push({
          text: 'Nobody can get to the beds: check the way in (is the door blocked, or the room walled in?)',
          tone: 'danger',
          tile: bedTiles[0],
        });
      }
    }
    // Shelves, iceboxes and drying racks are storage too.
    const anyStorage =
      sim.world.zone.some(isStockpileZone) || [...sim.world.tilesWith('features')].some((i) => sim.isStockpile(i));
    if (!anyStorage && totals.some((t) => t.total > 0)) {
      alerts.push({ text: 'No stockpile: items are left where they fall', tone: 'warn' });
    }
    // Blueprints waiting on materials the colony doesn't have.
    const outstanding = new Map<number, number>();
    for (let i = 0; i < w.size; i++) {
      for (const need of w.blueprintNeeds(i)) {
        outstanding.set(need.item, (outstanding.get(need.item) ?? 0) + need.count);
      }
    }
    const source: Record<string, string> = {
      wood: 'chop trees (C)',
      stone: 'mine rock (M)',
      cloth: 'weave cotton at a crafting bench',
      stoneBlocks: "cut granite at a stonecutter's table",
      leather: 'hunt animals (V)',
      bricks: 'fire clay in a kiln (Pottery)',
      clay: 'mine the clay banks along the shore (M)',
      iron: 'smelt iron ore in a smelter (Smelting)',
      ironOre: 'mine the rusty iron veins in the rock (M)',
      silver: 'trade with caravans',
    };
    for (const [item, count] of outstanding) {
      const short = count - totals[item - 1].total;
      if (short > 0) {
        const def = itemDef(item);
        const how = source[def.key] ? `: ${source[def.key]}` : '';
        alerts.push({ text: `Blueprints need ${short} more ${def.name.toLowerCase()}${how}`, tone: 'warn' });
      }
    }
    // Full means no stockpile tile has room for any of the kinds of item lying outside.
    const looseTypes = new Set<number>();
    let loose = 0;
    for (let i = 0; i < w.size; i++) {
      if (w.itemType[i] !== NONE && !sim.isStockpile(i)) {
        looseTypes.add(w.itemType[i]);
        loose++;
      }
    }
    let room = false;
    for (let i = 0; i < w.size && loose > 0 && !room; i++) {
      if (sim.isStockpile(i)) {
        for (const type of looseTypes) {
          if (w.canHoldItem(i, type) && sim.storesItem(i, type)) {
            room = true;
            break;
          }
        }
      }
    }
    if (!room && loose > 0 && anyStorage) {
      alerts.push({ text: `Stockpiles are full: ${loose} stacks lying outside. Zone more storage (Z).`, tone: 'warn' });
    }
    const ateRaw = sim.colonists.some((c) => c.thoughts.some((t) => t.key === 'ateRaw'));
    if (ateRaw && sim.countFeature((f) => featureDef(f).workbench === 'cooking') === 0) {
      alerts.push({ text: 'No stove: colonists are eating raw food', tone: 'warn' });
    }
    const idle = sim.living().filter((c) => {
      // Only working hours count: wandering during recreation time is expected.
      const slot = sim.slotOf(c);
      const isIdle =
        c.age >= TEEN &&
        (slot === 'A' || slot === 'W') &&
        raiders === 0 &&
        !needsBedRest(c) &&
        !c.drafted &&
        !c.health.downed &&
        !sim.inMentalBreak(c) &&
        (!c.job || c.job.type === 'wander');
      if (!isIdle) {
        this.idleSince.delete(c.id);
        return false;
      }
      const since = this.idleSince.get(c.id) ?? sim.tick;
      this.idleSince.set(c.id, since);
      return sim.tick - since > TICKS_PER_HOUR;
    });
    if (idle.length > 0) {
      const names = idle.map((c) => c.name).join(', ');
      // Work waiting that nobody is allowed to do is a likelier cause than a lack of work.
      const unstaffed = this.unstaffedWork();
      alerts.push({
        text:
          unstaffed.length > 0
            ? `Nothing to do: ${names}. Nobody is assigned to ${unstaffed.join(', ')} (Work screen).`
            : `Nothing to do: ${names}. Designate more work.`,
        tone: 'warn',
      });
    }
    return alerts;
  }

  // Kinds of work that are waiting but that no living colonist has enabled.
  private unstaffedWork(): string[] {
    const sim = this.sim;
    const w = sim.world;
    const staffed = (work: keyof Priorities) => sim.living().some((c) => c.priorities[work] > 0 && canWork(c, work));
    const waiting: [keyof Priorities, boolean][] = [
      // A mine shaft is never done, and only dug when there's nothing else: it doesn't count.
      [
        'mining',
        w.designation.some(
          (d, i) => d === Designation.MINE && !(w.feature[i] !== NONE && featureDef(w.feature[i]).shaft),
        ),
      ],
      ['plantCutting', w.designation.includes(Designation.CHOP) || w.designation.includes(Designation.FORAGE)],
      ['construction', w.blueprint.some((b) => b !== NONE) || w.designation.includes(Designation.DECONSTRUCT)],
      ['hunting', sim.animals.some((a) => a.hunted)],
      ['handling', sim.animals.some((a) => a.taming)],
    ];
    return waiting.filter(([work, has]) => has && !staffed(work)).map(([work]) => WORK_NAMES[work] ?? work);
  }

  private diplomacyView(): DiplomacyView {
    const sim = this.sim;
    const r = sim.diplomacy.request;
    const quarry = r?.kind === 'hunt' ? sim.animals.find((a) => a.id === r.quarry) : undefined;
    return {
      request: r
        ? {
            faction: FACTIONS[r.faction].name,
            kind: r.kind,
            text: describeRequest(r),
            have: r.kind === 'deliver' ? colonyStock(sim, r.item) : 0,
            count: r.count,
            hoursLeft: Math.max(0, Math.ceil((r.until - sim.tick) / TICKS_PER_HOUR)),
            quarryTile: quarry?.tile ?? null,
          }
        : null,
      silver: colonyStock(sim, itemId('silver')),
      tributeCost: tributeCost(sim),
      giftSizes: GIFT_SIZES,
    };
  }

  private villageView(): UiState['village'] {
    const sim = this.sim;
    const v = sim.village;
    const leader = sim.colonists[v.leader];
    return {
      leader:
        leader && !leader.health.dead ? { id: leader.id, name: leader.name, mood: Math.round(leader.mood) } : null,
      electedOn: v.electedOn,
      standings: [...tally(sim).entries()]
        .map(([id, votes]) => ({ name: sim.colonists[id].name, votes }))
        .sort((a, b) => b.votes - a.votes),
      rations: v.rations,
      hours: v.hours,
      restDays: v.restDays,
    };
  }

  // A colonist's family, as lines for the inspector.
  private familyOf(c: Colonist): string[] {
    const sim = this.sim;
    const name = (id: number) => sim.colonists[id]?.name ?? '?';
    const lines: string[] = [];
    if (c.parents.length > 0) {
      lines.push(`Child of ${c.parents.map(name).join(' and ')}`);
    }
    const children = sim.colonists.filter((o) => o.parents.includes(c.id)).map((o) => o.name);
    const babies = sim.infants.filter((i) => i.parents.includes(c.id)).map((i) => `baby ${i.name}`);
    if (children.length + babies.length > 0) {
      lines.push(`Parent of ${[...children, ...babies].join(', ')}`);
    }
    for (const i of sim.infants.filter((b) => b.carer === c.id && !b.parents.includes(c.id))) {
      lines.push(`Caring for baby ${i.name}`);
    }
    if (c.expectingUntil !== undefined && !c.health.dead) {
      const days = Math.max(1, Math.ceil((c.expectingUntil - sim.tick) / (TICKS_PER_HOUR * 24)));
      lines.push(`Expecting a child in about ${days} day${days > 1 ? 's' : ''}`);
    }
    return lines;
  }

  // How much of an item colonists can actually use: everything lying about, less what's forbidden.
  private availableStock(item: number): number {
    const w = this.sim.world;
    let n = 0;
    for (const i of w.tilesWith('items')) {
      if (w.itemType[i] === item && !w.forbidden[i]) {
        n += w.itemCount[i];
      }
    }
    return n;
  }

  private captivesView(): CaptiveView[] {
    const sim = this.sim;
    return sim.captives.map((p) => ({
      id: p.id,
      name: p.name,
      faction: FACTIONS[p.faction].name,
      state: p.state,
      capture: p.capture,
      hoursLeft:
        p.state === 'downed' ? Math.max(0, Math.ceil((p.since + DOWNED_TICKS - sim.tick) / TICKS_PER_HOUR)) : 0,
      food: p.food,
      talksLeft: Math.ceil(p.resistance / Math.max(0.3, Math.max(...sim.living().map(persuasion), 0.3))),
    }));
  }

  private describeTile(i: number): TileView {
    const sim = this.sim;
    const w = sim.world;
    const orders: string[] = [];
    const designationNames: Record<number, string> = {
      [Designation.MINE]: 'Marked for mining',
      [Designation.CHOP]: 'Marked for chopping',
      [Designation.FORAGE]: 'Marked for foraging',
      [Designation.DECONSTRUCT]: 'Marked for deconstruction',
    };
    if (w.designation[i] !== Designation.NONE) {
      orders.push(designationNames[w.designation[i]]);
    }
    if (w.blueprint[i] !== NONE) {
      const def = featureDef(w.blueprint[i]);
      const materials = def
        .build!.cost.map((c, line) => `${w.deliveredAt(i, line)}/${c.count} ${itemDef(c.item).name.toLowerCase()}`)
        .join(', ');
      orders.push(`Blueprint: ${def.name} (${materials})`);
    }
    const zone = w.zone[i];
    if (zone >= GROW_ZONE) {
      orders.push(`Growing zone: ${featureDef(zone - GROW_ZONE).name.toLowerCase()}`);
    } else if (zone !== 0) {
      const refused = STORAGE_GROUPS.filter((_, k) => refusedGroups(zone) & (1 << k));
      orders.push(
        `Stockpile · ${stockpilePriority(zone)} priority${refused.length > 0 ? ` · not for ${refused.join(', ')}` : ''}`,
      );
    }
    const f = w.feature[i];
    const art = sim.artworkAt(i);
    const feature = f !== NONE ? (art ? `“${art.title}”` : featureDef(f).name) : null;
    const details: string[] = [];
    if (w.locked[i]) {
      details.push('Locked: nobody gets through, though raiders can break it down');
    }
    if (f !== NONE && featureDef(f).shelf && w.itemType[i] !== NONE) {
      details.push(`Shelf: ${w.itemCount[i]}/${w.capacity(i, w.itemType[i])}`);
    }
    if (w.forbidden[i] && w.itemType[i] !== NONE) {
      details.push('Forbidden: colonists leave it alone (Allow to use it)');
    }
    if (w.filth[i] !== 0) {
      const mess = ['', 'Dirt', 'Blood', 'Rubble'][w.filthKind(i)];
      const amount = ['', 'a little', 'some', 'a lot'][w.filthAmount(i)];
      details.push(`${mess} on the ground (${amount})`);
    }
    const def = f !== NONE ? featureDef(f) : undefined;
    if (def?.workbench === 'cooking' && sim.messAround(i) > 0) {
      details.push('Mess nearby makes for worse, riskier meals: clean it up');
    }
    if (def?.bed && sim.messAround(i) > 0) {
      details.push('Mess nearby makes for worse tending of anyone laid up here');
    }
    if (def?.shaft) {
      // Read without creating one (the UI never changes the sim).
      const shaft = sim.shafts[i] ?? { depth: 0, cavern: false };
      const odds = oreChances(shaft);
      details.push(
        `${shaft.depth * METRES_PER_LEVEL} m deep${shaft.cavern ? ', into a cavern' : ''}: each dig brings up stone, iron ore ${Math.round(odds.iron * 100)}% of the time, silver ${Math.round(odds.silver * 100)}%`,
      );
      details.push(
        w.designation[i] === Designation.MINE
          ? 'Miners dig it deeper when they have nothing else to do (Cancel to stop them)'
          : w.designation[i] === Designation.DECONSTRUCT
            ? 'To be taken down'
            : 'Not being dug: drag Mine over it to start',
      );
      if (shaft.depth >= breachFrom(shaft) && sim.story.difficulty !== 'peaceful') {
        details.push('Deep enough that something below may break through');
      }
    }
    if (art && def) {
      details.push(`${qualityLabel(art.quality)} ${def.name.toLowerCase()} by ${art.artist}, day ${art.day}`);
    }
    if (def?.key === 'grave') {
      const lies = sim.graveAt(i);
      details.push(
        lies ? `Here lies ${lies.name}, died of ${lies.cause} on day ${lies.day}` : 'Empty: ready for a burial',
      );
    }
    if (art?.honors && art.honors.length > 0) {
      details.push(`Remembers ${art.honors.map((id) => sim.colonists[id]?.name ?? '?').join(', ')}`);
    }
    if (def?.flowers && sim.season === 'Winter') {
      details.push('Out of bloom until spring');
    }
    if (def?.burns) {
      const hours = Math.max(1, Math.round((w.fuel[i] / def.burns.perDay) * 24));
      details.push(
        def.workbench
          ? w.fuel[i] > 0
            ? `Wood ${Math.ceil(w.fuel[i])}/${def.burns.capacity}, about ${hours}h of work (it burns only while worked)`
            : 'Out of wood: no work here until haulers bring more'
          : w.fuel[i] > 0
            ? `Wood ${Math.ceil(w.fuel[i])}/${def.burns.capacity}, about ${hours}h left`
            : 'Out of wood: cold and dark until haulers bring more',
      );
    }
    if (def?.power) {
      const running = sim.power.powered;
      if (def.power.fuel) {
        details.push(
          `Fuel ${Math.floor(w.fuel[i])}/${def.power.fuel.capacity} ${itemDef(def.power.fuel.item).name.toLowerCase()}`,
        );
        details.push(
          w.fuel[i] <= 0
            ? 'Out of fuel'
            : sim.power.idle
              ? 'Idle, saving fuel: nothing needs the power'
              : `Producing ${def.power.output} W`,
        );
      } else if (def.power.solar) {
        details.push(`Producing up to ${def.power.output} W in daylight`);
      }
      if (def.power.storage) {
        details.push(`Grid storage ${Math.round(sim.power.stored)}/${sim.power.capacity} Wh`);
      }
      if (def.power.draw) {
        details.push(running ? `Running (${def.power.draw} W)` : 'No power: not running');
      }
    }
    if (def?.icebox) {
      details.push(sim.power.powered ? 'Keeping food fresh' : 'Unpowered: food will spoil');
    }
    if (def?.cooler) {
      details.push(`Cools its room towards ${def.cooler.target}°C`);
    }
    if (def && def.heater > 0) {
      details.push(def.power?.draw && !sim.power.powered ? 'Unpowered' : 'Heats its room towards 21°C');
    }
    if (def?.fishing) {
      details.push(
        w.neighbors(i).some((n) => w.isFishable(n))
          ? 'Hunters fish here when food runs short, and all winter'
          : 'The water is frozen',
      );
    }
    if (def?.growLight) {
      details.push(`Grow light, ${def.growLight * 2 + 1}×${def.growLight * 2 + 1} tiles`);
    }
    if (def?.crop) {
      details.push(w.growth[i] >= 1 ? 'Ready to harvest' : `${Math.floor(w.growth[i] * 100)}% grown`);
    }
    if (w.fire[i] > 0) {
      details.push('On fire!');
    }
    for (const p of sim.captives) {
      if (p.tile === i) {
        details.push(
          p.state === 'downed'
            ? `${p.name}, raider, lying wounded${p.capture ? ' · marked for capture' : ' · drag Capture over them to take them prisoner'}`
            : `Prisoner ${p.name}: ${p.resistance > 0 ? 'resisting' : 'ready to be won over'}, ${Math.round(p.food * 100)}% fed`,
        );
      }
    }
    for (const e of sim.enemies) {
      if (e.tile === i && e.hp > 0) {
        const kit = [
          weaponDef(e.weapon).name.toLowerCase(),
          e.armorItem !== undefined ? itemDef(e.armorItem).name.toLowerCase() : null,
        ]
          .filter(Boolean)
          .join(', ');
        const state = [
          e.hp < 1 ? `hurt ${Math.round((1 - e.hp) * 100)}%` : null,
          e.suppression > 0.5 ? 'pinned down' : null,
          e.fleeing ? 'fleeing' : null,
        ]
          .filter(Boolean)
          .join(', ');
        details.push(`Raider ${e.name}: ${kit}${state ? ` · ${state}` : ''}`);
      }
    }
    if (w.floor[i] !== NONE) {
      details.push(`Floor: ${featureDef(w.floor[i]).name.toLowerCase()}`);
    }
    if (w.roof[i] !== NONE) {
      details.push('Roofed');
    }
    const item = w.itemType[i];
    if (item !== NONE && (itemDef(item).apparel || itemDef(item).tool)) {
      details.push(`${qualityLabel(w.quality[i])}, ${Math.round(w.fresh[i] * 100)}% condition`);
    } else if (item !== NONE && itemDef(item).category === 'meal') {
      details.push(`Cooked with ${qualityLabel(w.quality[i]).toLowerCase()} skill`);
    }
    if (item !== NONE && itemDef(item).shelfLife !== undefined) {
      const frozen = sim.temperatureAt(i) <= 0 || (sim.isIcebox(i) && sim.power.powered);
      details.push(
        frozen ? `Fresh for ${w.fresh[i].toFixed(1)} days (not spoiling)` : `Fresh for ${w.fresh[i].toFixed(1)} days`,
      );
    }
    const room = sim.roomAt(i);
    const beast = sim.animals.find((a) => a.tile === i);
    const animal = beast
      ? `${beast.tame ? 'Tame ' + animalName(beast).toLowerCase() : animalName(beast)}${beast.taming ? ' · to be tamed' : ''}${beast.hunted ? ' · marked for hunting' : ''}${beast.revengeOn >= 0 ? ' · enraged' : ''}${beast.leaving && !beast.hunted && !beast.taming ? ' · moving on' : ''}`
      : null;
    return {
      x: w.xOf(i),
      y: w.yOf(i),
      terrain: terrainDef(w.terrain[i]).name,
      feature,
      items: w.itemType[i] !== NONE ? `${w.itemCount[i]} × ${itemDef(w.itemType[i]).name}` : null,
      orders,
      temperature: Math.round(sim.temperatureAt(i)),
      animal,
      details,
      door: def?.door ? { tile: i, locked: w.locked[i] === 1 } : null,
      stockpile: isStockpileZone(w.zone[i])
        ? { tile: i, refused: refusedGroups(w.zone[i]), priority: stockpilePriority(w.zone[i]) }
        : null,
      room:
        room && room.enclosed
          ? `${room.role} · ${impressivenessLabel(room.impressiveness)} (${room.impressiveness}) · ${room.size} tiles`
          : null,
    };
  }
}

export const controller = new GameController();
