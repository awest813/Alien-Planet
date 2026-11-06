// Tunes for the colony's instruments, worked out without any sound: what to play and when. The
// audio module turns these notes into sound. Everything is seeded, so a colonist keeps their own
// style, and skill shows: a beginner hits wrong notes and loses the beat.

import { hash2 } from '../sim/rng';

export type InstrumentKey = 'drum' | 'flute' | 'lute' | 'harp';

export interface Note {
  // Start, in beats from the start of the phrase.
  beat: number;
  // Length in beats.
  length: number;
  // MIDI note number (60 is middle C); ignored for the drum, which uses it only for a high or low hit.
  pitch: number;
  // 0..1.
  velocity: number;
}

// Major pentatonic: hard to make sound bad, which suits a frontier colony.
const PENTATONIC = [0, 2, 4, 7, 9];
// Where each instrument sits.
const ROOT: Record<InstrumentKey, number> = { drum: 48, flute: 72, lute: 60, harp: 55 };
const SPAN: Record<InstrumentKey, number> = { drum: 2, flute: 8, lute: 9, harp: 12 };

export const isInstrument = (key: string): key is InstrumentKey => key in ROOT;

// Beats per minute: steadier and a little brisker with skill.
export const tempoFor = (skill: number): number => 84 + Math.min(20, Math.max(0, skill)) * 1.5;

// Pitch of a MIDI note in hertz.
export const frequency = (pitch: number): number => 440 * Math.pow(2, (pitch - 69) / 12);

// One eight-beat phrase. `seed` picks the player's style; `phrase` moves the tune along.
export function phrase(instrument: InstrumentKey, skill: number, seed: number, index: number): Note[] {
  const rand = (k: number) => hash2(seed * 31 + index, k, 7919);
  const clean = Math.min(1, Math.max(0, skill) / 12);
  const notes: Note[] = [];
  if (instrument === 'drum') {
    // A beat on every beat, a low hit on one and three, fills when it suits them.
    for (let beat = 0; beat < 8; beat++) {
      notes.push({ beat, length: 0.5, pitch: beat % 4 === 0 ? 0 : 1, velocity: beat % 2 === 0 ? 0.9 : 0.6 });
      if (rand(100 + beat) < 0.3) {
        notes.push({ beat: beat + 0.5, length: 0.25, pitch: 1, velocity: 0.45 });
      }
    }
  } else {
    // A wandering line in the scale: mostly steps, now and then a leap, ending back home.
    let degree = Math.floor(rand(1) * PENTATONIC.length);
    let beat = 0;
    let k = 2;
    while (beat < 8) {
      const length = beat >= 6 ? 8 - beat : rand(k++) < 0.6 ? 1 : rand(k++) < 0.5 ? 0.5 : 2;
      const leap = rand(k++) < 0.2 ? 3 : 1;
      degree += (rand(k++) < 0.5 ? -1 : 1) * leap;
      degree = Math.max(0, Math.min(Math.floor((SPAN[instrument] / 12) * PENTATONIC.length) + 2, degree));
      const finalNote = beat + length >= 8;
      const step = finalNote ? 0 : degree;
      const octave = Math.floor(step / PENTATONIC.length);
      let pitch = ROOT[instrument] + octave * 12 + PENTATONIC[step % PENTATONIC.length];
      // A beginner sometimes hits the note next door.
      if (rand(k++) > clean * 0.9 + 0.1) {
        pitch += rand(k++) < 0.5 ? -1 : 1;
      }
      notes.push({ beat, length: Math.min(length, 8 - beat), pitch, velocity: 0.55 + rand(k++) * 0.3 });
      beat += length;
    }
  }
  // Timing: a beginner drifts off the beat.
  const drift = (1 - clean) * 0.12;
  return notes.map((n, i) => ({ ...n, beat: Math.max(0, n.beat + (rand(500 + i) - 0.5) * 2 * drift) }));
}
