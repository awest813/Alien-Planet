// What the player is told, over long games: runs the balance harness with the game's controller watching each
// colony, and prints every alert (how much of the time it's up, how much of that it's among the three shown,
// how often it comes and goes, whether clicking it goes anywhere) and every kind of notification card (how many a
// day, and how many each speed pushes off screen before they can be read).
//
//   npx rolldown scripts/alerts.ts --platform node --format esm --file /tmp/alerts.mjs
//   node /tmp/alerts.mjs 48 8 [harsh|peaceful] [size=96] [diplomat] ...
//
// Takes the same arguments as balance.ts (it runs it).
import './alerts-probe';
import './balance';
