import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A stand-in for Web Audio that records what's made and started, so the sound's decisions can be checked
// without a browser.
const started: { kind: string; when: number }[] = [];
let clock = 0;

class FakeParam {
  public value = 0;
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
}

class FakeNode {
  constructor(public kind: string) {}
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  pan = new FakeParam();
  detune = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  type = '';
  buffer: unknown = null;
  loop = false;
  connect<T>(next: T): T {
    return next;
  }
  start(when = 0) {
    started.push({ kind: this.kind, when });
  }
  stop() {}
}

class FakeContext {
  public state = 'running';
  public sampleRate = 8000;
  public destination = new FakeNode('destination');
  get currentTime() {
    return clock;
  }
  createGain = () => new FakeNode('gain');
  createOscillator = () => new FakeNode('osc');
  createBufferSource = () => new FakeNode('noise');
  createBiquadFilter = () => new FakeNode('filter');
  createStereoPanner = () => new FakeNode('panner');
  createDynamicsCompressor = () => new FakeNode('limiter');
  createBuffer = (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  resume = () => Promise.resolve();
  suspend = () => Promise.resolve();
}

const scene = (patch: Partial<import('./audio').SoundScene> = {}): import('./audio').SoundScene => ({
  musicians: [],
  paused: false,
  night: false,
  rain: true, // (No birdsong in the counts.)
  storm: false,
  cold: false,
  shots: [],
  workers: [],
  fire: 0,
  speed: 1,
  mood: 'day',
  wind: 0.45,
  ...patch,
});

let sound: typeof import('./audio').sound;
const g = globalThis as unknown as { window?: unknown };
const hadWindow = 'window' in g;

beforeAll(async () => {
  g.window ??= { AudioContext: FakeContext, addEventListener() {}, removeEventListener() {} };
  ({ sound } = await import('./audio'));
  // (The soundtrack off, so the counts below are the sounds' own.)
  sound.configure({ enabled: true, score: false, master: 0.7, music: 0.8, effects: 0.8 });
});

afterAll(() => {
  if (!hadWindow) {
    delete g.window;
  }
});

const sinceNow = (from: number) => started.slice(from);

describe('sound', () => {
  it('the same alert twice in a moment is played once', () => {
    // (Three colonists dying in one fight rang the knell three times over itself.)
    clock = 10;
    const from = started.length;
    sound.alert('death');
    sound.alert('death');
    expect(sinceNow(from).filter((s) => s.kind === 'osc')).toHaveLength(2); // one falling pair
    clock = 13;
    sound.alert('death');
    expect(sinceNow(from).filter((s) => s.kind === 'osc')).toHaveLength(4);
  });

  it('work is heard in strokes, a few a second however many are at it', () => {
    clock = 20;
    const workers = Array.from({ length: 4 }, (_, id) => ({ id, kind: 'build' as const, pan: 0 }));
    const from = started.length;
    for (let frame = 0; frame < 60; frame++) {
      clock = 20 + frame / 60;
      sound.update(scene({ workers }));
    }
    const strokes = sinceNow(from).filter((s) => s.kind === 'osc').length;
    // Four hammers at two strokes a second would be eight; at most five are heard.
    expect(strokes).toBeGreaterThanOrEqual(3);
    expect(strokes).toBeLessThanOrEqual(5);
  });

  it('nothing is struck while the game is paused', () => {
    clock = 30;
    const from = started.length;
    for (let frame = 0; frame < 60; frame++) {
      clock = 30 + frame / 60;
      sound.update(scene({ paused: true, workers: [{ id: 1, kind: 'chop', pan: 0.5 }] }));
    }
    expect(sinceNow(from).filter((s) => s.kind === 'osc')).toHaveLength(0);
  });

  it('a fire in view crackles', () => {
    clock = 40;
    const from = started.length;
    for (let frame = 0; frame < 60; frame++) {
      clock = 40 + frame / 60;
      sound.update(scene({ fire: 1 }));
    }
    expect(sinceNow(from).filter((s) => s.kind === 'noise').length).toBeGreaterThan(2);
  });

  it('animals in view call now and then in their own time; a wolf by day only when after someone', () => {
    clock = 500;
    const from = started.length;
    const deer = { id: 1, kind: 'deer', pan: 0, angry: false };
    const wolf = { id: 2, kind: 'wolf', pan: 0.5, angry: false };
    // A minute with a deer and a calm wolf in view, by day: the deer calls a couple of times, the wolf not at all.
    for (let frame = 0; frame < 60 * 60; frame++) {
      clock = 500 + frame / 60;
      sound.update(scene({ creatures: [deer, wolf] }));
    }
    const calls = sinceNow(from).filter((s) => s.kind === 'osc').length;
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(calls).toBeLessThanOrEqual(10);
    // The wolf after someone: it snarls every couple of seconds.
    const angry = started.length;
    for (let frame = 0; frame < 60 * 10; frame++) {
      clock = 560 + frame / 60;
      sound.update(scene({ creatures: [{ ...wolf, angry: true }] }));
    }
    expect(sinceNow(angry).filter((s) => s.kind === 'osc').length).toBeGreaterThanOrEqual(3);
    // Paused, nothing.
    const paused = started.length;
    for (let frame = 0; frame < 60 * 10; frame++) {
      clock = 570 + frame / 60;
      sound.update(scene({ paused: true, creatures: [{ ...wolf, angry: true }] }));
    }
    expect(sinceNow(paused)).toHaveLength(0);
  });

  it('colonists in company murmur, one at a time; one alone says nothing; the struck cry out, a few a second', () => {
    clock = 700;
    const alone = started.length;
    for (let frame = 0; frame < 60 * 10; frame++) {
      clock = 700 + frame / 60;
      sound.update(scene({ talkers: [{ id: 1, pan: 0, pitch: 150 }] }));
    }
    expect(sinceNow(alone)).toHaveLength(0);
    const together = started.length;
    for (let frame = 0; frame < 60 * 10; frame++) {
      clock = 710 + frame / 60;
      sound.update(
        scene({
          talkers: [
            { id: 1, pan: 0, pitch: 150 },
            { id: 2, pan: 0.2, pitch: 210 },
          ],
        }),
      );
    }
    // Ten seconds: a few phrases of a few syllables each, not a babble.
    const syllables = sinceNow(together).filter((s) => s.kind === 'osc').length;
    expect(syllables).toBeGreaterThanOrEqual(4);
    expect(syllables).toBeLessThanOrEqual(40);
    // A dozen blows landing at once: three cries, not twelve.
    clock = 730;
    const blows = started.length;
    const hit = { ranged: false, hit: true, pan: 0, struck: { who: 'colonist' as const, pitch: 150 } };
    sound.update(scene({ shots: Array.from({ length: 12 }, () => hit) }));
    // (Each blow is heard as a thud, a noise; each cry is one voice and a breath.)
    const cries = sinceNow(blows).filter((s) => s.kind === 'osc').length;
    expect(cries).toBe(3);
  });

  it('the soundtrack plays bar on bar, without a burst after a long gap', () => {
    sound.configure({ enabled: true, score: true, master: 0.7, music: 0.8, effects: 0.8 });
    clock = 100;
    const from = started.length;
    for (let frame = 0; frame < 60 * 12; frame++) {
      clock = 100 + frame / 60;
      sound.update(scene({ paused: true }));
    }
    // Twelve seconds of day: two or three bars, each a pad of six voices and a few notes.
    const bars = sinceNow(from).filter((s) => s.kind === 'osc').length;
    expect(bars).toBeGreaterThanOrEqual(12);
    expect(bars).toBeLessThanOrEqual(60);
    // An hour away (a hidden tab): it picks up from now, not with a hundred bars at once.
    clock = 4000;
    const later = started.length;
    sound.update(scene({ paused: true }));
    expect(sinceNow(later).filter((s) => s.kind === 'osc').length).toBeLessThanOrEqual(12);
    sound.configure({ enabled: true, score: false, master: 0.7, music: 0.8, effects: 0.8 });
  });
});
