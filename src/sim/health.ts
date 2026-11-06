import diseasesJson from '../data/diseases.json';
import { TICKS_PER_HOUR } from './constants';
import { comfortRange } from './apparel';
import { WET_CHILL, isWet } from './weather';
import { itemId, weaponDef } from './defs';
import { FRIEND_OPINION, mutualOpinion, traitFactor, traitValue } from './social';
import type { Simulation } from './simulation';
import { Colonist, Health } from './types';

interface DiseaseDef {
  label: string;
  description: string;
  severityPerHour: number;
  immunityPerHour: number;
}

export const DISEASES: Record<string, DiseaseDef> = diseasesJson;

export type DamageKind = 'arrow' | 'cut' | 'bruise' | 'burn';

const DEFAULT_PAIN_THRESHOLD = 0.8;
// Bleeding per hour as a fraction of the wound's severity.
const BLEED_RATE = 0.18;
const FATAL_INJURIES = 1.6;
const DOWNED_BLOOD_LOSS = 0.6;
const BLOOD_REGEN_PER_HOUR = 0.06;
const CLOT_PER_HOUR = 0.15;
// Below this a wound has stopped bleeding.
const CLOTTED = 0.005;

export const healthyState = (): Health => ({
  injuries: [],
  bloodLoss: 0,
  disease: null,
  downed: false,
  dead: false,
  hypothermia: 0,
  heatstroke: 0,
  poisoned: 0,
});

// Exposure builds up this fast per degree beyond the comfortable range, per hour.
const EXPOSURE_PER_DEGREE_HOUR = 0.006;
// And eases this fast per hour once comfortable again.
const EXPOSURE_RECOVERY = 0.3;
// Hours a bout of food poisoning lasts.
export const POISONING_HOURS = 10;

export function painOf(c: Colonist): number {
  const h = c.health;
  const injuries = h.injuries.reduce((sum, injury) => sum + injury.severity, 0);
  return injuries + (h.disease?.severity ?? 0) * 0.4 + (h.hypothermia + h.heatstroke) * 0.6;
}

export function bleedingOf(c: Colonist): number {
  return c.health.injuries.reduce((sum, injury) => sum + (injury.tended > 0 ? 0 : injury.bleeding), 0);
}

export function needsTending(sim: Simulation, c: Colonist): boolean {
  const h = c.health;
  return !h.dead && (h.injuries.some((i) => i.tended === 0) || (!!h.disease && h.disease.tendedUntil <= sim.tick));
}

// Whether a colonist should stop working and rest in bed.
export function needsBedRest(c: Colonist): boolean {
  return !!c.health.disease || bleedingOf(c) > 0 || painOf(c) > 0.25;
}

// Work speed multiplier from pain and illness.
export function healthFactor(c: Colonist): number {
  return Math.max(0.3, 1 - painOf(c) * 0.5) * (c.health.poisoned > 0 ? 0.65 : 1) * (starving(c) ? STARVING_WORK : 1);
}

// A colonist with nothing left in the tank works and walks slower until they eat. It doesn't kill.
export const STARVING_WORK = 0.8;
export const STARVING_MOVE = 0.9;
export const starving = (c: Colonist): boolean => c.needs.food <= 0;

// Cold or heat beyond what a colonist's clothes can handle slowly builds into hypothermia or
// heatstroke; it eases again somewhere comfortable.
export function updateExposure(sim: Simulation, c: Colonist, hours: number): void {
  const h = c.health;
  if (h.dead) {
    return;
  }
  // Rain soaks through clothes: out in it, it feels colder.
  const t = sim.temperatureAt(c.tile) - (isWet(sim, c.tile) ? WET_CHILL : 0);
  const { min, max } = comfortRange(c);
  h.hypothermia =
    t < min
      ? Math.min(1, h.hypothermia + (min - t) * EXPOSURE_PER_DEGREE_HOUR * hours)
      : Math.max(0, h.hypothermia - EXPOSURE_RECOVERY * hours);
  h.heatstroke =
    t > max
      ? Math.min(1, h.heatstroke + (t - max) * EXPOSURE_PER_DEGREE_HOUR * hours)
      : Math.max(0, h.heatstroke - EXPOSURE_RECOVERY * hours);
}

export function damage(sim: Simulation, c: Colonist, amount: number, kind: DamageKind): void {
  if (c.health.dead) {
    return;
  }
  const severity = amount * traitFactor(c, 'damageTaken');
  const label = { arrow: 'Arrow wound', cut: 'Cut', bruise: 'Bruise', burn: 'Burn' }[kind];
  // Bruises and burns hurt but don't bleed.
  const bleeds = kind === 'arrow' || kind === 'cut';
  c.health.injuries.push({ label, severity, bleeding: bleeds ? severity * BLEED_RATE : 0, tended: 0 });
  checkHealth(sim, c);
}

export function infect(sim: Simulation, c: Colonist, key: string): void {
  if (c.health.dead || c.health.disease) {
    return;
  }
  c.health.disease = { key, label: DISEASES[key].label, severity: 0.05, immunity: 0, tendedUntil: 0 };
}

export function tend(sim: Simulation, doctor: Colonist, patient: Colonist, medicine: boolean): void {
  const selfTreatment = doctor === patient ? 0.7 : 1;
  const quality = Math.max(
    0.1,
    Math.min(
      1,
      (0.3 + doctor.skills.medicine * 0.04 + (medicine ? 0.25 : 0) + (sim.isResearched('fieldMedicine') ? 0.15 : 0)) *
        selfTreatment,
    ),
  );
  for (const injury of patient.health.injuries) {
    if (injury.tended === 0) {
      injury.tended = quality;
    }
  }
  if (patient.health.disease) {
    patient.health.disease.tendedUntil = sim.tick + 12 * TICKS_PER_HOUR;
  }
  sim.stats.tended++;
  const who = doctor === patient ? 'themself' : patient.name;
  sim.addLog(`${doctor.name} tended ${who}${medicine ? ' with herbal medicine' : ''}.`);
}

// Advances bleeding, healing and disease by `hours`.
export function updateHealth(sim: Simulation, c: Colonist, hours: number): void {
  const h = c.health;
  if (h.dead) {
    return;
  }
  const bleeding = bleedingOf(c);
  h.bloodLoss = bleeding > 0 ? h.bloodLoss + bleeding * hours : Math.max(0, h.bloodLoss - BLOOD_REGEN_PER_HOUR * hours);

  // Untended wounds slowly clot: light wounds stop on their own, many wounds still kill.
  for (const injury of h.injuries) {
    if (injury.tended === 0) {
      injury.bleeding *= Math.max(0, 1 - CLOT_PER_HOUR * hours);
      if (injury.bleeding < CLOTTED) {
        injury.bleeding = 0;
      }
    }
  }
  h.poisoned = Math.max(0, h.poisoned - hours);
  // Lying still, asleep or downed, helps the body mend.
  const restBonus = c.sleeping || h.downed ? 1.5 : 1;
  for (const injury of h.injuries) {
    const rate = injury.tended > 0 ? 0.015 + 0.03 * injury.tended : 0.004;
    injury.severity -= rate * restBonus * hours;
  }
  h.injuries = h.injuries.filter((injury) => injury.severity > 0);

  if (h.disease) {
    const def = DISEASES[h.disease.key];
    const tended = h.disease.tendedUntil > sim.tick;
    h.disease.severity += def.severityPerHour * (tended ? 0.45 : 1) * hours;
    h.disease.immunity += def.immunityPerHour * restBonus * hours;
    if (h.disease.immunity >= 1 && h.disease.severity < 1) {
      sim.addLog(`${c.name} has recovered from ${h.disease.label.toLowerCase()}.`, 'good', true);
      h.disease = null;
    }
  }
  checkHealth(sim, c);
}

// Applies collapse, recovery and death.
export function checkHealth(sim: Simulation, c: Colonist): void {
  const h = c.health;
  if (h.dead) {
    return;
  }
  const injuries = h.injuries.reduce((sum, injury) => sum + injury.severity, 0);
  if (h.bloodLoss >= 1) {
    die(sim, c, 'blood loss');
    return;
  }
  if (injuries >= FATAL_INJURIES) {
    die(sim, c, 'their wounds');
    return;
  }
  if (h.disease && h.disease.severity >= 1) {
    die(sim, c, h.disease.label.toLowerCase());
    return;
  }
  if (h.hypothermia >= 1 || h.heatstroke >= 1) {
    die(sim, c, h.hypothermia >= 1 ? 'hypothermia' : 'heatstroke');
    return;
  }
  const threshold = traitValue(c, 'painThreshold') ?? DEFAULT_PAIN_THRESHOLD;
  // Once down, a colonist stays down until clearly better, rather than flickering at the threshold.
  const recovery = h.downed ? 0.75 : 1;
  const downed = painOf(c) > threshold * recovery || h.bloodLoss > DOWNED_BLOOD_LOSS * recovery;
  if (downed && !h.downed) {
    sim.endJob(c);
    sim.dropCarried(c);
    // In a raid, collapses go to the log only; the raid's own card covers it.
    sim.addLog(`${c.name} has collapsed and needs a doctor.`, 'danger', !sim.raid);
    if (!sim.raid) {
      sim.events.push('collapse');
    }
  } else if (!downed && h.downed) {
    sim.addLog(`${c.name} is back on their feet.`, 'good');
  }
  h.downed = downed;
}

function die(sim: Simulation, c: Colonist, cause: string): void {
  sim.endJob(c);
  sim.dropCarried(c);
  const weapon = weaponDef(c.weapon).item;
  if (weapon !== undefined) {
    sim.world.dropItemNear(c.tile, weapon, 1, undefined, c.weaponQuality);
    c.weapon = 'fists';
  }
  if (c.armor) {
    sim.world.dropItemNear(c.tile, c.armor.item, 1, c.armor.wear, c.armor.quality);
    c.armor = null;
  }
  if (c.apparel) {
    sim.world.dropItemNear(c.tile, c.apparel.item, 1, c.apparel.wear, c.apparel.quality);
    c.apparel = null;
  }
  if (c.tool) {
    sim.world.dropItemNear(c.tile, itemId('toolKit'), 1, c.tool.wear, c.tool.quality);
    c.tool = null;
  }
  c.health.dead = true;
  c.health.downed = false;
  c.drafted = false;
  sim.addLog(`${c.name} has died of ${cause}.`, 'danger', true);
  sim.events.push('death');
  for (const other of sim.living()) {
    if (other.lover === c.id) {
      other.lover = -1;
      sim.addThought(other, 'loverDied');
    } else if (mutualOpinion(other, c) >= FRIEND_OPINION) {
      sim.addThought(other, 'friendDied');
    } else {
      sim.addThought(other, 'colonistDied');
    }
  }
  c.lover = -1;
  if (sim.living().length === 0) {
    sim.addLog('Every colonist has died. The colony is lost.', 'danger', true);
  }
}
