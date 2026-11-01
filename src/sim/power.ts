import { NONE, featureDef } from './defs';
import type { Simulation } from './simulation';
import { eclipseOn } from './storyteller';

// The colony shares a single power grid: every generator feeds it, every consumer draws
// from it, and batteries smooth out the gaps. If supply and storage can't cover demand,
// everything electric switches off until they can.
export interface PowerState {
  supply: number;
  demand: number;
  stored: number;
  capacity: number;
  powered: boolean;
  // Generators are idling to save fuel: nothing else needs their power.
  idle: boolean;
}

export const freshPower = (): PowerState => ({
  supply: 0,
  demand: 0,
  stored: 0,
  capacity: 0,
  powered: true,
  idle: false,
});

// Solar output through the day: nothing at night, full strength at 13:00.
export function daylight(hour: number): number {
  return hour < 6 || hour > 20 ? 0 : Math.sin(((hour - 6) / 14) * Math.PI);
}

// Weaker winter sun.
const WINTER_SOLAR = 0.6;

// Advances the grid by `hours`, burning generator fuel and charging or draining batteries.
export function updatePower(sim: Simulation, tiles: number[], hours: number): void {
  const w = sim.world;
  const state = sim.power;
  let supply = 0;
  let demand = 0;
  let capacity = 0;
  const sun = eclipseOn(sim) ? 0 : daylight(sim.hour) * (sim.season === 'Winter' ? WINTER_SOLAR : 1);
  const generators: number[] = [];
  for (const i of tiles) {
    const f = w.feature[i];
    const power = f !== NONE ? featureDef(f).power : undefined;
    if (!power) {
      continue;
    }
    if (power.fuel) {
      generators.push(i);
    } else if (power.solar) {
      supply += power.output * sun;
    } else {
      supply += power.output;
    }
    demand += power.draw;
    capacity += power.storage;
  }
  // Generators idle (saving fuel) while everything else already covers demand and the batteries are full.
  const needed = demand > supply || state.stored < capacity;
  state.idle = !needed && generators.length > 0;
  for (const i of generators) {
    const fuel = featureDef(w.feature[i]).power!.fuel!;
    if (needed && w.fuel[i] > 0) {
      supply += featureDef(w.feature[i]).power!.output;
      w.fuel[i] = Math.max(0, w.fuel[i] - (fuel.perDay / 24) * hours);
    }
  }
  state.supply = supply;
  state.demand = demand;
  state.capacity = capacity;
  state.stored = Math.min(state.stored, capacity);
  const net = supply - demand;
  if (net >= 0) {
    state.stored = Math.min(capacity, state.stored + net * hours);
    state.powered = true;
  } else if (state.stored >= -net * hours && (state.powered || state.stored >= -net * 0.25)) {
    // Once the grid has switched off, it waits until the batteries can cover a quarter of an hour
    // of the shortfall, so it doesn't flicker on and off every update.
    state.stored += net * hours;
    state.powered = true;
  } else {
    // Not enough to run everything: the grid switches off and whatever is generated charges the
    // batteries, so they can carry the load once they hold enough.
    state.stored = Math.min(capacity, state.stored + supply * hours);
    state.powered = demand === 0;
  }
}

// Whether a building that needs power is running right now.
export function isRunning(sim: Simulation, feature: number): boolean {
  const power = featureDef(feature).power;
  return !power || power.draw === 0 || sim.power.powered;
}
