// Simulation speed on a busy map: milliseconds per 1,000 ticks, against the budget (60 ms keeps the fastest
// game speed smooth). Not part of the tests (timings vary too much between machines); run it after changes to
// anything that runs every tick.
//
//   npx esbuild scripts/perf.ts --bundle --platform=node --format=esm --outfile=/tmp/perf.mjs && node /tmp/perf.mjs
import { MAP_SIZES } from '../src/sim/constants';
import { Simulation } from '../src/sim/simulation';

const BUDGET_MS = 60;
const size = MAP_SIZES[MAP_SIZES.length - 1].size;
const sim = Simulation.newColony(5, 'standard', size);
// Let the colony get going first (stockpiles fill, jobs pile up).
for (let t = 0; t < 200 * 24 * 3; t++) {
  sim.step();
}
const TICKS = 20000;
const started = performance.now();
for (let t = 0; t < TICKS; t++) {
  sim.step();
}
const perThousand = (performance.now() - started) / (TICKS / 1000);
console.log(
  `${size}×${size}, day ${sim.day}, ${sim.living().length} colonists, ${sim.animals.length} animals: ` +
    `${perThousand.toFixed(1)} ms per 1,000 ticks (budget ${BUDGET_MS})`,
);
process.exitCode = perThousand > BUDGET_MS ? 1 : 0;
