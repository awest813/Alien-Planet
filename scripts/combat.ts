// Weapons and fighting, over long games: runs the balance harness with a probe watching the fights, and prints each
// side's attacks by weapon (hit rate, distance, damage, kills), archers caught fighting with their fists, drafted
// colonists idle with a raider in reach, the weapons the colony fights with, and how long raids last.
//
//   npx rolldown scripts/combat.ts --platform node --format esm --file /tmp/combat.mjs
//   node /tmp/combat.mjs 48 8 [harsh] [defend] [craft] ...
//
// Takes the same arguments as balance.ts (it runs it).
import './combat-probe';
import './balance';
