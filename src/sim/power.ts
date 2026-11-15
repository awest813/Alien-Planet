import { NONE, featureDef } from './defs';
import type { Simulation } from './simulation';
import { sunStrength, windStrength } from './weather';

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

// Sun and wind are the weather's (weather.ts); here for the power code that used to keep them.
export { daylight, sunStrength, windStrength, windWords } from './weather';

// Advances the grid by `hours`, burning generator fuel and charging or draining batteries.
export function updatePower(sim: Simulation, tiles: number[], hours: number): void {
  const w = sim.world;
  const state = sim.power;
  let supply = 0;
  let demand = 0;
  let capacity = 0;
  const sun = sunStrength(sim);
  const generators: number[] = [];
  let wind: number | undefined;
  for (const i of tiles) {
    const f = w.feature[i];
    const power = f !== NONE ? featureDef(f).power : undefined;
    if (!power) {
      continue;
    }
    // A beacon fallen quiet (the colony chose to stay) draws nothing: its 400 W kept the generators burning wood for
    // a signal nobody was sending.
    if (sim.beacon.silent && featureDef(f).key === 'signalBeacon') {
      continue;
    }
    if (power.fuel) {
      generators.push(i);
    } else if (power.solar) {
      supply += power.output * sun;
    } else if (power.wind) {
      // (Under a roof its blades can't turn.)
      supply += sim.isRoofed(i) ? 0 : power.output * (wind ??= windStrength(sim));
    } else {
      supply += power.output;
    }
    demand += power.draw;
    capacity += power.storage;
  }
  // Generators idle (saving fuel) while everything else already covers demand and the batteries are
  // full, and when even running flat out they couldn't power the grid and there's no battery to charge.
  let flatOut = supply;
  for (const i of generators) {
    flatOut += w.fuel[i] > 0 ? featureDef(w.feature[i]).power!.output : 0;
  }
  const needed = (demand > supply || state.stored < capacity) && (flatOut >= demand || state.stored < capacity);
  state.idle = !needed && generators.length > 0;
  for (const i of generators) {
    const fuel = featureDef(w.feature[i]).power!.fuel!;
    if (needed && w.fuel[i] > 0) {
      supply += featureDef(w.feature[i]).power!.output;
      w.fuel[i] = Math.max(0, w.fuel[i] - (fuel.perDay / 24) * hours * (sim.isResearched('engineering') ? 2 / 3 : 1));
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
