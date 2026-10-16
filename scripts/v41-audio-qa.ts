import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const output = process.env.QA_OUTPUT || "docs/v4.1/audio";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
// tsx preserves function names with an esbuild helper outside the serialized callback.
await page.addInitScript("window.__name = (value) => value;");
await page.goto(process.env.QA_URL || "http://localhost:3000");
const report = [];
for (const weapon of [
  "ar",
  "smg",
  "sg",
  "hmg",
  "engine",
  "shell",
  "armor",
  "explosion",
  "maximum",
  "pistol",
  "at",
  "partial",
  "weakpoint",
  "component",
  "smoke",
]) {
  const samples = await page.evaluate(async (weapon) => {
    const context = new OfflineAudioContext(2, 48000, 48000);
    Object.defineProperty(context, "resume", {
      value: () => Promise.resolve(),
    });
    const Original = window.AudioContext;
    (window as any).AudioContext = new Proxy(Original, {
      construct: () => context,
    });
    const url = "/src/client/audio.ts",
      { AudioEngine } = await import(url);
    const audio = new AudioEngine();
    audio.start();
    const event = ["partial", "weakpoint", "component"].includes(weapon)
      ? { type: "hit", quality: weapon }
      : weapon === "smoke"
        ? { type: "sound", cue: "steps" }
        : weapon === "at"
          ? { type: "shot", weapon: "at", heavy: true }
          : weapon === "hmg"
            ? { type: "shot", heavy: true }
            : weapon === "engine"
              ? { type: "sound", cue: "engine", heavy: true }
              : weapon === "shell"
                ? { type: "sound", cue: "shell", heavy: true }
                : weapon === "armor"
                  ? { type: "hit", armored: true }
                  : weapon === "explosion"
                    ? { type: "explode", heavy: true }
                    : weapon === "maximum"
                      ? { type: "alarm", heavy: true }
                      : { type: "shot", weapon };
    audio.play({ id: 1, x: 0, y: 0, ...event }, 0);
    (window as any).AudioContext = Original;
    const buffer = await context.startRendering();
    return Array.from(buffer.getChannelData(0));
  }, weapon);
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(48000, 24);
  data.writeUInt32LE(96000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) =>
    data.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, s)) * 32767),
      44 + i * 2,
    ),
  );
  writeFileSync(`${output}/${weapon}.wav`, data);
  const rms = (start: number, end: number) =>
    Math.sqrt(
      samples.slice(start, end).reduce((s, v) => s + v * v, 0) / (end - start),
    );
  report.push({
    weapon,
    sampleRate: 48000,
    peak: Math.max(...samples.map(Math.abs)),
    clipped: samples.filter((s) => Math.abs(s) >= 1).length,
    attackRms: rms(0, 4800),
    tailRms: rms(4800, 14400),
  });
}
writeFileSync(
  `${output}/audio-qa.json`,
  JSON.stringify(
    {
      method:
        "actual AudioEngine rendered by Chromium OfflineAudioContext; not a listening review",
      report,
    },
    null,
    2,
  ),
);
console.log(report);
await browser.close();
