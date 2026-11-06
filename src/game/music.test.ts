import { describe, expect, it } from 'vitest';
import { frequency, phrase, tempoFor } from './music';

const inScale = (pitch: number) => [0, 2, 4, 7, 9].includes((((pitch - 60) % 12) + 12) % 12);

describe('tunes', () => {
  it('are the same for the same player and phrase, and move on from phrase to phrase', () => {
    expect(phrase('lute', 10, 5, 0)).toEqual(phrase('lute', 10, 5, 0));
    expect(phrase('lute', 10, 5, 1)).not.toEqual(phrase('lute', 10, 5, 0));
    expect(phrase('lute', 10, 6, 0)).not.toEqual(phrase('lute', 10, 5, 0));
  });

  it('fill eight beats and come home to the root at the end', () => {
    for (const instrument of ['flute', 'lute', 'harp'] as const) {
      for (let p = 0; p < 20; p++) {
        const notes = phrase(instrument, 20, 3, p);
        const last = notes[notes.length - 1];
        expect(last.beat + last.length).toBeCloseTo(8, 5);
        expect(inScale(last.pitch)).toBe(true);
        expect(notes.every((n) => n.beat >= 0 && n.length > 0 && n.velocity > 0 && n.velocity <= 1)).toBe(true);
      }
    }
  });

  it('stay in the scale for a master, and wander out of it for a beginner', () => {
    const offKey = (skill: number) => {
      let off = 0;
      let total = 0;
      for (let p = 0; p < 100; p++) {
        for (const n of phrase('flute', skill, 9, p)) {
          total++;
          off += inScale(n.pitch) ? 0 : 1;
        }
      }
      return off / total;
    };
    expect(offKey(20)).toBe(0);
    expect(offKey(1)).toBeGreaterThan(0.2);
  });

  it('keep the beat on the drum, low hits on one and three', () => {
    const notes = phrase('drum', 20, 1, 0);
    expect(notes.filter((n) => n.pitch === 0).map((n) => Math.round(n.beat))).toEqual([0, 4]);
    expect(tempoFor(20)).toBeGreaterThan(tempoFor(0));
    expect(frequency(69)).toBeCloseTo(440);
    expect(frequency(81)).toBeCloseTo(880);
  });
});
