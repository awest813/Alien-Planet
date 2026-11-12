import { TICKS_PER_HOUR } from './constants';
import { featureId } from './defs';
import type { Simulation } from './simulation';

// The long game: a signal beacon calls a ship. Research it, build it, keep it powered and transmitting
// for five days while raiders home in on the signal, and a ship answers. When it lands the colony
// chooses: board it and end the story on its own terms, or stay and carry on (and signal again later).

export interface BeaconState {
  // Hours the beacon has transmitted towards the current call.
  hours: number;
  // When a ship answered, and when it lands (it stays a day).
  answeredAt?: number;
  landsAt?: number;
  landed?: boolean;
  // What the colony chose when the last ship landed.
  choice?: 'stay' | 'depart';
  // Quiet after the colony chose to stay, until the player signals again (older saves: never quiet).
  silent?: boolean;
}

// Transmitting this long brings an answer.
export const TRANSMIT_HOURS = 120;
// The ship lands this long after answering, and waits this long before leaving without anyone.
export const LANDING_TICKS = TICKS_PER_HOUR * 48;
export const WAIT_TICKS = TICKS_PER_HOUR * 24;
// Raids are this much more likely while the beacon is transmitting.
export const SIGNAL_RAID_WEIGHT = 1.5;

export const freshBeacon = (): BeaconState => ({ hours: 0 });

// The beacon that's standing, if any (the first one found). Worked out again only when buildings
// change: the renderer asks every frame.
const found = new WeakMap<Simulation, { version: number; tile: number | undefined }>();
export function beaconTile(sim: Simulation): number | undefined {
  const cached = found.get(sim);
  if (cached && cached.version === sim.world.featureVersion) {
    return cached.tile;
  }
  const beacon = featureId('signalBeacon');
  const tile = [...sim.world.tilesWith('features')].find((i) => sim.world.feature[i] === beacon);
  found.set(sim, { version: sim.world.featureVersion, tile });
  return tile;
}

// Whether the beacon is on the air right now: standing, powered, and not already answered.
export function transmitting(sim: Simulation): boolean {
  const b = sim.beacon;
  return b.answeredAt === undefined && b.hours > 0 && beaconTile(sim) !== undefined && sim.power.powered;
}

// Called every in-game hour.
export function updateBeacon(sim: Simulation): void {
  const b = sim.beacon;
  if (sim.departed) {
    return;
  }
  if (b.answeredAt === undefined) {
    if (b.silent || beaconTile(sim) === undefined || !sim.power.powered || sim.living().length === 0) {
      return;
    }
    b.hours++;
    if (b.hours === 1) {
      sim.addLog(
        'The signal beacon is transmitting. Keep it powered for five days, and be ready: raiders may hear it too.',
        'warn',
        true,
      );
    } else if (b.hours === TRANSMIT_HOURS / 2) {
      sim.addLog('The signal is getting through: halfway there.', 'good', true);
    } else if (b.hours >= TRANSMIT_HOURS) {
      b.answeredAt = sim.tick;
      b.landsAt = sim.tick + LANDING_TICKS;
      sim.addLog('A ship has answered the signal! It will land beside the beacon in two days.', 'good', true);
      sim.events.push('shipAnswered');
    }
    return;
  }
  // Nobody left to meet it, or no beacon to land by: it turns back, and the beacon can call again.
  if (!b.landed && b.landsAt !== undefined && (sim.living().length === 0 || beaconTile(sim) === undefined)) {
    if (sim.tick >= b.landsAt) {
      // (Said as it was: with the beacon standing and everyone away on a trip, it "found no beacon".)
      chooseToStay(
        sim,
        beaconTile(sim) === undefined
          ? 'The ship found no beacon to land by and turned back.'
          : 'The ship found nobody at the beacon to meet it and turned back.',
      );
      sim.beacon.choice = undefined;
    }
    return;
  }
  if (!b.landed && b.landsAt !== undefined && sim.tick >= b.landsAt) {
    b.landed = true;
    const at = beaconTile(sim);
    sim.addLog(
      'The ship has landed beside the beacon. It will wait a day: board it, or stay.',
      'good',
      true,
      at === undefined ? undefined : { tile: at },
    );
    sim.events.push('shipLanded');
    return;
  }
  // Nobody came aboard: it leaves, and the beacon can call again.
  if (b.landed && b.landsAt !== undefined && sim.tick >= b.landsAt + WAIT_TICKS) {
    chooseToStay(sim, 'The ship has lifted off without the colony.');
  }
}

// The colony stays: the ship leaves, and the beacon starts over.
export function chooseToStay(
  sim: Simulation,
  why = 'The colony has chosen to stay. The ship lifts off without them.',
): void {
  // The beacon falls quiet until the player signals again: left transmitting, it started over at once, raiders
  // and all (and a ship nobody answered, with a party away, came back every week).
  sim.beacon = { hours: 0, choice: 'stay', silent: true };
  sim.addLog(why, 'info', true);
}

// The colony boards the ship: the story ends here.
// Not while anyone is away on an expedition: the colony doesn't leave its own behind.
export function depart(sim: Simulation): boolean {
  if (!sim.beacon.landed || sim.living().length === 0 || sim.headcount() > sim.living().length) {
    return false;
  }
  sim.beacon.choice = 'depart';
  sim.departed = true;
  const names = sim.living().map((c) => c.name);
  sim.addLog(
    `${names.join(', ').replace(/, ([^,]*)$/, ' and $1')} boarded the ship and left the valley behind.`,
    'good',
    true,
  );
  return true;
}
