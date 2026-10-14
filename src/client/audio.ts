import { WEAPONS, type GameEvent } from "../shared/data";
export class AudioEngine {
  ctx: AudioContext | null = null;
  gain: GainNode | null = null;
  volume = 0.35;
  private noise: AudioBuffer | null = null;
  private ambient: OscillatorNode | null = null;
  start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(
        1,
        this.ctx.sampleRate * 0.3,
        this.ctx.sampleRate,
      );
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.ambient = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      g.gain.value = 0.009;
      this.ambient.frequency.value = 55;
      this.ambient.type = "sine";
      this.ambient.connect(g).connect(this.gain);
      this.ambient.start();
    }
    void this.ctx.resume();
  }
  setVolume(v: number) {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v;
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
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(30, freq * 0.4),
      t + duration,
    );
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.gain);
    o.start();
    o.stop(t + duration);
  }
  play(e: GameEvent, dist: number) {
    if (!this.ctx || !this.gain || dist > 1100) return;
    if (e.pellet) return;
    const volume = Math.max(0.02, 1 - dist / 1200);
    if (e.type === "shot") {
      const gun = e.weapon ? WEAPONS[e.weapon] : null;
      this.tone(
        gun?.sound ?? 100,
        gun?.id === "sg" ? 0.3 : gun?.id === "smg" ? 0.055 : 0.12,
        (gun?.id === "sg" ? 0.38 : gun?.id === "smg" ? 0.15 : 0.26) * volume,
        gun?.id === "smg" ? "square" : "triangle",
      );
      const noise = this.ctx.createBufferSource(),
        g = this.ctx.createGain(),
        filter = this.ctx.createBiquadFilter(),
        t = this.ctx.currentTime;
      noise.buffer = this.noise;
      filter.type = "bandpass";
      filter.frequency.value =
        gun?.id === "smg" ? 2900 : gun?.id === "sg" ? 550 : 1500;
      filter.Q.value = gun?.id === "smg" ? 0.8 : 0.45;
      g.gain.setValueAtTime((gun?.id === "sg" ? 0.7 : 0.42) * volume, t);
      g.gain.exponentialRampToValueAtTime(
        0.001,
        t + (gun?.id === "sg" ? 0.28 : gun?.id === "smg" ? 0.045 : 0.11),
      );
      noise.connect(filter).connect(g).connect(this.gain);
      noise.start();
      noise.stop(t + 0.3);
      if (gun?.id === "sg") {
        this.tone(52, 0.24, 0.26 * volume);
        setTimeout(() => this.tone(310, 0.07, 0.1 * volume, "square"), 190);
      }
    } else if (e.type === "hit")
      this.tone(e.enemy ? 150 : 920, 0.045, 0.1 * volume, "triangle");
    else if (e.type === "kill") {
      this.tone(1250, 0.07, 0.14 * volume);
      setTimeout(() => this.tone(1680, 0.065, 0.1 * volume), 45);
    } else if (e.type === "reload") {
      this.tone(360, 0.08, 0.13);
      const duration = e.weapon ? WEAPONS[e.weapon].reload : 1.5;
      setTimeout(() => this.tone(180, 0.05, 0.1, "square"), 180);
      setTimeout(
        () => this.tone(600, 0.07, 0.15),
        Math.max(350, duration * 1000 - 160),
      );
    } else if (e.type === "explode") {
      this.tone(70, 0.8, 0.4, "sawtooth");
    } else if (e.type === "alarm") {
      this.tone(640, 0.4, 0.12, "sine");
    } else this.tone(880, 0.2, 0.16);
  }
}
