import { chromium, type Page } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { Pilot } from "./bot";
import { drive } from "./browser-driver";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});
const output = process.env.QA_OUTPUT || "docs/after";
mkdirSync(output, { recursive: true });
const report: any[] = [];
const errors: string[] = [];
for (const count of [1, 2]) {
  const pages: Page[] = [],
    bots: Pilot[] = [];
  for (let i = 0; i < count; i++) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(process.env.QA_URL || "http://localhost:3000");
    await p.waitForFunction(() => (window as any).dollQA?.connected);
    pages.push(p);
    bots.push(new Pilot());
  }
  await pages[0].click('[data-action="create"]');
  await pages[0].waitForSelector('[data-action="ready"]');
  const read = () => pages[0].evaluate(() => (window as any).dollQA);
  const code = (await read()).room.code;
  if (count === 2) {
    await pages[1].fill("#code", code);
    await pages[1].click('[data-action="join"]');
    await pages[1].waitForSelector('[data-action="ready"]');
    await pages[1].click('[data-character="luna"]');
  }
  await pages[0].fill("#seed", "42");
  await pages[0].locator("#seed").dispatchEvent("change");
  for (const p of pages) await p.click('[data-action="ready"]');
  await pages[0].click('[data-action="start"]');
  await Promise.all(pages.map((p) => p.waitForSelector("#battle")));
  const start = Date.now();
  let q = await read();
  while (Date.now() - start < 30000) {
    q = await read();
    if (q.room.phase !== "playing") break;
    await Promise.all(
      pages.map(async (p, i) => {
        const own = await p.evaluate(() => (window as any).dollQA.id);
        const player = q.room.players.find((v: any) => v.id === own);
        await drive(p, bots[i].input(q.room.world, player, i));
      }),
    );
    await pages[0].waitForTimeout(70);
  }
  await pages[0].screenshot({ path: `${output}/combat-${count}p.png` });
  const states = await Promise.all(
    pages.map((p) => p.evaluate(() => (window as any).dollQA)),
  );
  const result = {
    players: count,
    phase: q.room.phase,
    elapsed: q.room.world?.mission.elapsed,
    kills: q.room.players.map((p: any) => p.kills),
    ammo: q.room.players.map((p: any) => p.ammo),
    sameRun: new Set(states.map((q) => q.room.world.id)).size === 1,
  };
  report.push(result);
  console.log(result);
  if (
    !result.sameRun ||
    result.kills.reduce((n: number, v: number) => n + v, 0) === 0
  )
    throw Error("Smoke combat failed");
  for (const p of pages) await p.context().close();
}
writeFileSync(
  (process.env.QA_REPORT_DIR || "docs") + "/smoke-qa.json",
  JSON.stringify({ report, errors }, null, 2),
);
await browser.close();
if (errors.length) throw Error("Browser errors");
