// A long game, year by year: runs the balance harness and prints a line for each colony at the start
// of every in-game year (24 days), so slow trends show (population, ages, families, food and wood,
// goodwill, raids, wealth, research, save size, speed).
//
//   npx rolldown scripts/years.ts --platform node --format esm --file /tmp/years.mjs
//   node /tmp/years.mjs 240 1 seed=150461 [harsh|peaceful] [size=96]
//
// Takes the same arguments as balance.ts (it runs it).
// (The probe is its own module, imported first, so it's in place before balance.ts runs. A require() after the
// hook left the bundled data unloaded, and the bundle failed at once.)
import './years-probe';
import './balance';
