import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { Pilot } from "./bot";
import { drive } from "./browser-driver";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});
const output = process.env.QA_OUTPUT || "docs/after";
mkdirSync(output, { recursive: true });
const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  }),
  page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.QA_URL || "http://localhost:3302");
await page.waitForFunction(() => (window as any).dollQA?.connected);
await page.waitForFunction(() =>
  Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0),
);
await page.screenshot({ path: output + "/lobby-1920.png" });
await page.click('[data-character="luna"]');
await page.waitForTimeout(150);
await page.screenshot({ path: output + "/luna-1920.png" });
await page.click('[data-character="aria"]');
await page.setViewportSize({ width: 1280, height: 720 });
await page.screenshot({ path: output + "/lobby-1280.png", fullPage: true });
await page.click('[data-action="create"]');
await page.waitForSelector('[data-action="ready"]');
await page.fill("#seed", "42");
await page.locator("#seed").dispatchEvent("change");
await page.click('[data-action="ready"]');
await page.click('[data-action="start"]');
await page.waitForSelector("#battle");
const pilot = new Pilot(),
  start = Date.now();
let q: any;
while (Date.now() - start < 40000) {
  q = await page.evaluate(() => (window as any).dollQA);
  if (q.room.phase !== "playing") break;
  const p = q.room.players.find((p: any) => p.id === q.id);
  await drive(page, pilot.input(q.room.world, p));
  if (p.kills >= 2) break;
  await page.waitForTimeout(60);
}
await page.screenshot({ path: output + "/firing-1280.png" });
await page.setViewportSize({ width: 1920, height: 1080 });
await page.waitForTimeout(100);
await page.screenshot({ path: output + "/firing-1920.png" });
writeFileSync(
  output + "/visual-qa.json",
  JSON.stringify(
    {
      errors,
      elapsed: q.room.world?.mission.elapsed,
      kills: q.room.players.map((p: any) => p.kills),
      viewportWidths: [1280, 1920],
    },
    null,
    2,
  ),
);
await browser.close();
