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
  ...patch,
});

let sound: typeof import('./audio').sound;
const g = globalThis as unknown as { window?: unknown };
const hadWindow = 'window' in g;

beforeAll(async () => {
  g.window ??= { AudioContext: FakeContext, addEventListener() {}, removeEventListener() {} };
  ({ sound } = await import('./audio'));
  sound.configure({ enabled: true, master: 0.7, music: 0.8, effects: 0.8 });
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
});
