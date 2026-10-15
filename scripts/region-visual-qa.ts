import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const output = process.env.QA_OUTPUT || "docs/v3/phase2";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const report = [];
for (const seed of [7, 42, 103, 211, 997]) {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.QA_URL || "http://localhost:3303") +
      "/scripts/v4-overview.html?seed=" +
      seed,
  );
  await page.waitForFunction(() => (window as any).ready);
  await page.screenshot({
    path: `${output}/seed-${seed}-overview.png`,
    fullPage: true,
  });
  await page.goto(process.env.QA_URL || "http://localhost:3303");
  await page.waitForFunction(() => (window as any).dollQA?.connected);
  await page.click('[data-action="create"]');
  await page.fill("#seed", String(seed));
  await page.locator("#seed").dispatchEvent("change");
  await page.screenshot({
    path: `${output}/seed-${seed}-briefing.png`,
    fullPage: true,
  });
  await page.click('[data-action="ready"]');
  await page.click('[data-action="start"]');
  await page.waitForSelector("#battle");
  await page.keyboard.down("d");
  await page.waitForTimeout(2800);
  await page.keyboard.up("d");
  await page.screenshot({ path: `${output}/seed-${seed}-insertion.png` });
  report.push(
    await page.evaluate(() => ({
      seed: (window as any).dollQA.room.seed,
      elapsed: (window as any).dollQA.room.world.mission.elapsed,
      position: (window as any).dollQA.room.players[0],
      topology: (window as any).dollQA.room.world.map.topology,
    })),
  );
  if (errors.length) throw Error(errors.join("\n"));
  await context.close();
}
writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
await browser.close();
