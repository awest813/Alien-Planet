// The combat probe for combat.ts: watches the colonies the balance harness plays through their fights, and counts
// each side's attacks by weapon (how often they land, from how far, for how much, and the kills), archers caught
// fighting with their fists, drafted colonists standing idle with a raider in reach, the weapons the colony
// fights with, and how long raids last. Imported before balance.ts; the totals are printed when it's done.
import { weaponDef } from '../src/sim/defs';
import { Simulation } from '../src/sim/simulation';
import type { Colonist, Enemy, Shot } from '../src/sim/types';

interface Tally {
  attacks: number;
  hits: number;
  distance: number;
  damage: number;
  kills: number;
}
const tallies = new Map<string, Tally>();
const tally = (key: string) => {
  let t = tallies.get(key);
  if (!t) {
    t = { attacks: 0, hits: 0, distance: 0, damage: 0, kills: 0 };
    tallies.set(key, t);
  }
  return t;
};
let draftedTicks = 0;
let idleWithTarget = 0;
let fistsByArchers = 0;
let archerAttacks = 0;
const carried = new Map<string, number>();
let fighterSamples = 0;
const raids: { ticks: number; downed: number; raiders: number }[] = [];
let raidStart: { tick: number; downed: number; raiders: number } | null = null;
let downedNow = new Set<number>();
let raidDowned = 0;

type Sim = Simulation & { shots: Shot[] };

const seen = new WeakSet<Shot>();
function tick(sim: Sim, hpBefore: Map<Enemy, number>, hurtBefore: Map<Colonist, number>): void {
  const w = sim.world;
  const fresh = sim.shots.filter((s) => !seen.has(s));
  fresh.forEach((s) => seen.add(s));
  for (const s of fresh) {
    const colonist = sim.colonists.find((c) => c.tile === s.from && !c.health.dead && !c.away);
    const enemy = sim.enemies.find((e) => e.tile === s.from && e.hp > 0);
    // (Among those there before the tick: one brought down is gone from the list by the end of it.)
    const targetEnemy = [...hpBefore.keys()].find((e) => e.tile === s.to) ?? sim.enemies.find((e) => e.tile === s.to);
    const targetColonist = sim.colonists.find((c) => c.tile === s.to && !c.health.dead);
    let key: string;
    let dealt: number;
    let killed: boolean;
    if (colonist && targetEnemy) {
      const weapon = weaponDef(colonist.weapon);
      const used = s.ranged ? weapon.key : weapon.range > 1 ? 'fists (archer in melee)' : weapon.key;
      if (weapon.range > 1) {
        archerAttacks++;
        fistsByArchers += s.ranged ? 0 : 1;
      }
      key = `colonist ${used}`;
      const before = hpBefore.get(targetEnemy) ?? targetEnemy.hp;
      dealt = Math.max(0, before - Math.max(0, targetEnemy.hp));
      killed = before > 0 && targetEnemy.hp <= 0;
    } else if (enemy && targetColonist) {
      const weapon = weaponDef(enemy.weapon);
      const used = s.ranged ? weapon.key : weapon.range > 1 ? 'fists (archer in melee)' : weapon.key;
      key = `raider ${used}`;
      const now = targetColonist.health.injuries.reduce((n, i) => n + i.severity, 0);
      dealt = Math.max(0, now - (hurtBefore.get(targetColonist) ?? now));
      killed = targetColonist.health.downed && !downedNow.has(targetColonist.id);
    } else {
      continue;
    }
    const t = tally(key);
    t.attacks++;
    t.distance += w.distance(s.from, s.to);
    if (s.hit) {
      t.hits++;
      t.damage += dealt;
    }
    t.kills += killed ? 1 : 0;
  }
  // Drafted colonists in a fight: idle with a raider they could attack.
  const fighting = sim.enemies.some((e) => e.hp > 0 && !e.fleeing);
  if (fighting) {
    for (const c of sim.living()) {
      if (!c.drafted || c.health.downed) {
        continue;
      }
      draftedTicks++;
      if (sim.tick % 50 === 0) {
        fighterSamples++;
        carried.set(c.weapon, (carried.get(c.weapon) ?? 0) + 1);
      }
      const range = weaponDef(c.weapon).range;
      const reach = sim.enemies.some(
        (e) =>
          e.hp > 0 &&
          (w.distance(c.tile, e.tile) <= range ||
            Math.max(Math.abs(w.xOf(c.tile) - w.xOf(e.tile)), Math.abs(w.yOf(c.tile) - w.yOf(e.tile))) <= 1),
      );
      // Idle: in reach of someone, not moving, not on cooldown, and no attack this tick.
      if (reach && c.path.length === 0 && c.cooldown <= 0 && !fresh.some((shot) => shot.from === c.tile)) {
        idleWithTarget++;
      }
    }
  }
  // Raids: from the first raider to the last gone.
  const live = sim.enemies.filter((e) => e.hp > 0).length;
  if (sim.raid && !raidStart) {
    raidStart = { tick: sim.tick, downed: 0, raiders: sim.enemies.length };
    raidDowned = 0;
  }
  for (const c of sim.living()) {
    if (c.health.downed && !downedNow.has(c.id) && raidStart) {
      raidDowned++;
    }
  }
  downedNow = new Set(
    sim
      .living()
      .filter((c) => c.health.downed)
      .map((c) => c.id),
  );
  if (raidStart && !sim.raid && live === 0) {
    raids.push({ ticks: sim.tick - raidStart.tick, downed: raidDowned, raiders: raidStart.raiders });
    raidStart = null;
  }
}

const step = Simulation.prototype.step;
Simulation.prototype.step = function (this: Simulation, ...args: unknown[]) {
  const sim = this as Sim;
  const busy = sim.enemies.length > 0;
  const hpBefore = busy ? new Map(sim.enemies.map((e) => [e, e.hp])) : new Map<Enemy, number>();
  const hurtBefore = busy
    ? new Map(sim.colonists.map((c) => [c, c.health.injuries.reduce((n, i) => n + i.severity, 0)]))
    : new Map<Colonist, number>();
  const result = (step as (this: Simulation, ...a: unknown[]) => unknown).apply(this, args);
  if (busy || sim.enemies.length > 0) {
    tick(sim, hpBefore, hurtBefore);
  } else {
    sim.shots.forEach((s) => seen.add(s));
  }
  return result;
};

process.on('exit', () => {
  const pct = (n: number, of: number) => `${((100 * n) / Math.max(1, of)).toFixed(1)}%`;
  console.log('\nCOMBAT');
  console.log('  side weapon | attacks | hit | mean distance | damage per hit | damage per attack | kills (downs)');
  for (const [key, t] of [...tallies].sort((a, b) => b[1].attacks - a[1].attacks)) {
    console.log(
      `   ${key.padEnd(34)} ${String(t.attacks).padStart(7)} ${pct(t.hits, t.attacks).padStart(6)} ${(t.distance / Math.max(1, t.attacks)).toFixed(1).padStart(5)} ${(t.damage / Math.max(1, t.hits)).toFixed(3).padStart(7)} ${(t.damage / Math.max(1, t.attacks)).toFixed(3).padStart(7)} ${String(t.kills).padStart(6)}`,
    );
  }
  console.log(
    `  archers' attacks made with their fists (a raider beside them): ${fistsByArchers} of ${archerAttacks} (${pct(fistsByArchers, archerAttacks)})`,
  );
  console.log(`  drafted colonist-ticks in a fight idle with a raider in reach: ${pct(idleWithTarget, draftedTicks)}`);
  console.log(
    `  drafted fighters carry: ${[...carried]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${pct(n, fighterSamples)}`)
      .join(', ')}`,
  );
  const hours = raids.map((r) => r.ticks / 200).sort((a, b) => a - b);
  console.log(
    `  raids: ${raids.length}, hours median ${hours[Math.floor(hours.length / 2)]?.toFixed(1)} (90th ${hours[Math.floor(hours.length * 0.9)]?.toFixed(1)}), colonists downed per raid ${(raids.reduce((s, r) => s + r.downed, 0) / Math.max(1, raids.length)).toFixed(2)}`,
  );
});
