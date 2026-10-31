import { spawnRaid } from './combat';
import { TICKS_PER_HOUR } from './constants';
import { FACTIONS, NONE, featureDef, itemId } from './defs';
import { infect } from './health';
import type { Simulation } from './simulation';

export interface StoryState {
  lastEventTick: number;
  // Tick before which each event may not fire again.
  cooldowns: Record<string, number>;
  coldSnapUntil: number;
}

export const freshStory = (): StoryState => ({ lastEventTick: 0, cooldowns: {}, coldSnapUntil: 0 });

interface EventDef {
  key: string;
  minDay: number;
  cooldownDays: number;
  weight: (sim: Simulation) => number;
  run: (sim: Simulation) => boolean;
}

const DAY = TICKS_PER_HOUR * 24;
// Minimum gap between any two events, and the hourly chance of one once that has passed.
const EVENT_GAP = TICKS_PER_HOUR * 10;
const HOURLY_CHANCE = 1 / 14;
const MAX_COLONISTS = 8;

const hostileFactions = () => FACTIONS.filter((f) => f.hostile);
const friendlyFaction = () => FACTIONS.find((f) => !f.hostile)!;

const EVENTS: EventDef[] = [
  {
    key: 'raid',
    minDay: 4,
    cooldownDays: 3,
    weight: () => 3,
    run: (sim) => {
      const living = sim.living().length;
      // Two raiders on day 4, one more every three days, plus one for a big colony; never more than seven.
      const count = Math.min(7, 2 + Math.floor((sim.day - 4) / 3) + (living > 6 ? 1 : 0));
      return spawnRaid(sim, sim.rng.pick(hostileFactions()).id, count);
    },
  },
  {
    key: 'disease',
    minDay: 3,
    cooldownDays: 5,
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
    weight: (sim) => (sim.living().length < MAX_COLONISTS ? 1 : 0),
    run: (sim) => {
      const c = sim.addWanderer();
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
    key: 'coldSnap',
    minDay: 3,
    cooldownDays: 6,
    weight: () => 1,
    run: (sim) => {
      sim.story.coldSnapUntil = sim.tick + 2 * DAY;
      sim.addLog('A cold snap has rolled in. Expect freezing nights for the next two days.', 'warn', true);
      return true;
    },
  },
  {
    key: 'supplies',
    minDay: 2,
    cooldownDays: 3,
    weight: () => 1.2,
    run: (sim) => {
      const anchor = sim.living()[0];
      if (!anchor) {
        return false;
      }
      const options: [string, number][] = [
        ['meal', 10],
        ['herbalMedicine', 6],
        ['wood', 60],
        ['cloth', 20],
      ];
      const [key, count] = sim.rng.pick(options);
      sim.world.dropItemNear(anchor.tile, itemId(key), count);
      sim.addLog(`${friendlyFaction().name} left a gift of supplies near the colony.`, 'good', true);
      return true;
    },
  },
  {
    key: 'blight',
    minDay: 5,
    cooldownDays: 8,
    weight: (sim) => (sim.countFeature((f) => !!featureDef(f).crop) > 8 ? 0.6 : 0),
    run: (sim) => {
      const w = sim.world;
      let lost = 0;
      for (let i = 0; i < w.size; i++) {
        if (w.feature[i] !== NONE && featureDef(w.feature[i]).crop && sim.rng.next() < 0.5) {
          w.setFeature(i, NONE);
          lost++;
        }
      }
      sim.addLog(`Blight has struck the fields. ${lost} plants withered.`, 'warn', true);
      return lost > 0;
    },
  },
];

// Called every tick; at most rolls once per in-game hour.
export function updateStoryteller(sim: Simulation): void {
  const story = sim.story;
  if (sim.tick % TICKS_PER_HOUR !== 0 || sim.tick - story.lastEventTick < EVENT_GAP) {
    return;
  }
  if (sim.living().length === 0 || sim.raid || sim.rng.next() >= HOURLY_CHANCE) {
    return;
  }
  const eligible = EVENTS.filter(
    (e) => sim.day >= e.minDay && (story.cooldowns[e.key] ?? 0) <= sim.tick && e.weight(sim) > 0,
  );
  let roll = sim.rng.next() * eligible.reduce((sum, e) => sum + e.weight(sim), 0);
  for (const event of eligible) {
    roll -= event.weight(sim);
    if (roll <= 0) {
      if (event.run(sim)) {
        story.lastEventTick = sim.tick;
        story.cooldowns[event.key] = sim.tick + event.cooldownDays * DAY;
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
  return true;
}

export const EVENT_KEYS = EVENTS.map((e) => e.key);
