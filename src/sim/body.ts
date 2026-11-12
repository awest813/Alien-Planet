import { ailmentAim, ailmentMove, ailmentPain, ailmentWork } from './ageing';
import type { Simulation } from './simulation';
import { Colonist, Injury } from './types';

// Bodies: wounds land on body parts; untended (or dirtily tended) wounds can get infected and worsen
// until a doctor treats them; and a bad wound can leave a lasting mark when it heals: a limp, a stiff
// hand, a lost eye, or a scar that aches.

export type BodyPart = 'torso' | 'arm' | 'leg' | 'hand' | 'head' | 'eye';
export type ScarKind = 'limp' | 'stiffHand' | 'lostEye' | 'scar';
export interface Scar {
  part: BodyPart;
  kind: ScarKind;
}

const PART_WEIGHTS: [BodyPart, number][] = [
  ['torso', 35],
  ['arm', 20],
  ['leg', 20],
  ['hand', 10],
  ['head', 10],
  ['eye', 5],
];
export const PART_LABELS: Record<BodyPart, string> = {
  torso: 'torso',
  arm: 'arm',
  leg: 'leg',
  hand: 'hand',
  head: 'head',
  eye: 'eye',
};
const LASTING: Record<BodyPart, ScarKind> = {
  torso: 'scar',
  head: 'scar',
  arm: 'stiffHand',
  hand: 'stiffHand',
  leg: 'limp',
  eye: 'lostEye',
};
export const SCAR_LABELS: Record<ScarKind, string> = {
  limp: 'Limp: walks slower',
  stiffHand: 'Stiff hand: works slower',
  lostEye: 'Lost eye: aims worse',
  scar: 'Old scar: aches now and then',
};

// Wounds this bad may leave a mark when they heal.
export const LASTING_FROM = 0.2;
// Infection: the chance per hour a wound turns bad (untended, tended in a mess, tended cleanly), how
// fast it spreads, and how much worse it makes the wound while untreated.
const INFECTION_UNTENDED = 0.006;
const INFECTION_DIRTY = 0.003;
const INFECTION_CLEAN = 0.001;
const INFECTION_SPREAD = 0.04;
const INFECTION_WORSENS = 0.012;
// Wounds too small to fester.
const INFECTION_MIN_SEVERITY = 0.12;
// A hospital bed halves the risk of infection and speeds healing.
export const HOSPITAL_HEALING = 1.5;
export const HOSPITAL_TENDING = 0.15;

export function rollPart(sim: Simulation): BodyPart {
  const total = PART_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = sim.rng.next() * total;
  for (const [part, w] of PART_WEIGHTS) {
    roll -= w;
    if (roll < 0) {
      return part;
    }
  }
  return 'torso';
}

export const scarsOf = (c: Colonist): Scar[] => c.health.scars ?? [];
const count = (c: Colonist, kind: ScarKind) => scarsOf(c).filter((s) => s.kind === kind).length;

// What lasting injuries (and the aches of old age) do: walking and working pace, aim, and a little
// standing pain. Fitted (prosthetics research), a limp, a stiff hand or a lost eye costs half as much.
export const scarMove = (c: Colonist, fitted = false): number =>
  (fitted ? 0.925 : 0.85) ** count(c, 'limp') * ailmentMove(c);
export const scarWork = (c: Colonist, fitted = false): number =>
  (fitted ? 0.95 : 0.9) ** count(c, 'stiffHand') * ailmentWork(c);
export const scarAim = (c: Colonist, fitted = false): number =>
  (fitted ? -0.06 : -0.12) * count(c, 'lostEye') + ailmentAim(c);
export const scarPain = (c: Colonist): number => 0.03 * count(c, 'scar') + ailmentPain(c);

export const isInfected = (injury: Injury): boolean => (injury.infection ?? 0) > 0 && !injury.treated;

// Whether a colonist lies in a hospital bed.
export function inHospitalBed(sim: Simulation, c: Colonist): boolean {
  const f = sim.world.feature[c.tile];
  return f !== 0 && sim.isHospitalBed(c.tile) && (c.sleeping || c.health.downed || c.job?.type === 'rest');
}

// Advances infection and healing for one injury by `hours`; returns the healing rate to apply (which an
// untreated infection turns into worsening).
export function infectionStep(sim: Simulation, c: Colonist, injury: Injury, hours: number, hospital: boolean): number {
  // Only open wounds fester (a bruise or a burn doesn't).
  const open = injury.label === 'Cut' || injury.label === 'Arrow wound';
  if (open && (injury.infection ?? 0) === 0 && injury.severity >= INFECTION_MIN_SEVERITY) {
    const risk = injury.tended === 0 ? INFECTION_UNTENDED : injury.dirty ? INFECTION_DIRTY : INFECTION_CLEAN;
    const care = (sim.isResearched('herbalism') ? 0.45 : 1) * (sim.isResearched('antiseptics') ? 0.5 : 1);
    if (sim.rng.next() < risk * hours * (hospital ? 0.5 : 1) * care) {
      injury.infection = 0.01;
      injury.treated = false;
      sim.stats.infections = (sim.stats.infections ?? 0) + 1;
      sim.addLog(`${c.name}'s ${PART_LABELS[injury.part ?? 'torso']} wound has become infected.`, 'warn', true, {
        colonist: c.id,
      });
    }
  }
  if (isInfected(injury)) {
    injury.infection = Math.min(1, injury.infection! + INFECTION_SPREAD * hours);
    injury.severity += INFECTION_WORSENS * hours;
    return 0;
  }
  if (injury.treated && (injury.infection ?? 0) > 0) {
    injury.infection = Math.max(0, injury.infection! - INFECTION_SPREAD * hours);
  }
  return 1;
}

// A wound has healed: a bad one (worse if poorly tended or infected) may leave a lasting mark.
export function healed(sim: Simulation, c: Colonist, injury: Injury): void {
  const peak = injury.peak ?? injury.severity;
  if (peak < LASTING_FROM || !injury.part) {
    return;
  }
  const chance =
    ((peak - LASTING_FROM + 0.1) * 1.2 * (1 - injury.tended * 0.6) + (injury.wasInfected ? 0.25 : 0)) *
    (sim.isResearched('surgery') ? 0.5 : 1);
  if (sim.rng.next() >= chance) {
    return;
  }
  const kind = LASTING[injury.part];
  const scars = (c.health.scars ??= []);
  scars.push({ part: injury.part, kind });
  sim.stats.scars = (sim.stats.scars ?? 0) + 1;
  sim.addThought(c, 'lastingInjury');
  sim.addLog(
    `${c.name}'s ${PART_LABELS[injury.part]} wound has healed, but left a mark: ${SCAR_LABELS[kind].split(':')[0].toLowerCase()}.`,
    'warn',
    true,
  );
}
