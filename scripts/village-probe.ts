// The village probe for village.ts: watches each colony the balance harness plays, hour by hour, and counts the
// votes, the changes of leader (and those made while the leader was away), how long leaders last, the hours with
// no leader, and how the leader's mood stands against what the colony expects of them.
import { Simulation, TICKS_PER_HOUR } from '../src/sim/simulation';
import { GOOD_LEADER_MOOD, POOR_LEADER_MOOD, leaderBar } from '../src/sim/village';

interface Watch {
  leader: number;
  electedOn: number;
  since: number;
  awayAtVote: boolean;
}
const watching = new WeakMap<Simulation, Watch>();
let votes = 0;
let changes = 0;
let ousterWhileAway = 0;
let hours = 0;
let leaderless = 0;
let leaderlessWithAdults = 0;
let good = 0;
let poor = 0;
const tenures: number[] = [];
let lastSeen: Simulation | null = null;

function finish(sim: Simulation, w: Watch): void {
  if (w.leader >= 0) {
    tenures.push((sim.tick - w.since) / (TICKS_PER_HOUR * 24));
  }
}

const step = Simulation.prototype.step;
Simulation.prototype.step = function (this: Simulation, ...args: unknown[]) {
  const before = watching.get(this);
  const awayBefore = before && before.leader >= 0 ? !!this.colonists[before.leader]?.away : false;
  const result = (step as (this: Simulation, ...a: unknown[]) => unknown).apply(this, args);
  if (lastSeen && lastSeen !== this) {
    const w = watching.get(lastSeen);
    if (w) {
      finish(lastSeen, w);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- the colony last stepped, to close its leader's tenure
  lastSeen = this;
  const v = this.village;
  let w = watching.get(this);
  if (!w) {
    w = { leader: v.leader, electedOn: v.electedOn, since: this.tick, awayAtVote: false };
    watching.set(this, w);
  }
  if (v.electedOn !== w.electedOn) {
    votes++;
    w.electedOn = v.electedOn;
  }
  if (v.leader !== w.leader) {
    if (w.leader >= 0 && v.leader >= 0) {
      changes++;
      const old = this.colonists[w.leader];
      if (old && !old.health.dead && (awayBefore || old.away)) {
        ousterWhileAway++;
      }
    }
    finish(this, w);
    w.leader = v.leader;
    w.since = this.tick;
  }
  if (this.tick % TICKS_PER_HOUR === 0) {
    hours++;
    const leader = this.colonists[v.leader];
    if (v.leader < 0) {
      leaderless++;
      leaderlessWithAdults += this.living().filter((c) => c.age >= 18).length >= 3 ? 1 : 0;
    } else if (leader && !leader.health.dead) {
      const bar = leaderBar(this);
      good += leader.mood >= GOOD_LEADER_MOOD + bar ? 1 : 0;
      poor += leader.mood < POOR_LEADER_MOOD + bar ? 1 : 0;
    }
  }
  return result;
};

process.on('exit', () => {
  if (lastSeen) {
    const w = watching.get(lastSeen);
    if (w) {
      finish(lastSeen, w);
    }
  }
  const pct = (n: number) => `${((100 * n) / Math.max(1, hours)).toFixed(1)}%`;
  const t = [...tenures].sort((a, b) => a - b);
  console.log('\nVILLAGE');
  console.log(`  votes ${votes}, leaders changed ${changes} (of them while the leader was away: ${ousterWhileAway})`);
  console.log(
    `  tenure in days: median ${t[Math.floor(t.length / 2)]?.toFixed(0)}, shortest ${t[0]?.toFixed(0)}, longest ${t[t.length - 1]?.toFixed(0)}`,
  );
  console.log(`  hours with no leader ${pct(leaderless)} (with three adults or more: ${pct(leaderlessWithAdults)})`);
  console.log(`  leader in good spirits (lifting everyone) ${pct(good)}, low (dragging them down) ${pct(poor)}`);
});
