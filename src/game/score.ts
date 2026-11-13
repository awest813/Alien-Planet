// The colony's soundtrack, worked out without any sound: slow pad chords and now and then a few harp notes, in
// the same key as the colonists' own playing (C major pentatonic). Its mood follows the colony: unhurried by
// day, lower and slower at night, sparse in winter, and a low drone with a pulse while there's fighting.
// The audio module plays what this returns.

import { hash2 } from '../sim/rng';

export type Mood = 'day' | 'night' | 'winter' | 'danger';

export interface Bar {
  // How long it lasts, in seconds.
  seconds: number;
  // The pad's notes (MIDI numbers), held for the whole bar.
  chord: number[];
  // Harp notes: start in seconds from the bar's start, and pitch.
  melody: { at: number; pitch: number }[];
  // Low drum hits (danger only): start in seconds.
  pulse: number[];
  // 0..1, how loud the bar is played.
  level: number;
}

// Root-position chords voiced low and close: C, Am, F, G, Em, Dm.
const CHORDS: Record<string, number[]> = {
  C: [48, 55, 64],
  Am: [45, 52, 60],
  F: [41, 48, 57],
  G: [43, 50, 59],
  Em: [40, 47, 55],
  Dm: [38, 45, 53],
};

const PROGRESSIONS: Record<Mood, string[][]> = {
  day: [
    ['C', 'Am', 'F', 'G'],
    ['C', 'F', 'Am', 'G'],
    ['F', 'C', 'G', 'Am'],
  ],
  night: [
    ['Am', 'F', 'C', 'G'],
    ['Am', 'Em', 'F', 'C'],
  ],
  winter: [
    ['Am', 'C', 'F', 'C'],
    ['Dm', 'Am', 'F', 'Am'],
  ],
  danger: [['Am', 'Am', 'F', 'Em']],
};

const SECONDS: Record<Mood, number> = { day: 5, night: 7, winter: 8, danger: 3.2 };
const LEVEL: Record<Mood, number> = { day: 1, night: 0.8, winter: 0.7, danger: 1 };
// Harp notes a bar, at most (it may play fewer, or none).
const NOTES: Record<Mood, number> = { day: 3, night: 2, winter: 1, danger: 0 };
// C major pentatonic, from the C above middle C.
const SCALE = [72, 74, 76, 79, 81, 84];

// The bar `index` of a piece in this mood; `seed` picks the progression and the tune.
export function scoreBar(mood: Mood, index: number, seed: number): Bar {
  const options = PROGRESSIONS[mood];
  // A new progression every four bars, so it doesn't loop one forever.
  const phrase = Math.floor(index / 4);
  const progression = options[Math.floor(hash2(seed, phrase, 3) * options.length) % options.length];
  const name = progression[index % 4];
  const chord = CHORDS[name];
  const seconds = SECONDS[mood];
  const melody: Bar['melody'] = [];
  const notes = Math.floor(hash2(seed, index, 5) * (NOTES[mood] + 1));
  // Notes of the scale that sound well over this chord (its own tones, plus the scale's others over C and Am).
  const fits = SCALE.filter((p) => chord.some((c) => (p - c) % 12 === 0) || name === 'C' || name === 'Am');
  for (let k = 0; k < notes; k++) {
    const at = Math.round(hash2(seed + k, index, 7) * 6) * (seconds / 8);
    const pitch = fits[Math.floor(hash2(seed + k, index, 11) * fits.length) % fits.length];
    if (!melody.some((m) => m.at === at)) {
      melody.push({ at, pitch: mood === 'night' ? pitch - 12 : pitch });
    }
  }
  melody.sort((a, b) => a.at - b.at);
  const pulse = mood === 'danger' ? [0, seconds / 4, seconds / 2, (seconds * 3) / 4] : [];
  return { seconds, chord: mood === 'danger' ? [45, 52] : chord, melody, pulse, level: LEVEL[mood] };
}
