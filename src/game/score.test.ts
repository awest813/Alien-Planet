import { describe, expect, it } from 'vitest';
import { Mood, scoreBar } from './score';

const PENTATONIC = new Set([0, 2, 4, 7, 9]);

describe('the soundtrack', () => {
  it('keeps its tune in the colonists’ key, inside the bar', () => {
    for (const mood of ['day', 'night', 'winter', 'danger'] as Mood[]) {
      for (let bar = 0; bar < 64; bar++) {
        const b = scoreBar(mood, bar, 17);
        expect(b.chord.length).toBeGreaterThan(0);
        for (const note of b.melody) {
          expect(PENTATONIC.has(note.pitch % 12)).toBe(true);
          expect(note.at).toBeGreaterThanOrEqual(0);
          expect(note.at).toBeLessThan(b.seconds);
        }
      }
    }
  });

  it('is slower and sparser at night and in winter, and pulses only in danger', () => {
    const notes = (mood: Mood) =>
      Array.from({ length: 64 }, (_, k) => scoreBar(mood, k, 5).melody.length).reduce((a, b) => a + b, 0);
    expect(scoreBar('night', 0, 1).seconds).toBeGreaterThan(scoreBar('day', 0, 1).seconds);
    expect(notes('winter')).toBeLessThan(notes('day'));
    expect(notes('danger')).toBe(0);
    expect(scoreBar('danger', 3, 1).pulse.length).toBeGreaterThan(0);
    expect(scoreBar('day', 3, 1).pulse).toHaveLength(0);
  });

  it('moves between progressions rather than looping one', () => {
    const chords = new Set(Array.from({ length: 48 }, (_, k) => scoreBar('day', k, 9).chord.join()));
    expect(chords.size).toBeGreaterThanOrEqual(4);
    const openings = new Set(Array.from({ length: 12 }, (_, k) => scoreBar('day', k * 4, 9).chord.join()));
    expect(openings.size).toBeGreaterThan(1);
  });
});
