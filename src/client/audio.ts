import { WEAPONS, type GameEvent } from "../shared/data";
/** Noise/transient/low-frequency layers; no musical oscillator as the gun's main voice. */
export class AudioEngine {
  ctx: AudioContext | null = null;
  gain: GainNode | null = null;
  volume = 0.35;
  private noise: AudioBuffer | null = null;
  private output: AudioNode | null = null;
  private room: ConvolverNode | null = null;
  start() {
    if (!this.ctx) {
      const ctx = (this.ctx = new AudioContext());
      this.gain = ctx.createGain();
      this.gain.gain.value = this.volume;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      this.gain.connect(limiter).connect(ctx.destination);
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.room = ctx.createConvolver();
      const impulse = ctx.createBuffer(
        2,
        ctx.sampleRate * 0.18,
        ctx.sampleRate,
      );
      for (let ch = 0; ch < 2; ch++) {
        const d = impulse.getChannelData(ch);
        for (let i = 0; i < d.length; i++)
          d[i] =
            (Math.random() * 2 - 1) *
            Math.pow(1 - i / d.length, 4) *
            (i < 300 ? 0 : 0.5);
      }
      this.room.buffer = impulse;
      const wet = ctx.createGain();
      wet.gain.value = 0.13;
      this.room.connect(wet).connect(this.output ?? this.gain);
    }
    void this.ctx.resume();
  }
  setVolume(v: number) {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v;
  }
  private noiseBurst(
    freq: number,
    duration: number,
    volume: number,
    type: BiquadFilterType = "lowpass",
    delay = 0,
    reverb = false,
  ) {
    if (!this.ctx || !this.gain || !this.noise) return;
    const ctx = this.ctx,
      t = ctx.currentTime + delay,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      env = ctx.createGain();
    source.buffer = this.noise;
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = 0.7;
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(volume, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source
      .connect(filter)
      .connect(env)
      .connect(this.output ?? this.gain);
    if (reverb && this.room) env.connect(this.room);
    source.start(t, Math.random() * 0.2);
    source.stop(t + duration + 0.01);
  }
  tone(
    freq: number,
    duration = 0.1,
    volume = 0.12,
    type: OscillatorType = "sine",
  ) {
    if (!this.ctx || !this.gain) return;
    const t = this.ctx.currentTime,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.output ?? this.gain);
    o.start();
    o.stop(t + duration);
  }
  play(e: GameEvent, dist: number, pan = 0) {
    if (!this.ctx || !this.gain || dist > 1100 || e.pellet) return;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    panner.connect(this.gain);
    this.output = panner;
    setTimeout(() => panner.disconnect(), 1200);
    const v =
      (e.uncertainty ? 0.38 : e.type === "sound" ? 0.65 : 1) *
      Math.max(0.025, 1 / (1 + Math.pow(dist / 380, 2)));
    if (e.type === "sound") {
      if (e.cue === "shell") {
        this.noiseBurst(1900, 1.6, 0.2 * v, "bandpass");
        this.tone(1400, 1.4, 0.045 * v);
      } else if (e.cue === "gunfire" && e.heavy) {
        this.noiseBurst(900, 0.3, 0.8 * v, "lowpass", 0, true);
        this.tone(40, 0.28, 0.5 * v);
      } else if (e.cue === "engine") {
        this.noiseBurst(320, 0.65, 0.4 * v, "lowpass");
        this.tone(58, 0.55, 0.12 * v);
      } else if (e.cue === "steps") {
        this.noiseBurst(
          e.heavy ? 105 : 230,
          e.heavy ? 0.22 : 0.065,
          (e.heavy ? 0.6 : 0.22) * v,
          "lowpass",
        );
        if (e.heavy) this.tone(36, 0.25, 0.35 * v);
      } else if (e.cue === "radio") {
        this.noiseBurst(1600, 0.1, 0.23 * v, "bandpass");
        this.noiseBurst(2100, 0.05, 0.12 * v, "bandpass", 0.14);
      } else this.noiseBurst(500, 0.16, 0.22 * v, "lowpass");
    } else if (e.type === "shot") {
      if (e.heavy) {
        this.noiseBurst(1050, 0.24, 0.95 * v, "lowpass", 0, true);
        this.noiseBurst(4200, 0.035, 0.3 * v, "highpass");
        this.tone(42, 0.3, 0.6 * v);
        this.output = null;
        return;
      }
      const sg = e.weapon === "sg",
        smg = e.weapon === "smg",
        pistol = e.weapon === "pistol";
      this.noiseBurst(
        sg ? 1700 : pistol ? 2800 : smg ? 3300 : 2400,
        sg ? 0.24 : pistol ? 0.09 : smg ? 0.075 : 0.14,
        (sg ? 1 : pistol ? 0.38 : smg ? 0.42 : 0.7) * v,
        "lowpass",
        0,
        true,
      );
      this.noiseBurst(6500, 0.025, 0.24 * v, "highpass");
      this.tone(
        sg ? 58 : pistol ? 130 : smg ? 115 : 82,
        sg ? 0.22 : pistol ? 0.07 : smg ? 0.06 : 0.12,
        (sg ? 0.65 : pistol ? 0.16 : smg ? 0.2 : 0.42) * v,
      );
      if (sg) this.noiseBurst(1700, 0.09, 0.12 * v, "bandpass", 0.23);
      if (e.impact) this.noiseBurst(3900, 0.065, 0.13 * v, "bandpass", 0.025);
    } else if (e.type === "hit") {
      if (e.quality === "component") {
        this.noiseBurst(900, 0.35, 0.42 * v, "lowpass", 0, true);
        this.noiseBurst(3900, 0.12, 0.24 * v, "bandpass");
      } else if (e.armored) {
        this.noiseBurst(4700, 0.11, 0.36 * v, "bandpass", 0, true);
        this.output = null;
        return;
      }
      if (e.quality === "partial" || e.penetrationResult === "partial")
        this.noiseBurst(3500, 0.08, 0.2 * v, "bandpass");
      if (e.quality === "weakpoint")
        this.noiseBurst(1200, 0.11, 0.25 * v, "lowpass");
      this.noiseBurst(
        e.enemy ? 480 : 2300,
        0.065,
        (e.enemy ? 0.42 : 0.18) * v,
        "bandpass",
      );
    } else if (e.type === "kill") {
      this.noiseBurst(1300, 0.15, 0.22 * v, "bandpass");
      this.tone(65, 0.07, 0.1 * v);
    } else if (e.type === "reload") {
      const duration = e.weapon ? WEAPONS[e.weapon].reload : 1.5;
      this.noiseBurst(2600, 0.065, 0.27 * v, "bandpass");
      this.noiseBurst(900, 0.09, 0.24 * v, "bandpass", 0.17);
      this.noiseBurst(3400, 0.07, 0.3 * v, "bandpass", duration - 0.16);
    } else if (e.type === "explode") {
      this.noiseBurst(750, 0.75, 0.9 * v, "lowpass", 0, true);
      this.tone(45, 0.55, 0.5 * v);
    } else if (e.type === "alarm") {
      if (e.heavy) {
        this.noiseBurst(1500, 0.2, 0.2 * v, "bandpass");
        this.tone(310, 0.65, 0.16 * v, "triangle");
        this.noiseBurst(500, 0.5, 0.22 * v, "lowpass", 0.45);
      } else this.tone(640, 0.3, 0.12 * v);
    } else this.noiseBurst(2100, 0.08, 0.15 * v, "bandpass");
    this.output = null;
  }
}
