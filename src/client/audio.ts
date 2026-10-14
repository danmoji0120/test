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
    const volume = Math.max(0.02, 1 - dist / 1200);
    if (e.type === "shot") {
      const gun = e.weapon ? WEAPONS[e.weapon] : null;
      this.tone(
        gun?.sound ?? 100,
        gun?.id === "sg" ? 0.22 : 0.09,
        0.24 * volume,
        "triangle",
      );
      const noise = this.ctx.createBufferSource(),
        g = this.ctx.createGain(),
        filter = this.ctx.createBiquadFilter(),
        t = this.ctx.currentTime;
      noise.buffer = this.noise;
      filter.type = "bandpass";
      filter.frequency.value =
        gun?.id === "smg" ? 2100 : gun?.id === "sg" ? 700 : 1300;
      g.gain.setValueAtTime(0.35 * volume, t);
      g.gain.exponentialRampToValueAtTime(
        0.001,
        t + (gun?.id === "sg" ? 0.22 : 0.085),
      );
      noise.connect(filter).connect(g).connect(this.gain);
      noise.start();
      noise.stop(t + 0.25);
    } else if (e.type === "hit") this.tone(720, 0.035, 0.07 * volume, "square");
    else if (e.type === "kill") this.tone(1100, 0.08, 0.09 * volume);
    else if (e.type === "reload") {
      this.tone(360, 0.08, 0.13);
      setTimeout(() => this.tone(600, 0.07, 0.1), 500);
    } else if (e.type === "explode") {
      this.tone(70, 0.8, 0.4, "sawtooth");
    } else if (e.type === "alarm") {
      this.tone(640, 0.4, 0.12, "sine");
    } else this.tone(880, 0.2, 0.16);
  }
}
