// The alerts probe for alerts.ts: hands each colony the balance harness plays to the game's controller, and every
// game hour asks it for the alerts a player would see, and counts the story's notification cards. Imported before
// balance.ts, which then runs the colonies; the totals are printed when it's done.
import { Alert, SPEEDS, TICKS_PER_SECOND, controller } from '../src/game/controller';
import { FACTIONS } from '../src/sim/defs';
import { Simulation, TICKS_PER_HOUR } from '../src/sim/simulation';

const SHOWN = 3; // As the side panel shows them before "N more alerts".
const CARDS = 4; // Notification cards on screen at once.
const NOTICE_SECONDS = 8; // The default.

interface Kind {
  tone: string;
  hours: number; // Hours on the list.
  visibleHours: number; // Of those, hours among the top three.
  spells: number; // Times it came up (off, then on).
  shortSpells: number; // Spells of an hour or less: came and went.
  target: boolean; // Clicked, it goes somewhere (a colonist, a tile, a tool or a screen).
  example: string;
}
const kinds = new Map<string, Kind>();
const lengths: number[] = [];
const cardsByKind = new Map<string, { n: number; tone: string; example: string; about: boolean }>();
let hours = 0;
let colonyDays = 0;
// Per colony, the hours at which story cards came, to replay at each speed.
const cardHours: { hour: number; tone: string }[][] = [];

let current: Simulation | null = null;
let last = new Map<string, number>(); // Key -> hours on so far, this spell.
let seenStory = 0;

// Names and numbers out, so "Pell is bleeding" and "Wren is bleeding" are the same alert.
function keyOf(sim: Simulation, text: string): string {
  const names = new Set<string>([
    ...sim.colonists.map((c) => c.name),
    ...sim.captives.map((p) => p.name),
    ...sim.enemies.map((e) => e.name),
    ...sim.allies.map((a) => a.name),
  ]);
  let key = text;
  for (const f of FACTIONS) {
    key = key.split(f.name).join('<faction>');
  }
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    key = key.split(n).join('<name>');
  }
  return key
    .replace(/\d+(\.\d+)?/g, '#')
    .replace(/(<name>(, | and )?)+/g, '<names>')
    .slice(0, 110);
}

const rank = { danger: 0, warn: 1, calm: 2 };
const sorted = (alerts: Alert[]) =>
  [...alerts].sort((a, b) => Number(!!b.threat) - Number(!!a.threat) || rank[a.tone] - rank[b.tone]);

function hourly(sim: Simulation): void {
  if (sim !== current) {
    current = sim;
    last = new Map();
    seenStory = sim.storyCount;
    cardHours.push([]);
    (controller as unknown as { replaceSim(s: Simulation): void }).replaceSim(sim);
  }
  hours++;
  if (sim.tick % (TICKS_PER_HOUR * 24) === 0) {
    colonyDays++;
  }
  const alerts = sorted(
    (controller as unknown as { buildAlerts(t: unknown): Alert[] }).buildAlerts(sim.resourceTotals()),
  );
  lengths.push(alerts.length);
  const now = new Map<string, number>();
  alerts.forEach((a, index) => {
    const key = keyOf(sim, a.text);
    if (now.has(key)) {
      return;
    }
    let k = kinds.get(key);
    if (!k) {
      k = { tone: a.tone, hours: 0, visibleHours: 0, spells: 0, shortSpells: 0, target: false, example: a.text };
      kinds.set(key, k);
    }
    k.hours++;
    k.visibleHours += index < SHOWN ? 1 : 0;
    k.target ||= a.colonist !== undefined || a.tile !== undefined || !!a.tool || !!a.screen;
    const spell = (last.get(key) ?? 0) + 1;
    if (spell === 1) {
      k.spells++;
    }
    now.set(key, spell);
  });
  for (const [key, spell] of last) {
    if (!now.has(key) && spell <= 1) {
      kinds.get(key)!.shortSpells++;
    }
  }
  last = now;
  // The story's cards since the last hour.
  const fresh = Math.min(sim.storyCount - seenStory, sim.storyLog.length);
  for (const entry of sim.storyLog.slice(sim.storyLog.length - fresh)) {
    const key = keyOf(sim, entry.text);
    const c = cardsByKind.get(key) ?? { n: 0, tone: entry.tone, example: entry.text, about: !!entry.about };
    c.n++;
    cardsByKind.set(key, c);
    cardHours[cardHours.length - 1].push({ hour: sim.tick / TICKS_PER_HOUR, tone: entry.tone });
  }
  seenStory = sim.storyCount;
}

const step = Simulation.prototype.step;
Simulation.prototype.step = function (this: Simulation, ...args: unknown[]) {
  const result = (step as (this: Simulation, ...a: unknown[]) => unknown).apply(this, args);
  if (this.tick % TICKS_PER_HOUR === 0) {
    hourly(this);
  }
  return result;
};

// Cards that left before they'd been up a second and a half, pushed out by newer ones (four at once at most, the
// calm ones going first), as at each speed.
function pushedOut(speed: number): { cards: number; lost: number; dangerLost: number } {
  const hourSeconds = TICKS_PER_HOUR / (TICKS_PER_SECOND * speed);
  let cards = 0;
  let lost = 0;
  let dangerLost = 0;
  for (const colony of cardHours) {
    let up: { at: number; tone: string }[] = [];
    for (const card of colony) {
      const at = card.hour * hourSeconds;
      up = up.filter((u) => u.at + NOTICE_SECONDS > at);
      up.push({ at, tone: card.tone });
      cards++;
      while (up.length > CARDS) {
        const calm = up.findIndex((u) => u.tone !== 'danger');
        const [gone] = up.splice(calm >= 0 ? calm : 0, 1);
        if (at - gone.at < 1.5) {
          lost++;
          dangerLost += gone.tone === 'danger' ? 1 : 0;
        }
      }
    }
  }
  return { cards, lost, dangerLost };
}

process.on('exit', () => {
  const pct = (n: number, of: number) => `${((100 * n) / Math.max(1, of)).toFixed(1)}%`;
  console.log(`\nALERTS over ${hours} colony-hours (${colonyDays} colony-days)`);
  const dist = [0, 1, 2, 3, 4, 5, 6, 8, 10].map((n, i, a) => {
    const hi = a[i + 1] ?? Infinity;
    return `${n}${hi === n + 1 ? '' : hi === Infinity ? '+' : `-${hi - 1}`}: ${pct(lengths.filter((l) => l >= n && l < hi).length, lengths.length)}`;
  });
  console.log(`  alerts on the list at once: ${dist.join('  ')}`);
  console.log('  share of hours | visible | spells | came-and-went | target | tone | example');
  for (const [, k] of [...kinds].sort((a, b) => b[1].hours - a[1].hours)) {
    console.log(
      `  ${pct(k.hours, hours).padStart(6)} | ${pct(k.visibleHours, k.hours).padStart(6)} | ${String(k.spells).padStart(5)} | ${String(k.shortSpells).padStart(5)} | ${k.target ? 'yes' : ' - '} | ${k.tone.padEnd(6)} | ${k.example.slice(0, 120)}`,
    );
  }
  console.log(
    `\nNOTIFICATIONS: ${[...cardsByKind.values()].reduce((s, c) => s + c.n, 0)} cards, ${([...cardsByKind.values()].reduce((s, c) => s + c.n, 0) / Math.max(1, colonyDays)).toFixed(1)} a colony-day`,
  );
  for (const speed of SPEEDS.filter((s) => s > 0)) {
    const { cards, lost, dangerLost } = pushedOut(speed);
    console.log(
      `  at ${speed}x: ${lost} of ${cards} pushed out within 1.5s (${pct(lost, cards)}), danger among them ${dangerLost}`,
    );
  }
  console.log('  per colony-day | tone | jumps to | example');
  for (const [, c] of [...cardsByKind].sort((a, b) => b[1].n - a[1].n).slice(0, 60)) {
    console.log(
      `  ${(c.n / Math.max(1, colonyDays)).toFixed(2).padStart(6)} | ${c.tone.padEnd(6)} | ${c.about ? 'yes' : ' - '} | ${c.example.slice(0, 120)}`,
    );
  }
});
