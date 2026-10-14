import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(
  (process.env.QA_URL || "http://localhost:3000") +
    "/scripts/render-benchmark.html",
);
await page.waitForTimeout(15000);
const result = await page.evaluate(() => (window as any).benchmark());
result.frames.sort((a: number, b: number) => a - b);
const n = result.frames.length,
  report = {
    fixture: "synthetic renderer benchmark; not a gameplay screenshot",
    viewport: "1920x1080",
    browser: browser.version(),
    players: result.players,
    enemies: result.enemies,
    samples: n,
    medianMs: result.frames[Math.floor(n * 0.5)],
    p95Ms: result.frames[Math.floor(n * 0.95)],
    averageMs: result.frames.reduce((a: number, b: number) => a + b, 0) / n,
    particles: result.particles,
    trails: result.trails,
  };
await page.screenshot({ path: "docs/after/render-benchmark.png" });
writeFileSync("docs/render-qa.json", JSON.stringify(report, null, 2));
console.log(report);
await browser.close();
