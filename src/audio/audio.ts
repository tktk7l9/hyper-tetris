/**
 * Pure Web-Audio synth: BGM (looping arp + bass) and short SFX bursts.
 * No external assets — everything is generated on the fly.
 */

export type SfxName =
  | "move"
  | "rotate"
  | "drop"
  | "lock"
  | "clear"
  | "hyperclear"
  | "hold"
  | "gameover"
  | "mode";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private bgmFilter: BiquadFilterNode | null = null;
  private bgm = new BgmPlayer();

  bgmEnabled = true;
  sfxEnabled = true;
  masterVolume = 0.6;

  /** Lazy init — must run after a user gesture (browser autoplay policy). */
  init() {
    if (this.ctx) return;
    type AudioCtor = new () => AudioContext;
    const W = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = W.AudioContext ?? W.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(this.ctx.destination);

    this.bgmFilter = this.ctx.createBiquadFilter();
    this.bgmFilter.type = "lowpass";
    this.bgmFilter.frequency.value = 1800;
    this.bgmFilter.Q.value = 0.6;

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.22;
    this.bgmFilter.connect(this.bgmGain);
    this.bgmGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.65;
    this.sfxGain.connect(this.master);

    // slow filter LFO (synthwave feel)
    this.startFilterLfo();

    if (this.bgmEnabled) this.bgm.start(this.ctx, this.bgmFilter);
  }

  resume() {
    this.ctx?.resume().catch(() => {});
  }

  setBgmEnabled(on: boolean) {
    this.bgmEnabled = on;
    if (!this.ctx || !this.bgmFilter) return;
    if (on) this.bgm.start(this.ctx, this.bgmFilter);
    else this.bgm.stop();
  }

  setSfxEnabled(on: boolean) {
    this.sfxEnabled = on;
  }

  setMasterVolume(v: number) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.masterVolume;
  }

  toggleAll() {
    const newState = !(this.bgmEnabled && this.sfxEnabled);
    this.setBgmEnabled(newState);
    this.setSfxEnabled(newState);
  }

  playSfx(name: SfxName) {
    if (!this.sfxEnabled || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const out = this.sfxGain;
    switch (name) {
      case "move":       click(ctx, out, 540, 0.04, 0.18, "square"); break;
      case "rotate":     chirp(ctx, out, 760, 1180, 0.07, 0.22, "triangle"); break;
      case "drop":       sweepDown(ctx, out, 460, 110, 0.18, 0.32); break;
      case "lock":       thud(ctx, out, 130, 0.12, 0.42); break;
      case "clear":      arpUp(ctx, out, [440, 660, 880, 1320], 0.06, 0.28); break;
      case "hyperclear": arpUp(ctx, out, [330, 494, 660, 988, 1320, 1760], 0.07, 0.45); break;
      case "hold":       click(ctx, out, 880, 0.05, 0.22, "triangle"); click(ctx, out, 1320, 0.04, 0.18, "triangle", 0.08); break;
      case "mode":       arpUp(ctx, out, [523, 659, 784, 1047], 0.05, 0.32); break;
      case "gameover":   sweepDown(ctx, out, 440, 80, 0.6, 0.45); break;
    }
  }

  private startFilterLfo() {
    if (!this.ctx || !this.bgmFilter) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.value = 0.08; // very slow
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 800; // sweep ±800Hz
    osc.connect(lfoGain);
    lfoGain.connect(this.bgmFilter.frequency);
    osc.start();
  }
}

// ---------------- BGM ----------------

class BgmPlayer {
  private playing = false;
  private nextNoteAt = 0;
  private step = 0;
  private timer: number | null = null;

  start(ctx: AudioContext, dest: AudioNode) {
    if (this.playing) return;
    this.playing = true;
    this.nextNoteAt = ctx.currentTime + 0.1;
    this.tick(ctx, dest);
  }

  stop() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private tick(ctx: AudioContext, dest: AudioNode) {
    if (!this.playing) return;
    const lookahead = 0.5;
    const eighth = 60 / 116 / 2; // ~0.258 s
    while (this.nextNoteAt < ctx.currentTime + lookahead) {
      this.schedule(ctx, dest, this.nextNoteAt, this.step);
      this.nextNoteAt += eighth;
      this.step++;
    }
    this.timer = window.setTimeout(() => this.tick(ctx, dest), 100);
  }

  /**
   * 32-step pattern across four chords (8 eighths each):
   *   Am  ·  F  ·  C  ·  G   (i VI III VII in A minor — looped synthwave feel)
   */
  private schedule(ctx: AudioContext, dest: AudioNode, t: number, step: number) {
    const inBar = step % 32;
    const chordIdx = (inBar / 8) | 0;
    const localStep = inBar % 8;

    // --- chord arpeggio voices ---
    const chords = [
      [110, 165, 220, 261.63], // Am  : A2 E3 A3 C4
      [87.31, 130.81, 174.61, 220], // F  : F2 C3 F3 A3
      [130.81, 196, 261.63, 329.63], // C : C3 G3 C4 E4
      [98, 146.83, 196, 246.94],   // G : G2 D3 G3 B3
    ];
    const arp = chords[chordIdx];
    const arpIdx = [0, 1, 2, 3, 2, 1, 0, 2][localStep];
    const f = arp[arpIdx];
    blip(ctx, dest, f, t, 0.16, "triangle", 0.18);

    // --- bass: every 4th 8th note (down beats) ---
    if (localStep === 0 || localStep === 4) {
      blip(ctx, dest, arp[0] / 2, t, 0.32, "square", 0.12, 600);
    }
    // --- sparkle high note on the up of each bar ---
    if (localStep === 6) {
      blip(ctx, dest, arp[3] * 2, t, 0.10, "sine", 0.09);
    }
    // --- a light hat-like noise on every 8th ---
    if (localStep % 2 === 1) {
      hat(ctx, dest, t, 0.04, 0.04);
    }
  }
}

// ---------------- SFX primitives ----------------

function blip(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  t: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  filterHz?: number,
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (filterHz) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterHz;
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function hat(ctx: AudioContext, dest: AudioNode, t: number, dur: number, vol: number) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(dest);
  src.start(t);
}

function click(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  dur: number,
  vol: number,
  type: OscillatorType,
  delay = 0,
) {
  const t = ctx.currentTime + delay;
  blip(ctx, dest, freq, t, dur, type, vol);
}

function chirp(
  ctx: AudioContext,
  dest: AudioNode,
  fStart: number,
  fEnd: number,
  dur: number,
  vol: number,
  type: OscillatorType,
) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(fStart, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function sweepDown(
  ctx: AudioContext,
  dest: AudioNode,
  fStart: number,
  fEnd: number,
  dur: number,
  vol: number,
) {
  const t = ctx.currentTime;
  // tonal body
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(fStart, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 1500;
  o.connect(f).connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function thud(ctx: AudioContext, dest: AudioNode, freq: number, dur: number, vol: number) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq * 2, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function arpUp(
  ctx: AudioContext,
  dest: AudioNode,
  freqs: number[],
  noteDur: number,
  vol: number,
) {
  const t = ctx.currentTime;
  const step = noteDur * 0.6;
  for (let i = 0; i < freqs.length; i++) {
    blip(ctx, dest, freqs[i], t + i * step, noteDur, "triangle", vol * (1 - i * 0.05));
  }
}
