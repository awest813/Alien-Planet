import { SIGNAL_RAID_WEIGHT, transmitting } from './beacon';
import { herdArrives, herdsWary, manhuntersArrive, wildCap, wildCount } from './animals';
import { maybeSendAllies, spawnRaid, weaponScore } from './combat';
import { TICKS_PER_HOUR, populationFor } from './constants';
import { ANIMALS, FACTIONS, NONE, featureDef, isFood, itemDef, itemId, terrainDef } from './defs';
import { damage, infect } from './health';
import { caravanArrives, caravanWeight, goodwillOf } from './trade';
import { atPeace, onGoodTerms, pickRaider, raidPressure } from './diplomacy';
import { breach, breachWeight } from './depths';
import { BeastState, beastWakes, beastWeight } from './beast';
import { ignite } from './weather';
import { Season } from './seasons';
import { DRAFT_AGE } from './lifespans';
import { inspire, obsessionPossible, startObsession } from './minds';
import type { Simulation } from './simulation';

export type Difficulty = 'peaceful' | 'standard' | 'harsh';

export const DIFFICULTIES: { key: Difficulty; label: string; description: string }[] = [
  { key: 'peaceful', label: 'Peaceful', description: 'No raids. Illness and hardship still happen, more gently.' },
  { key: 'standard', label: 'Standard', description: 'Raids grow over time. A well-defended colony usually holds.' },
  { key: 'harsh', label: 'Harsh', description: 'Bigger, harder-hitting, more frequent raids. Expect losses.' },
];

export interface StoryState {
  lastEventTick: number;
  // Tick before which each event may not fire again.
  cooldowns: Record<string, number>;
  coldSnapUntil: number;
  // A manhunter pack is on the loose (colonists stand down once it's dealt with).
  manhuntersActive?: boolean;
  // ...and it's the great beast alone (whose leaving or death says enough).
  beastHunt?: boolean;
  // Ticks of the colony's recent kills in the hunt, and until when the herds are wary of the valley.
  recentHunts?: number[];
  waryUntil?: number;
  // The great beast of the hills, once it has woken.
  beast?: BeastState;
  // When the last "has collapsed" notification went out (they come in bursts; one card is enough).
  lastCollapseCard?: number;
  // Ticks when a heat wave, an eclipse and an aurora end (0 or past: none on).
  heatWaveUntil?: number;
  eclipseUntil?: number;
  auroraUntil?: number;
  // No new threat before this tick: a breather after the last one.
  nextThreatTick?: number;
  // The colony keeps the seasonal festivals (on unless the player turns them off).
  festivals?: boolean;
  difficulty: Difficulty;
}

export const freshStory = (difficulty: Difficulty = 'standard'): StoryState => ({
  lastEventTick: 0,
  cooldowns: {},
  coldSnapUntil: 0,
  heatWaveUntil: 0,
  eclipseUntil: 0,
  auroraUntil: 0,
  difficulty,
});

// Whether a timed event is on right now (an end tick of 0 means it never started).
const until = (sim: Simulation, end: number | undefined) => !!end && sim.tick < end;
export const coldSnapOn = (sim: Simulation): boolean => until(sim, sim.story.coldSnapUntil);
export const heatWaveOn = (sim: Simulation): boolean => until(sim, sim.story.heatWaveUntil);
export const eclipseOn = (sim: Simulation): boolean => until(sim, sim.story.eclipseUntil);
export const auroraOn = (sim: Simulation): boolean => until(sim, sim.story.auroraUntil);

// How strongly each difficulty leans on threats (raids, illness, cold, blight).
const THREAT_WEIGHT: Record<Difficulty, number> = { peaceful: 0.5, standard: 1, harsh: 1.4 };
// The largest pack of maddened wolves.
const MAX_WOLF_PACK = 4;
// The breather after any threat before the next one, in days.
const THREAT_GAP_DAYS: Record<Difficulty, number> = { peaceful: 1.5, standard: 1, harsh: 0.5 };

// The gap before the next threat, counted from the end of whatever is still going on (a cold snap,
// heat wave or eclipse runs on after it starts; a raid until it's over).
function breather(sim: Simulation): void {
  const story = sim.story;
  const ends = Math.max(sim.tick, story.coldSnapUntil ?? 0, story.heatWaveUntil ?? 0, story.eclipseUntil ?? 0);
  const gap = THREAT_GAP_DAYS[story.difficulty ?? 'standard'] * DAY;
  story.nextThreatTick = Math.max(story.nextThreatTick ?? 0, ends + gap);
}

// Whether the colony is in a state to face a new threat: not while a maddened pack is still loose,
// and not while half or more of the colonists are down. A beaten colony gets the chance to recover.
export function readyForThreat(sim: Simulation): boolean {
  const living = sim.living();
  const down = living.filter((c) => c.health.downed).length;
  return !sim.story.manhuntersActive && down * 2 < living.length && sim.tick >= (sim.story.nextThreatTick ?? 0);
}

// Days of food in the colony at the current headcount (as the top bar counts it).
const DAILY_NUTRITION = 1.4;
export function foodDays(sim: Simulation): number {
  const nutrition = sim.resourceTotals().reduce((sum, t) => sum + itemDef(t.item).nutrition * t.total, 0);
  return nutrition / (Math.max(1, sim.living().length) * DAILY_NUTRITION);
}

interface EventDef {
  key: string;
  minDay: number;
  cooldownDays: number;
  // Threats come more often on harsh and less on peaceful.
  threat?: boolean;
  weight: (sim: Simulation) => number;
  run: (sim: Simulation) => boolean;
}

const DAY = TICKS_PER_HOUR * 24;
// Minimum gap between any two events, and the hourly chance of one once that has passed.
const EVENT_GAP = TICKS_PER_HOUR * 10;
const HOURLY_CHANCE = 1 / 14;
// Raids and packs are sized for a colony of six: in proportion for a smaller one, and more, though
// not proportionally more, for a bigger one.
// Threats scale with those who can fight back (children don't count).
const threatScale = (sim: Simulation) => {
  const living = sim.living().filter((c) => c.age >= DRAFT_AGE).length;
  return living <= 6 ? Math.max(living, 2) / 6 : Math.sqrt(living / 6);
};

// Newcomers stop asking to join once the colony fills its valley.
// (Colonists away on an expedition keep their place.)
const roomToGrow = (sim: Simulation) => sim.headcount() < populationFor(sim.world.width).maxColonists;

const hostileFactions = () => FACTIONS.filter((f) => f.hostile);
// Raiders who haven't been paid to stay away.
const raiders = (sim: Simulation) => hostileFactions().filter((f) => !atPeace(sim, f.id));
// Each raider faction's share of the raids, more from the warier (see raidPressure); one per faction at the start.
const raidShare = (sim: Simulation) =>
  raiders(sim).reduce((sum, f) => sum + raidPressure(sim, f.id), 0) / hostileFactions().length;
const animalLabel = (kind: string) => ANIMALS[kind].plural;
const friendlyFaction = () => FACTIONS.find((f) => !f.hostile)!;

// Food vermin can get at: in stockpiles on the floor (not on a shelf or in an icebox), and not frozen.
function verminCanReach(sim: Simulation): { tiles: number[]; total: number } {
  const w = sim.world;
  const tiles: number[] = [];
  let total = 0;
  for (const i of w.tilesWith('items')) {
    const item = w.itemType[i];
    if (!isFood(item) || !sim.isStockpile(i)) {
      continue;
    }
    const f = w.feature[i];
    if ((f !== NONE && (featureDef(f).shelf || featureDef(f).icebox)) || sim.temperatureAt(i) < 0) {
      continue;
    }
    tiles.push(i);
    total += w.itemCount[i];
  }
  return { tiles, total };
}

// How many raiders come: two on day 4 and one more every three days, plus extra for a well-armed colony. The
// cap is seven at first (nine on harsh), rising by one every eight days after day 19; then all of it scaled
// to the colony's size.
function raidSize(sim: Simulation): number {
  const harsh = sim.story.difficulty === 'harsh' ? 2 : 0;
  const armed = sim
    .living()
    .filter((c) => weaponScore(c.weapon, c.weaponQuality) >= weaponScore('recurveBow', 4)).length;
  // A rich colony draws bigger raids: one more raider for every 7,500 silver of goods beyond the first
  // 15,000, up to four more (and the cap rises with it).
  const rich = Math.max(0, Math.min(4, Math.floor((colonyWealth(sim) - 15000) / 7500)));
  const cap = Math.min(9 + harsh, 7 + harsh + Math.max(0, Math.floor((sim.day - 19) / 8))) + rich;
  const size = 2 + harsh + Math.floor((sim.day - 4) / 3) + Math.floor(armed / 3) + rich;
  const scaled = Math.max(2, Math.round(Math.min(cap, size) * threatScale(sim)));
  // Never more than a fair fight against those who can fight back today: about a third more (eight against
  // six). (Eleven against six won nearly every harsh raid, cover or not.)
  const fighters = sim.living().filter((c) => c.age >= DRAFT_AGE && !c.health.downed).length;
  // (Riches are worth a little more risk: half the extra raiders a rich colony draws come on top.)
  const fair = Math.round(Math.max(2, fighters) * (harsh ? RAID_ODDS_HARSH : RAID_ODDS)) + Math.floor(rich / 2);
  return Math.max(2, Math.min(scaled, fair));
}
const RAID_ODDS = 1.3;
const RAID_ODDS_HARSH = 1.35;

// A raid, or a siege: raiders from one of the hostile factions (not those paid off), and now and then friends
// come to help.
function attack(sim: Simulation, siege: boolean): boolean {
  const factions = raiders(sim);
  if (factions.length === 0) {
    return false;
  }
  // The warier the faction the likelier it comes, and with a few more.
  const faction = pickRaider(sim, factions);
  if (!spawnRaid(sim, faction, Math.max(2, Math.round(raidSize(sim) * raidPressure(sim, faction))), siege)) {
    return false;
  }
  maybeSendAllies(sim);
  return true;
}

const EVENTS: EventDef[] = [
  {
    key: 'raid',
    minDay: 4,
    cooldownDays: 3,
    threat: true,
    // Raiders home in on a transmitting beacon.
    weight: (sim) =>
      sim.story.difficulty === 'peaceful' || raiders(sim).length === 0
        ? 0
        : // Each faction bought off is a share of the raids that don't come.
          3 * raidShare(sim) * (transmitting(sim) ? SIGNAL_RAID_WEIGHT : 1),
    run: (sim) => attack(sim, false),
  },
  {
    // From the second year, now and then the raiders come to stay a while: they camp, dig in, and attack
    // when they're ready.
    key: 'siege',
    minDay: 40,
    cooldownDays: 12,
    threat: true,
    weight: (sim) => (sim.story.difficulty === 'peaceful' || raiders(sim).length === 0 ? 0 : 0.5 * raidShare(sim)),
    run: (sim) => attack(sim, true),
  },
  {
    // A rich colony draws thieves: a few quick hands after the stores, not a fight. More likely the more
    // there is to take.
    key: 'thieves',
    minDay: 15,
    cooldownDays: 8,
    threat: true,
    weight: (sim) =>
      sim.story.difficulty === 'peaceful' || raiders(sim).length === 0
        ? 0
        : 0.8 * Math.min(1.5, colonyWealth(sim) / 20000) * (raiders(sim).length / hostileFactions().length),
    run: (sim) => {
      const factions = raiders(sim);
      const count = 2 + (colonyWealth(sim) > 30000 ? 1 : 0) + (sim.story.difficulty === 'harsh' ? 1 : 0);
      return factions.length > 0 && spawnRaid(sim, sim.rng.pick(factions).id, count, false, true);
    },
  },
  {
    // Vermin get into food left on the floor: worst in winter, when they come in from the cold. Food on shelves
    // or in iceboxes, or kept below freezing, is safe.
    key: 'vermin',
    minDay: 20,
    cooldownDays: 12,
    threat: true,
    weight: (sim) => (verminCanReach(sim).total < 30 ? 0 : sim.season === 'Winter' ? 0.7 : 0.15),
    run: (sim) => {
      const { tiles } = verminCanReach(sim);
      const w = sim.world;
      const share = 0.25 + sim.rng.next() * 0.15;
      let lost = 0;
      for (const i of tiles) {
        lost += w.takeItem(i, Math.floor(w.itemCount[i] * share));
      }
      if (lost === 0) {
        return false;
      }
      sim.stats.verminLost = (sim.stats.verminLost ?? 0) + lost;
      sim.addLog(
        `Vermin got into the stores: ${lost} food spoiled. Food on shelves or in iceboxes, or kept below freezing, is safe.`,
        'warn',
        true,
      );
      return true;
    },
  },
  {
    // Once a year from the second, the great beast of the hills comes down.
    key: 'greatBeast',
    minDay: 36,
    cooldownDays: 10,
    threat: true,
    weight: (sim) => beastWeight(sim),
    run: (sim) => beastWakes(sim),
  },
  {
    // A catching cough in the cold months: one falls ill, and it spreads to whoever is close.
    key: 'winterCough',
    minDay: 20,
    cooldownDays: 12,
    threat: true,
    weight: (sim) => (sim.season === 'Winter' ? 1.2 : sim.season === 'Autumn' ? 0.3 : 0),
    run: (sim) => {
      const healthy = sim.living().filter((c) => !c.health.disease);
      if (healthy.length < 2) {
        return false;
      }
      const first = sim.rng.pick(healthy);
      infect(sim, first, 'winterCough');
      sim.addLog(
        `${first.name} has come down with a winter cough. It's catching: keep the sick in bed, and apart if you can.`,
        'warn',
        true,
      );
      return true;
    },
  },
  {
    // From the second winter, a stronger flu: one falls ill, and it spreads like the cough.
    key: 'greyFlu',
    minDay: 40,
    cooldownDays: 16,
    threat: true,
    weight: (sim) => (sim.season === 'Winter' ? 0.6 : 0),
    run: (sim) => {
      const healthy = sim.living().filter((c) => !c.health.disease);
      if (healthy.length < 2) {
        return false;
      }
      const first = sim.rng.pick(healthy);
      infect(sim, first, 'greyFlu');
      sim.addLog(
        `${first.name} has the grey flu. It's catching and can kill: keep the sick in bed, apart, and tended.`,
        'danger',
        true,
      );
      return true;
    },
  },
  {
    // Rarely, someone brings the shaking sickness back from the edge of the valley. It passes only by touch, so
    // whoever nurses the sick is most at risk.
    key: 'shakingSickness',
    minDay: 50,
    cooldownDays: 30,
    threat: true,
    weight: (sim) => (sim.living().length >= 4 ? 0.2 : 0),
    run: (sim) => {
      const healthy = sim.living().filter((c) => !c.health.disease);
      if (healthy.length < 2) {
        return false;
      }
      const first = sim.rng.pick(healthy);
      infect(sim, first, 'shakingSickness');
      sim.addLog(
        `${first.name} has the shaking sickness, caught from travellers. It passes by touch and kills without a doctor: tend them, and keep everyone else away.`,
        'danger',
        true,
      );
      return true;
    },
  },
  {
    key: 'disease',
    minDay: 3,
    cooldownDays: 5,
    threat: true,
    weight: () => 1.5,
    run: (sim) => {
      const healthy = sim.living().filter((c) => !c.health.disease);
      if (healthy.length === 0) {
        return false;
      }
      const victims = [sim.rng.pick(healthy)];
      const second = healthy.filter((c) => c !== victims[0]);
      if (second.length > 0 && sim.rng.next() < 0.5) {
        victims.push(sim.rng.pick(second));
      }
      for (const c of victims) {
        infect(sim, c, 'marshFever');
      }
      sim.addLog(
        `${victims.map((c) => c.name).join(' and ')} came down with marsh fever. Bed rest and a doctor will help.`,
        'warn',
        true,
      );
      return true;
    },
  },
  {
    key: 'wanderer',
    minDay: 2,
    cooldownDays: 6,
    weight: (sim) => (roomToGrow(sim) ? 1 : 0),
    run: (sim) => {
      const c = roomToGrow(sim) ? sim.addWanderer() : undefined;
      if (!c) {
        return false;
      }
      sim.addLog(`${c.name}, a traveller from ${friendlyFaction().name}, has asked to join the colony.`, 'good', true);
      for (const other of sim.living()) {
        if (other !== c) {
          sim.addThought(other, 'welcomedNewcomer');
        }
      }
      return true;
    },
  },
  {
    key: 'herd',
    minDay: 2,
    cooldownDays: 4,
    weight: (sim) => (wildCount(sim) < wildCap(sim) - 3 ? (herdsWary(sim) ? 0.5 : 1) : 0),
    run: (sim) => {
      const count = herdArrives(sim);
      if (count === 0) {
        return false;
      }
      const kind = sim.animals[sim.animals.length - 1].kind;
      // Predators are news, not good news.
      if (ANIMALS[kind].preys) {
        sim.addLog(
          `A pack of ${count} ${animalLabel(kind)} has come into the valley to hunt. They leave people alone unless provoked.`,
          'warn',
          true,
        );
      } else {
        const arrivals =
          count === 1 ? `A ${ANIMALS[kind].name.toLowerCase()} has` : `A group of ${count} ${animalLabel(kind)} has`;
        sim.addLog(`${arrivals} wandered onto the map.`, 'good', true);
      }
      return true;
    },
  },
  {
    key: 'coldSnap',
    minDay: 3,
    cooldownDays: 6,
    threat: true,
    weight: (sim) => (heatWaveOn(sim) ? 0 : 1),
    run: (sim) => {
      sim.story.coldSnapUntil = sim.tick + 2 * DAY;
      sim.addLog('A cold snap has rolled in. Expect freezing nights for the next two days.', 'warn', true);
      return true;
    },
  },
  {
    // Friendly traders come by more often the better the colony gets on with them.
    key: 'caravan',
    minDay: 3,
    cooldownDays: 5,
    // Word of a rich colony gets about: traders come more often to one with more to buy and sell.
    weight: (sim) => {
      const keen = caravanWeight(sim);
      return keen > 0 ? keen + Math.min(0.6, colonyWealth(sim) / 50000) : 0;
    },
    run: (sim) => caravanArrives(sim),
  },
  {
    key: 'supplies',
    minDay: 2,
    cooldownDays: 3,
    // More often the better they think of the colony; never when they're wary of it.
    weight: (sim) => (onGoodTerms(sim, friendlyFaction().id) ? 0.9 + goodwillOf(sim, friendlyFaction().id) / 100 : 0),
    run: (sim) => {
      const home = sim.homeTile();
      if (home === undefined) {
        return false;
      }
      // The Meadow Kin send what the colony looks short of: food when the stores run low, medicine
      // when someone is hurt or sick, wood when the pile is nearly gone; otherwise any of them.
      const hurt = sim.living().some((c) => c.health.injuries.length > 0 || c.health.disease);
      const options: [string, number, number][] = [
        ['meal', 10, foodDays(sim) < 3 ? 4 : 1],
        ['herbalMedicine', 6, hurt && sim.stockOf(itemId('herbalMedicine')) < 4 ? 3 : 1],
        ['wood', 60, sim.stockOf(itemId('wood')) < 40 ? 3 : 1],
        ['cloth', 20, 1],
      ];
      let roll = sim.rng.next() * options.reduce((sum, [, , weight]) => sum + weight, 0);
      const [key, count] = options.find(([, , weight]) => (roll -= weight) <= 0) ?? options[0];
      sim.world.dropItemNear(home, itemId(key), count);
      sim.addLog(`${friendlyFaction().name} left a gift of supplies near the colony.`, 'good', true);
      return true;
    },
  },
  {
    key: 'blight',
    minDay: 5,
    cooldownDays: 8,
    threat: true,
    weight: (sim) => (sim.countFeature((f) => !!featureDef(f).crop) > 8 ? 0.6 : 0),
    run: (sim) => {
      const w = sim.world;
      const exposed = (i: number) => w.feature[i] !== NONE && !!featureDef(w.feature[i]).crop && !sim.isRoofed(i);
      const crops = [...w.tilesWith('features')].filter(exposed);
      if (crops.length === 0) {
        return false;
      }
      // Spreads through one field: the crops joined to where it starts.
      const start = sim.rng.pick(crops);
      const field = new Set([start]);
      const queue = [start];
      while (queue.length > 0) {
        for (const n of w.neighbors(queue.pop()!, false)) {
          if (!field.has(n) && exposed(n)) {
            field.add(n);
            queue.push(n);
          }
        }
      }
      let lost = 0;
      for (const i of field) {
        if (sim.rng.next() < 0.6) {
          w.setFeature(i, NONE);
          lost++;
        }
      }
      if (lost === 0) {
        return false;
      }
      sim.addLog(`Blight has struck a field. ${lost} plants withered.`, 'warn', true);
      return true;
    },
  },
  {
    // Two days of blistering heat: heatstroke for anyone working outside for long.
    key: 'heatWave',
    minDay: 5,
    cooldownDays: 8,
    threat: true,
    weight: (sim) => (heatWaveOn(sim) || coldSnapOn(sim) ? 0 : 1),
    run: (sim) => {
      sim.story.heatWaveUntil = sim.tick + 2 * DAY;
      sim.addLog('A heat wave has settled over the valley. Keep colonists cool indoors.', 'warn', true);
      return true;
    },
  },
  {
    // The sun goes dark for a few hours: solar panels stop and the air cools.
    key: 'eclipse',
    minDay: 6,
    cooldownDays: 12,
    threat: true,
    weight: (sim) => (sim.hour >= 8 && sim.hour < 13 ? 0.5 : 0),
    run: (sim) => {
      sim.story.eclipseUntil = sim.tick + TICKS_PER_HOUR * 4;
      sim.addLog('An eclipse darkens the sky. Solar panels will be dark for a few hours.', 'warn', true);
      return true;
    },
  },
  {
    // A pack of animals gone mad comes for the colonists, one after another.
    key: 'manhunters',
    minDay: 6,
    cooldownDays: 7,
    threat: true,
    weight: (sim) => (sim.story.difficulty === 'peaceful' ? 0 : 0.7),
    run: (sim) => {
      // Boars by day; wolves are more likely after dark.
      const kind = sim.rng.next() < (sim.isNight() ? 0.7 : 0.35) ? 'wolf' : 'boar';
      // Two at first, one more every twelve days (and one more on harsh), never more than five boars.
      // Wolves bite deep and come in fast, so a pack of them stops at four, whatever the colony's size.
      const cap = kind === 'wolf' ? MAX_WOLF_PACK : 5;
      const base = Math.min(cap, 2 + Math.floor(sim.day / 12) + (sim.story.difficulty === 'harsh' ? 1 : 0));
      const count = Math.min(
        kind === 'wolf' ? MAX_WOLF_PACK : Infinity,
        Math.max(2, Math.round(base * threatScale(sim))),
      );
      const arrived = manhuntersArrive(sim, kind, count);
      if (arrived === 0) {
        return false;
      }
      sim.addLog(
        `A pack of ${arrived} maddened ${ANIMALS[kind].plural} is charging the colony! Draft colonists and fight them off.`,
        'danger',
        true,
      );
      sim.events.push('manhunters');
      sim.story.manhuntersActive = true;
      sim.story.beastHunt = false;
      return true;
    },
  },
  {
    // Dig too deep and something digs back: cave crawlers come up through the deepest mine shaft.
    key: 'breach',
    minDay: 6,
    cooldownDays: 8,
    threat: true,
    weight: (sim) => (sim.story.difficulty === 'peaceful' ? 0 : breachWeight(sim)),
    run: (sim) => {
      const count = Math.max(
        2,
        Math.round((2 + Math.floor(sim.day / 15) + (sim.story.difficulty === 'harsh' ? 1 : 0)) * threatScale(sim)),
      );
      if (!breach(sim, count)) {
        return false;
      }
      sim.events.push('manhunters');
      sim.story.manhuntersActive = true;
      sim.story.beastHunt = false;
      return true;
    },
  },
  {
    // A shooting star that didn't burn up: silver and stone for whoever hauls it in, and maybe a fire.
    key: 'meteorite',
    minDay: 3,
    cooldownDays: 10,
    weight: () => 0.4,
    run: (sim) => {
      const w = sim.world;
      const home = sim.homeTile();
      if (home === undefined) {
        return false;
      }
      // Open dry ground 10–20 tiles out, with nothing built right next to it.
      const clear = (i: number) =>
        terrainDef(w.terrain[i]).buildable &&
        w.isPassable(i) &&
        !sim.isRoofed(i) &&
        [i, ...w.neighbors(i)].every((n) => w.feature[n] === NONE || featureDef(w.feature[n]).natural);
      const candidates: number[] = [];
      for (let k = 0; k < 60 && candidates.length < 12; k++) {
        const angle = sim.rng.next() * Math.PI * 2;
        const r = 10 + sim.rng.next() * 10;
        const x = Math.round(w.xOf(home) + Math.cos(angle) * r);
        const y = Math.round(w.yOf(home) + Math.sin(angle) * r);
        if (w.inBounds(x, y) && clear(w.idx(x, y))) {
          candidates.push(w.idx(x, y));
        }
      }
      if (candidates.length === 0) {
        return false;
      }
      const impact = sim.rng.pick(candidates);
      w.dropItemNear(impact, itemId('silver'), sim.rng.int(40, 90));
      w.dropItemNear(impact, itemId('stone'), sim.rng.int(15, 30));
      // The impact sets anything flammable around it alight.
      let burning = false;
      for (const n of [impact, ...w.neighbors(impact)]) {
        burning = ignite(sim, n) || burning;
      }
      sim.addLog(
        `A meteorite crashed near the colony${burning ? ' and started a fire' : ''}. Silver and stone lie scattered around the crater.`,
        burning ? 'warn' : 'good',
        true,
      );
      if (burning) {
        sim.events.push('fire');
      }
      return true;
    },
  },
  {
    // Someone hurt, fleeing trouble elsewhere, asks for help and a place to stay.
    key: 'refugee',
    minDay: 4,
    cooldownDays: 8,
    weight: (sim) => (roomToGrow(sim) ? 0.6 : 0),
    run: (sim) => {
      const c = roomToGrow(sim) ? sim.addWanderer() : undefined;
      if (!c) {
        return false;
      }
      for (let k = 0; k < 2 + sim.rng.int(0, 1); k++) {
        damage(sim, c, 0.08 + sim.rng.next() * 0.08, sim.rng.next() < 0.5 ? 'cut' : 'arrow');
      }
      sim.addLog(
        `${c.name}, wounded and fleeing raiders, has staggered into the colony and asked to stay. They need a doctor.`,
        'warn',
        true,
      );
      for (const other of sim.living()) {
        if (other !== c) {
          sim.addThought(other, 'welcomedNewcomer');
        }
      }
      return true;
    },
  },
  {
    // Lights in the night sky: everyone's spirits lift.
    key: 'aurora',
    minDay: 2,
    cooldownDays: 9,
    weight: (sim) => (sim.isNight() && !sim.weatherIsOvercast() ? 1 : 0),
    run: (sim) => {
      sim.story.auroraUntil = sim.tick + TICKS_PER_HOUR * 5;
      for (const c of sim.living()) {
        if (!c.sleeping) {
          sim.addThought(c, 'sawAurora');
        }
      }
      sim.addLog('An aurora lights up the night sky. Everyone awake stops to watch.', 'good', true);
      return true;
    },
  },
  {
    // A colonist wakes up full of ideas and works 40% faster for a day.
    key: 'inspiration',
    minDay: 2,
    cooldownDays: 4,
    weight: () => 0.8,
    run: (sim) => inspire(sim),
  },
  {
    // Rarely, a skilled artist is seized by a vision of a legendary work, and needs materials for it.
    key: 'obsession',
    minDay: 14,
    cooldownDays: 40,
    weight: (sim) => (obsessionPossible(sim) ? 0.06 : 0),
    run: (sim) => startObsession(sim),
  },
  {
    // Perfect growing weather: every field shoots up.
    key: 'bumperCrop',
    minDay: 4,
    cooldownDays: 8,
    weight: (sim) => (sim.countFeature((f) => !!featureDef(f).crop) > 8 ? 0.6 : 0),
    run: (sim) => {
      const w = sim.world;
      let grown = 0;
      for (const i of w.tilesWith('features')) {
        if (w.feature[i] !== NONE && featureDef(w.feature[i]).crop && w.growth[i] < 1) {
          w.growth[i] = Math.min(1, w.growth[i] + 0.35);
          w.markDirty(i);
          grown++;
        }
      }
      if (grown === 0) {
        return false;
      }
      sim.addLog(`Perfect growing weather: ${grown} plants shot up overnight.`, 'good', true);
      return true;
    },
  },
];

// Seasonal leanings: cold snaps in the cold months, heat in summer, no herds or blight in winter,
// more illness, auroras on long nights, bumper crops in the growing season.
const SEASON_WEIGHT: Record<string, Partial<Record<Season, number>>> = {
  coldSnap: { Spring: 0.3, Summer: 0, Autumn: 1.2, Winter: 1.5 },
  heatWave: { Spring: 0.3, Summer: 1.6, Autumn: 0.3, Winter: 0 },
  herd: { Winter: 0, Spring: 1.3 },
  blight: { Winter: 0, Spring: 0.5 },
  disease: { Autumn: 1.3, Winter: 1.3 },
  aurora: { Spring: 0.5, Summer: 0.3, Autumn: 1.2, Winter: 1.6 },
  bumperCrop: { Autumn: 0.5, Winter: 0 },
  manhunters: { Winter: 1.3 },
};

function weightOf(sim: Simulation, event: EventDef): number {
  const seasonal = SEASON_WEIGHT[event.key]?.[sim.season] ?? 1;
  return event.weight(sim) * seasonal * (event.threat ? THREAT_WEIGHT[sim.story.difficulty ?? 'standard'] : 1);
}

// Called every tick; at most rolls once per in-game hour.
export function updateStoryteller(sim: Simulation): void {
  const story = sim.story;
  if (sim.tick % TICKS_PER_HOUR !== 0 || sim.tick - story.lastEventTick < EVENT_GAP) {
    return;
  }
  const chance = HOURLY_CHANCE * (story.difficulty === 'harsh' ? 1.3 : 1);
  // A raid still going keeps pushing the breather back, so it counts from the raid's end.
  if (sim.raid) {
    breather(sim);
  }
  if (sim.living().length === 0 || sim.raid || sim.rng.next() >= chance) {
    return;
  }
  const threatsWelcome = readyForThreat(sim);
  const eligible = EVENTS.filter(
    (e) =>
      sim.day >= e.minDay &&
      (story.cooldowns[e.key] ?? 0) <= sim.tick &&
      (!e.threat || threatsWelcome) &&
      weightOf(sim, e) > 0,
  );
  let roll = sim.rng.next() * eligible.reduce((sum, e) => sum + weightOf(sim, e), 0);
  for (const event of eligible) {
    roll -= weightOf(sim, event);
    if (roll <= 0) {
      if (event.run(sim)) {
        story.lastEventTick = sim.tick;
        // Raids don't arrive like clockwork: up to two extra days on top of the cooldown (half a day
        // on harsh, which keeps the pressure on).
        const maxSpread = story.difficulty === 'harsh' ? DAY / 2 : 2 * DAY;
        const spread = event.key === 'raid' ? Math.floor(sim.rng.next() * maxSpread) : 0;
        story.cooldowns[event.key] = sim.tick + event.cooldownDays * DAY + spread;
        if (event.threat) {
          breather(sim);
        }
      }
      return;
    }
  }
}

// Forces an event for testing and debugging. It still counts towards the event's cooldown.
export function triggerEvent(sim: Simulation, key: string): boolean {
  const event = EVENTS.find((e) => e.key === key);
  if (!event || !event.run(sim)) {
    return false;
  }
  sim.story.lastEventTick = sim.tick;
  sim.story.cooldowns[event.key] = sim.tick + event.cooldownDays * DAY;
  if (event.threat) {
    breather(sim);
  }
  return true;
}

export const EVENT_KEYS = EVENTS.map((e) => e.key);

// What everything the colony holds is worth, in silver.
export function colonyWealth(sim: Simulation): number {
  return sim.resourceTotals().reduce((sum, r) => sum + r.total * itemDef(r.item).value, 0);
}

// How likely an event is to be picked right now, relative to the others (for tests and tools).
export const eventWeight = (sim: Simulation, key: string): number => {
  const event = EVENTS.find((e) => e.key === key);
  return event ? weightOf(sim, event) : 0;
};

// Events that count as threats (more frequent on harsh, rarer on peaceful).
export const THREAT_EVENTS = EVENTS.filter((e) => e.threat).map((e) => e.key);
