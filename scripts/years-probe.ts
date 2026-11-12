// The year-by-year probe for years.ts: hooks the simulation's log so each colony prints a line a year. Imported
// before balance.ts, which then runs the colonies.
import { FACTIONS, featureId, itemDef, itemId } from '../src/sim/defs';
import { serialize } from '../src/sim/serialize';
import { OBJECTIVES, Simulation } from '../src/sim/simulation';
import { FRIEND_OPINION, RIVAL_OPINION, mutualOpinion } from '../src/sim/social';
import { goodwillOf } from '../src/sim/trade';

interface Tally {
  raids: number;
  breaks: number;
  started: number;
}
const tallies = new Map<Simulation, Tally>();

// A save's size with its map layers as plain arrays, as the game keeps them (as JSON, a typed array is an object of
// numbered keys, three times the size).
const saveBytes = (sim: Simulation) =>
  JSON.stringify(serialize(sim), (_k, v: unknown) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v)).length;
const tally = (sim: Simulation): Tally => {
  let t = tallies.get(sim);
  if (!t) {
    t = { raids: 0, breaks: 0, started: performance.now() };
    tallies.set(sim, t);
  }
  return t;
};

function snapshot(sim: Simulation): string {
  const t = tally(sim);
  const living = sim.living();
  const ages = living.map((c) => Math.floor(c.age)).sort((a, b) => a - b);
  let friends = 0;
  let rivals = 0;
  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) {
      const o = mutualOpinion(living[i], living[j]);
      friends += o >= FRIEND_OPINION ? 1 : 0;
      rivals += o <= RIVAL_OPINION ? 1 : 0;
    }
  }
  const totals = sim.resourceTotals();
  const wealth = totals.reduce((sum, r) => sum + r.total * itemDef(r.item).value, 0);
  const nutrition = totals.reduce((sum, r) => sum + r.total * itemDef(r.item).nutrition, 0);
  const kin = FACTIONS.find((f) => !f.hostile)!.id;
  const hills = FACTIONS.find((f) => f.key === 'hollowstone')!.id;
  const raiders = FACTIONS.filter((f) => f.hostile).map((f) => goodwillOf(sim, f.id));
  const now = performance.now();
  const line =
    `Y${Math.round((sim.day - 1) / 24)} pop ${living.length}/${sim.colonists.length} kids ${ages.filter((a) => a < 18).length} ` +
    `elders ${ages.filter((a) => a >= 65).length} ages ${ages[0] ?? '-'}-${ages[ages.length - 1] ?? '-'} ` +
    `mood ${Math.round(living.reduce((s, c) => s + c.mood, 0) / Math.max(1, living.length))} breaks ${t.breaks} ` +
    `friends ${friends} rivals ${rivals} married ${living.filter((c) => c.spouse >= 0).length / 2} ` +
    `food ${(nutrition / Math.max(1, living.length) / 1.4).toFixed(1)}d wood ${sim.stockOf(itemId('wood'))} ` +
    `trees ${sim.countFeature((f) => f === featureId('tree'))} silver ${sim.stockOf(itemId('silver'))} ` +
    `wealth ${Math.round(wealth / 1000)}k wild ${sim.animals.filter((a) => !a.tame).length} tame ${sim.animals.filter((a) => a.tame).length} ` +
    `kin ${goodwillOf(sim, kin)} hills ${goodwillOf(sim, hills)} raiders ${raiders.join('/')} away ${sim.headcount() - living.length} ` +
    `raids ${t.raids} research ${sim.research.done.length} ` +
    `goals ${OBJECTIVES.filter((o) => sim.objectivesDone[o.id]).length}/${OBJECTIVES.length} ` +
    `deaths ${JSON.stringify(sim.stats.deaths ?? {})} births ${sim.stats.births ?? 0} ` +
    `save ${Math.round(saveBytes(sim) / 1024)}KB ${((now - t.started) / 1000).toFixed(0)}s`;
  t.raids = 0;
  t.breaks = 0;
  t.started = now;
  return line;
}

const original = Simulation.prototype.addLog;
Simulation.prototype.addLog = function (this: Simulation, text: string, ...rest: unknown[]) {
  const t = tally(this);
  if (/^(Raid|Siege)!/.test(text)) {
    t.raids++;
  }
  if (text.includes('has had enough')) {
    t.breaks++;
  }
  if (/^Day \d+ begins/.test(text) && (this.day - 1) % 24 === 0) {
    console.log(snapshot(this));
  }
  return (original as (this: Simulation, ...args: unknown[]) => void).call(this, text, ...rest);
};
