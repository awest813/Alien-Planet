// The colony's sound, made in code with Web Audio: instruments played by colonists, a little ambience
// (wind, rain, birds by day, crickets by night) and a few alerts. Nothing is created until the
// player turns sound on, and every call is safe without audio support: the game just stays quiet.

import { InstrumentKey, Note, frequency, phrase, tempoFor } from './music';

export interface Musician {
  id: number;
  instrument: InstrumentKey;
  skill: number;
  // Whether the player is in view: music off screen is played quietly.
  inView: boolean;
}

export interface SoundScene {
  musicians: Musician[];
  // Game speed is zero: music and ambient calls stop, the wind carries on.
  paused: boolean;
  night: boolean;
  rain: boolean;
  storm: boolean;
}

export type Alert = 'raid' | 'death' | 'goal' | 'concert';

export interface Volumes {
  enabled: boolean;
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
  private rainGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private playing = new Map<number, Playing>();
  private volumes: Volumes = { enabled: false, master: 0.7, music: 0.8, effects: 0.8 };
  private nextCall = 0;

  // Applies the player's settings. Turning sound on creates the audio graph (it's called from a
  // click, which browsers require before audio may start).
  public configure(volumes: Volumes): void {
    this.volumes = volumes;
    if (volumes.enabled) {
      this.start();
      void this.ctx?.resume().catch(() => {});
      // Browsers only let audio start after the player interacts with the page (sound left on from a
      // last visit): try again on the first click or key press.
      if (this.ctx && this.ctx.state !== 'running') {
        const wake = () => {
          void this.ctx?.resume().catch(() => {});
          window.removeEventListener('pointerdown', wake);
          window.removeEventListener('keydown', wake);
        };
        window.addEventListener('pointerdown', wake);
        window.addEventListener('keydown', wake);
      }
    } else {
      void this.ctx?.suspend().catch(() => {});
    }
    if (this.ctx && this.master && this.musicBus && this.effectsBus) {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(volumes.enabled ? volumes.master : 0, t, 0.05);
      this.musicBus.gain.setTargetAtTime(volumes.music, t, 0.05);
      this.effectsBus.gain.setTargetAtTime(volumes.effects, t, 0.05);
    }
  }

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
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.effectsBus = ctx.createGain();
      this.effectsBus.connect(this.master);
      // Two seconds of noise, looped for wind and rain and cut short for drum hits.
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noise = noise;
      this.wind = this.loop(ctx, 'lowpass', 380, 0.5);
      this.rainGain = this.loop(ctx, 'bandpass', 2600, 0.6);
    } catch {
      this.ctx = null;
    }
  }

  // A looping noise layer through a filter, starting silent.
  private loop(ctx: AudioContext, type: BiquadFilterType, freq: number, q: number): GainNode {
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
    source.start();
    return gain;
  }

  // Called every frame: keeps each musician's tune going and the weather in the air.
  public update(scene: SoundScene): void {
    const ctx = this.ctx;
    if (!ctx || !this.volumes.enabled || ctx.state !== 'running') {
      return;
    }
    const now = ctx.currentTime;
    this.wind!.gain.setTargetAtTime(scene.storm ? 0.22 : scene.rain ? 0.1 : 0.05, now, 1.5);
    this.rainGain!.gain.setTargetAtTime(scene.storm ? 0.12 : scene.rain ? 0.07 : 0, now, 1.5);
    if (!scene.paused && now >= this.nextCall) {
      this.nextCall = now + 2 + Math.random() * 6;
      if (!scene.rain) {
        this.call(scene.night);
      }
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
        this.note(m.instrument, next, Math.max(when, now), next.length * secondsPerBeat, level);
      }
    }
  }

  // One note in the instrument's voice.
  private note(instrument: InstrumentKey, n: Note, when: number, length: number, level: number): void {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.connect(this.musicBus!);
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
      hit.connect(tone).connect(hitGain).connect(this.musicBus!);
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
    const tones: Record<Alert, { pitches: number[]; step: number; type: OscillatorType; length: number }> = {
      // Two low horn calls.
      raid: { pitches: [50, 50], step: 0.45, type: 'sawtooth', length: 0.38 },
      // A falling pair.
      death: { pitches: [57, 52], step: 0.5, type: 'triangle', length: 0.9 },
      // A rising chime.
      goal: { pitches: [72, 76, 79], step: 0.09, type: 'triangle', length: 0.5 },
      concert: { pitches: [67, 72], step: 0.15, type: 'sine', length: 0.6 },
    };
    const cue = tones[kind];
    cue.pitches.forEach((pitch, k) => {
      const start = now + k * cue.step;
      const osc = ctx.createOscillator();
      osc.type = cue.type;
      osc.frequency.value = frequency(pitch);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = kind === 'raid' ? 900 : 4000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + cue.length);
      osc.connect(filter).connect(gain).connect(this.effectsBus!);
      osc.start(start);
      osc.stop(start + cue.length + 0.05);
    });
  }
}

export const sound = new Sound();
