// The village over long games: runs the balance harness and prints the votes, the changes of leader, how long
// leaders last, the time with none, and how often the leader lifts or drags down the colony.
//
//   npx rolldown scripts/village.ts --platform node --format esm --file /tmp/village.mjs
//   node /tmp/village.mjs 240 4 [diplomat] ...
//
// Takes the same arguments as balance.ts (it runs it).
import './village-probe';
import './balance';
