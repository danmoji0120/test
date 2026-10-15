import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const output = process.env.QA_OUTPUT || "docs/v4/performance/render",
  count = Number(process.env.QA_RENDER_PAGES || 1),
  width = Number(process.env.QA_WIDTH || 1920),
  height = Number(process.env.QA_HEIGHT || 1080);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const pages = [];
const errors: string[] = [];
for (let i = 0; i < count; i++) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.QA_URL || "http://localhost:3304") +
      "/scripts/render-benchmark.html" +
      (process.env.QA_REPRESENTATIVE ? "?representative=1" : ""),
  );
  pages.push(page);
}
await pages[0].waitForTimeout(15000);
const measurements = [];
for (const page of pages) {
  const result = await page.evaluate(() => (window as any).benchmark()),
    a = result.frames.sort((a: number, b: number) => a - b);
  measurements.push({
    players: result.players,
    enemies: result.enemies,
    roster: result.roster,
    samples: a.length,
    medianMs: a[Math.floor(a.length * 0.5)],
    p95Ms: a[Math.floor(a.length * 0.95)],
    averageMs: a.reduce((n: number, v: number) => n + v, 0) / a.length,
    drawMs: (() => {
      const a = result.drawCosts.sort((a: number, b: number) => a - b);
      return {
        mean: a.reduce((n: number, v: number) => n + v, 0) / a.length,
        p95: a[Math.floor(a.length * 0.95)],
      };
    })(),
    heapMiB: await page.evaluate(
      () => (performance as any).memory?.usedJSHeapSize / 1024 / 1024,
    ),
  });
}
const rss =
  spawnSync("ps", ["-eo", "stat=,comm=,rss="], { encoding: "utf8" })
    .stdout.split("\n")
    .reduce((n, line) => {
      const [stat, comm, kib] = line.trim().split(/\s+/);
      return (
        n +
        (comm === "chromium" && !stat.startsWith("Z") ? Number(kib) || 0 : 0)
      );
    }, 0) / 1024;
const background = await pages[0].evaluate(() =>
  (window as any).backgroundStress(),
);
if (background.particles > 400) throw Error("Effect bound exceeded");
if (errors.length) throw Error(errors.join("\n"));
await pages[0].screenshot({ path: output + "/render-benchmark.png" });
const report = {
  fixture:
    "Synthetic mixed infantry/armor/drone/artillery+projectiles,4friendlies20enemies per window,Fog,alert4; zero-damage performance fixture,not gameplay/difficulty evidence",
  browser: browser.version(),
  viewport: `${width}x${height}`,
  windows: count,
  measurements,
  chromiumAllProcessesRSSMiB: rss,
  backgroundBurst: background,
  errors,
};
writeFileSync(output + "/render-qa.json", JSON.stringify(report, null, 2));
console.log(report);
await browser.close();
