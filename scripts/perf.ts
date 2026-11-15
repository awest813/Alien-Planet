// Simulation speed on a busy map: milliseconds per 1,000 ticks, against the budget (60 ms keeps the fastest
// game speed smooth). Not part of the tests (timings vary too much between machines); run it after changes to
// anything that runs every tick.
//
//   npx rolldown scripts/perf.ts --platform node --format esm --file /tmp/perf.mjs && node /tmp/perf.mjs [size=128]
//
// The largest map by default; "size=N" measures another (it needn't be one of the sizes offered). "raid" times
// the same colony with a raid of twelve on it. (`npm run perf` runs both, as the weekly playtest does.)
// "from=save.json" times a saved game instead (scripts/balance.ts saves one as a raid arrives, with
// SAVE_RAID=day:file), for "ticks=N" ticks (3,000 by default), best of three: the same raid every time, so a
// change can be timed before and after.
import { readFileSync, writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { MAP_SIZES } from '../src/sim/constants';
import { spawnRaid } from '../src/sim/combat';
import { FACTIONS } from '../src/sim/defs';
import { SaveData, deserialize } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';

const BUDGET_MS = 60;
// Timings on one machine vary by a fifth from run to run (more on a shared one): the run fails only past a quarter
// over, a real slowdown, and says so when it's over by less.
const NOISE = 1.25;
const post = (session: Session, method: string): Promise<unknown> =>
  new Promise((resolve, reject) => session.post(method, (err, result) => (err ? reject(err) : resolve(result))));
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
  // "raid": a big raid (a dozen) comes for the colony as the timing starts, the hours a slow machine notices.
  const raid = process.argv.includes('raid');
  // The colony, got going first (stockpiles fill, jobs pile up), with the raid sent if asked for.
  const colony = () => {
    const sim = Simulation.newColony(5, 'standard', size);
    for (let t = 0; t < 200 * 24 * 3; t++) {
      sim.step();
    }
    if (
      raid &&
      !spawnRaid(
        sim,
        FACTIONS.findIndex((f) => f.hostile),
        12,
      )
    ) {
      throw new Error('No raid could be sent');
    }
    return sim;
  };
  const TICKS = raid ? 3000 : 20000;
  // "profile=file.cpuprofile" profiles the timed ticks alone (not the days before), for Chrome's DevTools.
  const profile = arg('profile');
  const session = profile ? new Session() : undefined;
  if (session) {
    session.connect();
    await post(session, 'Profiler.enable');
    await post(session, 'Profiler.start');
  }
  // A raid is timed in three colonies alike (the same seed plays the same), the best kept. The first is slow for
  // reasons not the game's: the engine compiles the fighting's code as it first runs (a game's first raid, 70-80
  // ms here, then 43-52). (The quiet colony runs long enough to settle by itself.)
  let sim = colony();
  let perThousand = Infinity;
  for (let run = 0; run < (raid && !profile ? 3 : 1); run++) {
    if (run > 0) {
      sim = colony();
    }
    const started = performance.now();
    for (let t = 0; t < TICKS; t++) {
      sim.step();
    }
    perThousand = Math.min(perThousand, (performance.now() - started) / (TICKS / 1000));
  }
  if (session && profile) {
    const { profile: data } = (await post(session, 'Profiler.stop')) as { profile: unknown };
    writeFileSync(profile, JSON.stringify(data));
    session.disconnect();
  }
  console.log(
    `${size}×${size}, day ${sim.day}, ${sim.living().length} colonists, ${sim.animals.length} animals` +
      `${raid ? `, a raid of 12 (${sim.raid ? 'still on' : 'over'})` : ''}: ` +
      `${perThousand.toFixed(1)} ms per 1,000 ticks (${raid ? 'best of 3; ' : ''}budget ${BUDGET_MS})`,
  );
  const budget = BUDGET_MS;
  if (perThousand > budget) {
    console.log(`  over budget${perThousand <= budget * NOISE ? ' (within what timings vary by: not failed)' : ''}`);
  }
  process.exitCode = perThousand > budget * NOISE ? 1 : 0;
}
