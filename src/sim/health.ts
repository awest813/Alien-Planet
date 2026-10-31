import diseasesJson from '../data/diseases.json';
import { TICKS_PER_HOUR } from './constants';
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

export type DamageKind = 'arrow' | 'cut' | 'bruise';

const DEFAULT_PAIN_THRESHOLD = 0.8;
// Bleeding per hour as a fraction of the wound's severity.
const BLEED_RATE = 0.18;
const FATAL_INJURIES = 1.6;
const DOWNED_BLOOD_LOSS = 0.6;
const BLOOD_REGEN_PER_HOUR = 0.06;
const CLOT_PER_HOUR = 0.15;

export const healthyState = (): Health => ({ injuries: [], bloodLoss: 0, disease: null, downed: false, dead: false });

export function painOf(c: Colonist): number {
  const injuries = c.health.injuries.reduce((sum, injury) => sum + injury.severity, 0);
  return injuries + (c.health.disease?.severity ?? 0) * 0.4;
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
  return Math.max(0.3, 1 - painOf(c) * 0.5);
}

export function damage(sim: Simulation, c: Colonist, amount: number, kind: DamageKind): void {
  if (c.health.dead) {
    return;
  }
  const severity = amount * traitFactor(c, 'damageTaken');
  const label = kind === 'arrow' ? 'Arrow wound' : kind === 'cut' ? 'Cut' : 'Bruise';
  c.health.injuries.push({ label, severity, bleeding: kind === 'bruise' ? 0 : severity * BLEED_RATE, tended: 0 });
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
    Math.min(1, (0.3 + doctor.skills.medicine * 0.05 + (medicine ? 0.25 : 0)) * selfTreatment),
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
    }
  }
  const restBonus = c.sleeping ? 1.5 : 1;
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
  const threshold = traitValue(c, 'painThreshold') ?? DEFAULT_PAIN_THRESHOLD;
  // Once down, a colonist stays down until clearly better, rather than flickering at the threshold.
  const recovery = h.downed ? 0.75 : 1;
  const downed = painOf(c) > threshold * recovery || h.bloodLoss > DOWNED_BLOOD_LOSS * recovery;
  if (downed && !h.downed) {
    sim.endJob(c);
    sim.dropCarried(c);
    sim.addLog(`${c.name} has collapsed and needs a doctor.`, 'danger', true);
  } else if (!downed && h.downed) {
    sim.addLog(`${c.name} is back on their feet.`, 'good');
  }
  h.downed = downed;
}

function die(sim: Simulation, c: Colonist, cause: string): void {
  sim.endJob(c);
  sim.dropCarried(c);
  c.health.dead = true;
  c.health.downed = false;
  c.drafted = false;
  sim.addLog(`${c.name} has died of ${cause}.`, 'danger', true);
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
