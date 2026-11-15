// Wear and tear over long games: runs the balance harness and prints how often colonists go in tattered clothes
// or none, work without a tool kit, wear armour, and how often things fall apart, wear out and are mended.
//
//   npx rolldown scripts/gear.ts --platform node --format esm --file /tmp/gear.mjs
//   node /tmp/gear.mjs 120 6 [craft] [biome=tundra] ...
//
// Takes the same arguments as balance.ts (it runs it).
import './gear-probe';
import './balance';
