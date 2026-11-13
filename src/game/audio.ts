// The colony's sound, made in code with Web Audio: instruments played by colonists, a little ambience
// (wind, rain, birds by day, crickets by night) and a few alerts. Nothing is created until the
// player turns sound on, and every call is safe without audio support: the game just stays quiet.

import { InstrumentKey, Note, frequency, phrase, tempoFor } from './music';
import { Bar, Mood, scoreBar } from './score';

export interface Musician {
  id: number;
  instrument: InstrumentKey;
  skill: number;
  // Whether the player is in view: music off screen is played quietly.
  inView: boolean;
  // Where on screen, left (-1) to right (1).
  pan: number;
}

export type WorkSound = 'chop' | 'mine' | 'build';

// A colonist at work in view: an axe, a pick or a hammer, heard in time with the game's speed.
export interface Worker {
  id: number;
  kind: WorkSound;
  pan: number;
}

export interface SoundScene {
  musicians: Musician[];
  // Game speed is zero: music and ambient calls stop, the wind carries on.
  paused: boolean;
  night: boolean;
  rain: boolean;
  storm: boolean;
  // Hard cold: the birds and crickets fall quiet and the wind picks up.
  cold: boolean;
  // Bowshots and blows landing within view since the last frame (a few at most are heard).
  shots: { ranged: boolean; hit: boolean; pan: number }[];
  // The nearest few colonists chopping, mining or building in view.
  workers: Worker[];
  // How much is burning in view, 0 (nothing) to 1 (a blaze).
  fire: number;
  // How fast the clock runs (1 at normal speed): work keeps time with it.
  speed: number;
  // The soundtrack's mood.
  mood: Mood;
}

export type Alert = 'raid' | 'death' | 'goal' | 'concert' | 'fire' | 'collapse' | 'birth';
// At most this many fight sounds a second, however big the battle.
const FIGHT_SOUNDS_PER_SECOND = 8;
// And of work sounds, however many are at it.
const WORK_SOUNDS_PER_SECOND = 5;
// Seconds between strokes at normal speed: an axe swung, a pick, a hammer's quicker taps.
const WORK_BEAT: Record<WorkSound, number> = { chop: 0.95, mine: 0.8, build: 0.5 };
// The same cue again this soon (three deaths in one fight, fires breaking out together) isn't played twice.
const ALERT_GAP = 1.5;

// Whether sound is on: callers can skip gathering what it needs when it isn't.
export const soundEnabled = (): boolean => sound.isEnabled();

export interface Volumes {
  enabled: boolean;
  // The soundtrack under the colonists' own playing.
  score: boolean;
  master: number;
  music: number;
  effects: number;
}

// How far ahead notes are scheduled, in seconds.
const LOOKAHEAD = 0.25;

interface Playing {
  key: string;
  seed: number;
  phrase: number;
  // When the current phrase started, in audio-context seconds, and its notes still to schedule.
  start: number;
  notes: Note[];
  beat: number;
}

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private wind: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private fireGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private playing = new Map<number, Playing>();
  private volumes: Volumes = { enabled: false, score: true, master: 0.7, music: 0.8, effects: 0.8 };
  private scoreBus: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  // When the soundtrack's next bar starts (audio-context seconds), its number in the piece, and the piece's mood
  // and tune.
  private scoreNext = 0;
  private scoreIndex = 0;
  private scoreMood: Mood | null = null;
  private scoreSeed = Math.floor(Math.random() * 1000);
  private scoreDuck = 1;
  private nextCall = 0;

  // Applies the player's settings. Turning sound on creates the audio graph (it's called from a
  // click, which browsers require before audio may start).
  public configure(volumes: Volumes): void {
    this.volumes = volumes;
    if (volumes.enabled) {
      this.start();
      this.wake();
      // Browsers only let audio start after the player interacts with the page (sound left on from a
      // last visit): try again on the first tap, click or key press.
      if (this.ctx && this.ctx.state !== 'running' && !this.wakeArmed) {
        this.wakeArmed = true;
        const events = ['pointerdown', 'touchend', 'click', 'keydown'];
        const onGesture = () => {
          this.wake();
          if (this.ctx?.state === 'running' || !this.volumes.enabled) {
            this.wakeArmed = false;
            events.forEach((e) => window.removeEventListener(e, onGesture));
          }
        };
        events.forEach((e) => window.addEventListener(e, onGesture));
      }
    }
    if (this.ctx && this.master && this.musicBus && this.effectsBus) {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(volumes.enabled ? volumes.master : 0, t, 0.05);
      this.musicBus.gain.setTargetAtTime(volumes.music, t, 0.05);
      this.effectsBus.gain.setTargetAtTime(volumes.effects, t, 0.05);
      this.scoreBus!.gain.setTargetAtTime(volumes.score ? this.scoreDuck : 0, t, 0.3);
    }
    if (!volumes.enabled) {
      // Let the fade-out be heard, then stop the audio altogether.
      this.sleepSoon();
    }
  }

  public isEnabled(): boolean {
    return this.volumes.enabled;
  }

  // The page went out of view (another tab, the app minimised): no sound until it's back.
  public setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) {
      void this.ctx?.suspend().catch(() => {});
    } else {
      this.wake();
    }
  }

  private wake(): void {
    if (this.volumes.enabled && !this.hidden && this.ctx && this.ctx.state !== 'running') {
      clearTimeout(this.sleepTimer);
      void this.ctx.resume().catch(() => {});
    }
  }

  private sleepSoon(): void {
    clearTimeout(this.sleepTimer);
    this.sleepTimer = setTimeout(() => {
      if (!this.volumes.enabled) {
        void this.ctx?.suspend().catch(() => {});
      }
    }, 250);
  }

  // When the last fight sounds were played (to keep a battle from becoming a roar).
  private fightSounds: number[] = [];
  private wakeArmed = false;
  private hidden = false;
  private sleepTimer: ReturnType<typeof setTimeout> | undefined;
  // Last levels asked of the wind and rain, so they're only changed when the weather does.
  private windLevel = -1;
  private rainLevel = -1;
  private fireLevel = -1;
  // The wind comes in gusts: when the next one is due.
  private nextGust = 0;
  private nextCrackle = 0;
  // When each colonist at work next strikes, and when the last strokes were heard.
  private strokes = new Map<number, number>();
  private workSounds: number[] = [];
  private lastAlert = new Map<Alert, number>();

  private start(): void {
    if (this.ctx) {
      return;
    }
    try {
      const Context =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) {
        return;
      }
      const ctx = new Context();
      this.ctx = ctx;
      this.master = ctx.createGain();
      // Starts silent and fades up to the chosen volume.
      this.master.gain.value = 0;
      // A limiter last: a concert, a battle and an alert at once mustn't clip.
      const limiter = ctx.createDynamicsCompressor();
      this.limiter = limiter;
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      // (A browser's compressor raises everything by a "make-up gain" of its own: about 4 dB at the first settings
      // tried, measured, a limiter that made the whole game louder. Set high, it adds about 1 dB, trimmed off here.)
      const trim = ctx.createGain();
      trim.gain.value = 0.88;
      this.master.connect(limiter).connect(trim).connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.effectsBus = ctx.createGain();
      this.effectsBus.connect(this.master);
      this.scoreBus = ctx.createGain();
      this.scoreBus.connect(this.musicBus);
      // Two seconds of noise, looped for wind and rain and cut short for drum hits.
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noise = noise;
      [this.wind, this.windFilter] = this.loop(ctx, 'lowpass', 380, 0.5, 0);
      [this.rainGain] = this.loop(ctx, 'bandpass', 2600, 0.6, 0.7);
      // A fire's low roar (its crackle is played over it, a pop at a time).
      [this.fireGain] = this.loop(ctx, 'lowpass', 520, 0.8, 1.3);
    } catch {
      this.ctx = null;
    }
  }

  // A looping noise layer through a filter, starting silent. (Each starts at its own place in the noise, so the
  // layers don't move together.)
  private loop(
    ctx: AudioContext,
    type: BiquadFilterType,
    freq: number,
    q: number,
    offset: number,
  ): [GainNode, BiquadFilterNode] {
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.effectsBus!);
    source.start(0, offset);
    return [gain, filter];
  }

  // Where a sound goes: through a panner to the left or right of the screen, where there is one.
  private output(bus: GainNode, pan: number, when: number): AudioNode {
    const ctx = this.ctx!;
    if (!ctx.createStereoPanner || pan === 0) {
      return bus;
    }
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), when);
    panner.connect(bus);
    return panner;
  }

  // Called every frame: keeps each musician's tune going and the weather in the air.
  public update(scene: SoundScene): void {
    const ctx = this.ctx;
    if (!ctx || !this.volumes.enabled || ctx.state !== 'running') {
      return;
    }
    const now = ctx.currentTime;
    this.keepScoring(scene, now);
    const wind = scene.storm ? 0.22 : scene.rain ? 0.1 : scene.cold ? 0.09 : 0.05;
    const rain = scene.storm ? 0.12 : scene.rain ? 0.07 : 0;
    if (wind !== this.windLevel || rain !== this.rainLevel) {
      this.windLevel = wind;
      this.rainLevel = rain;
      this.rainGain!.gain.setTargetAtTime(rain, now, 1.5);
      this.nextGust = now;
    }
    // The wind rises and falls in gusts, brighter as it rises, rather than one steady hiss.
    if (now >= this.nextGust) {
      const gust = 0.55 + Math.random() * 0.9;
      this.nextGust = now + 2 + Math.random() * 4;
      this.wind!.gain.setTargetAtTime(wind * gust, now, 1.2);
      this.windFilter!.frequency.setTargetAtTime(300 + gust * 160 + (scene.storm ? 200 : 0), now, 1.2);
    }
    const fire = Math.min(1, scene.fire) * 0.14;
    if (fire !== this.fireLevel) {
      this.fireLevel = fire;
      this.fireGain!.gain.setTargetAtTime(fire, now, 0.8);
    }
    if (scene.fire > 0 && now >= this.nextCrackle) {
      this.nextCrackle = now + (0.05 + Math.random() * 0.3) / Math.min(1, 0.3 + scene.fire);
      this.crackle(now + Math.random() * 0.05, Math.min(1, scene.fire));
    }
    if (!scene.paused && now >= this.nextCall) {
      this.nextCall = now + 2 + Math.random() * 6;
      if (!scene.rain && !scene.cold) {
        this.call(scene.night);
      }
    }
    if (!scene.paused) {
      for (const shot of scene.shots) {
        if (this.fightSounds.filter((t) => t > now - 1).length >= FIGHT_SOUNDS_PER_SECOND) {
          break;
        }
        this.fightSounds = this.fightSounds.filter((t) => t > now - 1);
        this.fightSounds.push(now);
        this.fight(shot.ranged, shot.hit, now + Math.random() * 0.04, shot.pan);
      }
      this.keepWorking(scene, now);
    } else {
      this.strokes.clear();
    }
    const here = new Set<number>();
    for (const m of scene.paused ? [] : scene.musicians) {
      here.add(m.id);
      this.keepPlaying(m, now);
    }
    for (const id of [...this.playing.keys()]) {
      if (!here.has(id)) {
        this.playing.delete(id);
      }
    }
  }

  // The soundtrack: bars scheduled a little ahead, a new piece when the mood changes (at the end of the bar
  // playing), quieter under a colonist playing in view.
  private keepScoring(scene: SoundScene, now: number): void {
    if (!this.volumes.score) {
      this.scoreMood = null;
      return;
    }
    const duck = !scene.paused && scene.musicians.some((m) => m.inView) ? 0.25 : 1;
    if (duck !== this.scoreDuck) {
      this.scoreDuck = duck;
      this.scoreBus!.gain.setTargetAtTime(duck, now, 1);
    }
    // Starting, or fell far behind (a hidden tab): from now, rather than a burst of bars to catch up.
    if (this.scoreMood === null || this.scoreNext < now - 1) {
      this.scoreNext = now + 0.1;
    }
    while (this.scoreNext < now + LOOKAHEAD + 0.1) {
      if (scene.mood !== this.scoreMood) {
        this.scoreMood = scene.mood;
        this.scoreIndex = 0;
        this.scoreSeed++;
      }
      const bar = scoreBar(scene.mood, this.scoreIndex++, this.scoreSeed);
      this.playBar(bar, this.scoreNext, scene.mood);
      this.scoreNext += bar.seconds;
    }
  }

  // One bar: a soft pad swelling in and fading into the next, a few harp notes, a drum's low pulse in danger.
  private playBar(bar: Bar, when: number, mood: Mood): void {
    const ctx = this.ctx!;
    const end = when + bar.seconds;
    const pad = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = mood === 'night' || mood === 'winter' ? 650 : 900;
    pad.connect(tone).connect(this.scoreBus!);
    // (A bed under everything: as loud as this, it matched a colonist's lute.)
    const peak = 0.014 * bar.level;
    pad.gain.setValueAtTime(0, when);
    pad.gain.linearRampToValueAtTime(peak, when + Math.min(1.4, bar.seconds / 3));
    pad.gain.setTargetAtTime(0, end - 0.2, 0.5);
    for (const pitch of bar.chord) {
      for (const [type, detune] of [
        ['triangle', 0],
        ['sine', 6],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = frequency(pitch);
        osc.detune.value = detune;
        osc.connect(pad);
        osc.start(when);
        osc.stop(end + 2.5);
      }
    }
    for (const n of bar.melody) {
      const at = when + n.at;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = frequency(n.pitch);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.028 * bar.level, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 2.2);
      const soft = ctx.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 2200;
      osc.connect(soft).connect(gain).connect(this.scoreBus!);
      osc.start(at);
      osc.stop(at + 2.3);
    }
    for (const t of bar.pulse) {
      const at = when + t;
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(75, at);
      osc.frequency.exponentialRampToValueAtTime(42, at + 0.3);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(t === 0 ? 0.08 : 0.045, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
      osc.connect(gain).connect(this.scoreBus!);
      osc.start(at);
      osc.stop(at + 0.45);
    }
  }

  // Each colonist at work strikes in their own time, a little loose, and only a few strokes a second are heard.
  private keepWorking(scene: SoundScene, now: number): void {
    const here = new Set<number>();
    this.workSounds = this.workSounds.filter((t) => t > now - 1);
    for (const w of scene.workers) {
      here.add(w.id);
      const beat = WORK_BEAT[w.kind] / Math.sqrt(Math.max(1, scene.speed));
      let next = this.strokes.get(w.id);
      if (next === undefined) {
        next = now + Math.random() * beat;
      }
      if (next <= now + 0.05) {
        if (this.workSounds.length < WORK_SOUNDS_PER_SECOND) {
          this.workSounds.push(now);
          this.work(w.kind, Math.max(next, now), w.pan);
        }
        next = Math.max(next, now) + beat * (0.9 + Math.random() * 0.2);
      }
      this.strokes.set(w.id, next);
    }
    for (const id of [...this.strokes.keys()]) {
      if (!here.has(id)) {
        this.strokes.delete(id);
      }
    }
  }

  // An axe biting wood, a pick on rock, a hammer on a nail.
  private work(kind: WorkSound, when: number, pan: number): void {
    const ctx = this.ctx!;
    const out = this.output(this.effectsBus!, pan * 0.8, when);
    const hit = ctx.createBufferSource();
    hit.buffer = this.noise;
    const tone = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    if (kind === 'chop') {
      tone.type = 'lowpass';
      tone.frequency.value = 900;
      gain.gain.setValueAtTime(0.035, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.09);
      ring.type = 'sine';
      ring.frequency.setValueAtTime(190, when);
      ring.frequency.exponentialRampToValueAtTime(120, when + 0.1);
      ringGain.gain.setValueAtTime(0.035, when);
      ringGain.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
    } else if (kind === 'mine') {
      tone.type = 'bandpass';
      tone.frequency.value = 3200;
      gain.gain.setValueAtTime(0.05, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
      ring.type = 'triangle';
      ring.frequency.value = 1700 + Math.random() * 300;
      ringGain.gain.setValueAtTime(0.022, when);
      ringGain.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
    } else {
      tone.type = 'bandpass';
      tone.frequency.value = 1800;
      gain.gain.setValueAtTime(0.035, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.03);
      ring.type = 'triangle';
      ring.frequency.setValueAtTime(520, when);
      ring.frequency.exponentialRampToValueAtTime(380, when + 0.06);
      ringGain.gain.setValueAtTime(0.03, when);
      ringGain.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
    }
    hit.connect(tone).connect(gain).connect(out);
    ring.connect(ringGain).connect(out);
    hit.start(when, Math.random());
    hit.stop(when + 0.12);
    ring.start(when);
    ring.stop(when + 0.2);
  }

  // A pop from the fire: a short bright click, now loud, now faint.
  private crackle(when: number, amount: number): void {
    const ctx = this.ctx!;
    const pop = ctx.createBufferSource();
    pop.buffer = this.noise;
    const tone = ctx.createBiquadFilter();
    tone.type = 'highpass';
    tone.frequency.value = 1500 + Math.random() * 2500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime((0.015 + Math.random() * 0.05) * amount, when);
    gain.gain.exponentialRampToValueAtTime(0.0005, when + 0.02 + Math.random() * 0.04);
    pop
      .connect(tone)
      .connect(gain)
      .connect(this.output(this.effectsBus!, (Math.random() - 0.5) * 0.6, when));
    pop.start(when, Math.random() * 1.9);
    pop.stop(when + 0.08);
  }

  private keepPlaying(m: Musician, now: number): void {
    const key = `${m.instrument}:${m.skill}`;
    let p = this.playing.get(m.id);
    if (!p || p.key !== key) {
      p = { key, seed: m.id * 97 + 13, phrase: 0, start: now + 0.05, notes: [], beat: 0 };
      p.notes = phrase(m.instrument, m.skill, p.seed, 0);
      this.playing.set(m.id, p);
    }
    const secondsPerBeat = 60 / tempoFor(m.skill);
    const level = m.inView ? 1 : 0.35;
    // Schedule every note that starts before the look-ahead runs out, rolling on to new phrases.
    for (;;) {
      const next = p.notes[0];
      if (!next) {
        p.phrase++;
        p.start += 8 * secondsPerBeat;
        p.notes = phrase(m.instrument, m.skill, p.seed, p.phrase);
        // Fell far behind (a hidden tab): start afresh rather than catch up.
        if (p.start < now - 1) {
          p.start = now + 0.05;
        }
        continue;
      }
      const when = p.start + next.beat * secondsPerBeat;
      if (when > now + LOOKAHEAD) {
        break;
      }
      p.notes.shift();
      if (when >= now - 0.05) {
        this.note(m.instrument, next, Math.max(when, now), next.length * secondsPerBeat, level, m.pan);
      }
    }
  }

  // One note in the instrument's voice.
  private note(instrument: InstrumentKey, n: Note, when: number, length: number, level: number, pan: number): void {
    const ctx = this.ctx!;
    const bus = this.output(this.musicBus!, pan * 0.7, when);
    const out = ctx.createGain();
    out.connect(bus);
    const peak = n.velocity * level * 0.22;
    if (instrument === 'drum') {
      const body = ctx.createOscillator();
      body.frequency.setValueAtTime(n.pitch === 0 ? 120 : 210, when);
      body.frequency.exponentialRampToValueAtTime(n.pitch === 0 ? 50 : 110, when + 0.15);
      body.connect(out);
      const hit = ctx.createBufferSource();
      hit.buffer = this.noise;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 900;
      const hitGain = ctx.createGain();
      hitGain.gain.setValueAtTime(peak * 0.6, when);
      hitGain.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
      hit.connect(tone).connect(hitGain).connect(bus);
      out.gain.setValueAtTime(peak * 1.6, when);
      out.gain.exponentialRampToValueAtTime(0.001, when + 0.3);
      body.start(when);
      body.stop(when + 0.32);
      hit.start(when, Math.random());
      hit.stop(when + 0.1);
      return;
    }
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency(n.pitch);
    let end = when + length;
    if (instrument === 'flute') {
      osc.type = 'sine';
      const vibrato = ctx.createOscillator();
      const depth = ctx.createGain();
      vibrato.frequency.value = 5.2;
      depth.gain.value = frequency(n.pitch) * 0.006;
      vibrato.connect(depth).connect(osc.frequency);
      vibrato.start(when);
      vibrato.stop(end + 0.2);
      out.gain.setValueAtTime(0, when);
      out.gain.linearRampToValueAtTime(peak, when + 0.06);
      out.gain.setTargetAtTime(0, end - 0.05, 0.06);
      osc.connect(out);
      end += 0.3;
    } else {
      // Plucked: the lute bright and quick, the harp soft and ringing.
      const harp = instrument === 'harp';
      osc.type = harp ? 'triangle' : 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(harp ? 2400 : 3200, when);
      filter.frequency.exponentialRampToValueAtTime(harp ? 900 : 1100, when + 0.4);
      const ring = harp ? 1.6 : 0.9;
      out.gain.setValueAtTime(peak * (harp ? 1.4 : 1.9), when);
      out.gain.exponentialRampToValueAtTime(0.001, when + ring);
      osc.connect(filter).connect(out);
      end = when + ring + 0.05;
    }
    osc.start(when);
    osc.stop(end);
  }

  // A bowshot (a short twang, and a thump if it lands) or a blow (a dull thud).
  private fight(ranged: boolean, hit: boolean, when: number, pan: number): void {
    const ctx = this.ctx!;
    const out = this.output(this.effectsBus!, pan * 0.8, when);
    if (ranged) {
      const string = ctx.createOscillator();
      string.type = 'triangle';
      string.frequency.setValueAtTime(330, when);
      string.frequency.exponentialRampToValueAtTime(180, when + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.05, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
      string.connect(gain).connect(out);
      string.start(when);
      string.stop(when + 0.16);
    }
    if (hit || !ranged) {
      const at = ranged ? when + 0.12 : when;
      const thud = ctx.createBufferSource();
      thud.buffer = this.noise;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = hit ? 500 : 300;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(hit ? 0.09 : 0.04, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
      thud.connect(tone).connect(gain).connect(out);
      thud.start(at, Math.random());
      thud.stop(at + 0.1);
    }
  }

  // A bird by day, a cricket by night, somewhere off in the distance.
  private call(night: boolean): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime + 0.05;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    gain.connect(this.effectsBus!);
    osc.connect(gain);
    if (night) {
      osc.frequency.value = 4300;
      for (let k = 0; k < 3; k++) {
        gain.gain.setValueAtTime(0.012, now + k * 0.07);
        gain.gain.setValueAtTime(0, now + k * 0.07 + 0.035);
      }
      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      const base = 2200 + Math.random() * 1200;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 1.5, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(base * 1.1, now + 0.16);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.02, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  }

  // Short cues for the moments that matter.
  public alert(kind: Alert): void {
    const ctx = this.ctx;
    if (!ctx || !this.volumes.enabled || ctx.state !== 'running') {
      return;
    }
    const now = ctx.currentTime + 0.02;
    if (now - (this.lastAlert.get(kind) ?? -Infinity) < ALERT_GAP) {
      return;
    }
    this.lastAlert.set(kind, now);
    const tones: Record<Alert, { pitches: number[]; step: number; type: OscillatorType; length: number }> = {
      // Two low horn calls.
      raid: { pitches: [50, 50], step: 0.45, type: 'sawtooth', length: 0.38 },
      // A falling pair.
      death: { pitches: [57, 52], step: 0.5, type: 'triangle', length: 0.9 },
      // A rising chime.
      goal: { pitches: [72, 76, 79], step: 0.09, type: 'triangle', length: 0.5 },
      concert: { pitches: [67, 72], step: 0.15, type: 'sine', length: 0.6 },
      // A bell rung quickly.
      fire: { pitches: [84, 84, 84], step: 0.18, type: 'square', length: 0.16 },
      // A single falling note.
      collapse: { pitches: [60, 55], step: 0.12, type: 'triangle', length: 0.45 },
      // Two soft notes rising.
      birth: { pitches: [67, 74], step: 0.22, type: 'sine', length: 0.8 },
    };
    const cue = tones[kind];
    cue.pitches.forEach((pitch, k) => {
      const start = now + k * cue.step;
      const osc = ctx.createOscillator();
      osc.type = cue.type;
      osc.frequency.value = frequency(pitch);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = kind === 'raid' ? 900 : kind === 'fire' ? 2600 : 4000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      // (Over a concert: at the old level a raid's horn was quieter than one lute.)
      gain.gain.linearRampToValueAtTime(kind === 'raid' ? 0.34 : kind === 'fire' ? 0.24 : 0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + cue.length);
      osc.connect(filter).connect(gain).connect(this.effectsBus!);
      osc.start(start);
      osc.stop(start + cue.length + 0.05);
    });
  }
}

export const sound = new Sound();
