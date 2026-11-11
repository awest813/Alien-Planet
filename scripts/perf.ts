// Simulation speed on a busy map: milliseconds per 1,000 ticks, against the budget (60 ms keeps the fastest
// game speed smooth). Not part of the tests (timings vary too much between machines); run it after changes to
// anything that runs every tick.
//
//   npx rolldown scripts/perf.ts --platform node --format esm --file /tmp/perf.mjs && node /tmp/perf.mjs [size=128]
//
// The largest map by default; "size=N" measures another (it needn't be one of the sizes offered).
// "from=save.json" times a saved game instead (scripts/balance.ts saves one as a raid arrives, with
// SAVE_RAID=day:file), for "ticks=N" ticks (3,000 by default), best of three: the same raid every time, so a
// change can be timed before and after.
import { readFileSync } from 'node:fs';
import { MAP_SIZES } from '../src/sim/constants';
import { SaveData, deserialize } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';

const BUDGET_MS = 60;
const arg = (name: string) => process.argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const from = arg('from');
if (from) {
  const saved = JSON.parse(readFileSync(from, 'utf8')) as SaveData;
  const ticks = Number(arg('ticks') ?? 3000);
  const times: number[] = [];
  let sim: Simulation | undefined;
  for (let run = 0; run < 3; run++) {
    sim = deserialize(structuredClone(saved));
    const started = performance.now();
    for (let t = 0; t < ticks; t++) {
      sim.step();
    }
    times.push((performance.now() - started) / (ticks / 1000));
  }
  const best = Math.min(...times);
  console.log(
    `${from}: ${sim!.world.width}×${sim!.world.height}, day ${sim!.day}, raid ${sim!.raid ? 'still on' : 'over'}: ` +
      `${best.toFixed(1)} ms per 1,000 ticks (best of 3; budget ${BUDGET_MS})`,
  );
  process.exitCode = best > BUDGET_MS ? 1 : 0;
} else {
  const size = Number(arg('size') ?? MAP_SIZES[MAP_SIZES.length - 1].size);
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
}
