// Crafting, cooking and the fields, over long games: runs the balance harness with a probe watching, and prints
// where the colonists' hours go, how each recipe's jobs go (gathering, walking, working; finished or dropped),
// what's eaten and whether a meal was there instead of raw food, what spoils, and how the fields spend their
// hours.
//
//   npx rolldown scripts/production.ts --platform node --format esm --file /tmp/production.mjs
//   node /tmp/production.mjs 48 8 [craft] [biome=tundra] ...
//
// Takes the same arguments as balance.ts (it runs it).
import './production-probe';
import './balance';
