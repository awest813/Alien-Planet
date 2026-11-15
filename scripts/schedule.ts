// How the colonists keep to their schedules: for every colonist-hour of the colonies the balance harness plays,
// what the hour was set for (Sleep, Work, Recreation, Anything) against what they were doing. With "nightowl", one
// colonist in each colony is put on nights (asleep 8:00 to 16:00), to see an odd schedule kept.
//
//   npx rolldown scripts/schedule.ts --platform node --format esm --file /tmp/schedule.mjs
//   node /tmp/schedule.mjs 24 6 [nightowl] ...
import './schedule-probe';
import './balance';
