import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { generateMap, distance } from "../src/game/map";
import { Pilot } from "./bot";
import { drive } from "./browser-driver";
const output = process.env.QA_OUTPUT || "docs/v3/phase4";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});
const pages: Page[] = [],
  pilots = [new Pilot(), new Pilot()],
  errors: string[] = [];
for (let i = 0; i < 2; i++) {
  const ctx = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    }),
    page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.QA_URL || "http://localhost:3303");
  await page.waitForFunction(() => (window as any).dollQA?.connected);
  pages.push(page);
}
const read = (i = 0) => pages[i].evaluate(() => (window as any).dollQA);
await pages[0].click('[data-action="create"]');
const code = (await read()).room.code;
await pages[1].fill("#code", code);
await pages[1].click('[data-action="join"]');
await pages[0].fill("#seed", "7");
await pages[0].locator("#seed").dispatchEvent("change");
for (const p of pages) await p.click('[data-action="ready"]');
await pages[0].click('[data-action="start"]');
await Promise.all(pages.map((p) => p.waitForSelector("#battle")));
// Static authored seed route only; no server actor positions, health or timers are changed.
const map = generateMap(7),
  source = map.sources
    .filter((s) => s.kind !== "external")
    .sort(
      (a, b) => distance(a.entry, map.spawn) - distance(b.entry, map.spawn),
    )[0];
pilots.forEach(
  (p, i) =>
    (p.destination = {
      x: source.entry.x + (i ? 85 : -85),
      y: source.entry.y + 160,
    }),
);
const observed: any[] = [],
  captured = new Set<number>(),
  start = Date.now();
let q: any;
try {
  while (Date.now() - start < 85000) {
    q = await read();
    if (q.room.phase !== "playing") break;
    const w = q.room.world;
    await Promise.all(
      pages.map(async (page, i) => {
        const own = i ? await read(i) : q;
        const p = w.players.find((p: any) => p.id === own.id);
        await drive(page, pilots[i].input(w, p, i));
      }),
    );
    observed.push({
      time: w.time,
      enemies: w.enemies.map((e: any) => ({ id: e.id, x: e.x, y: e.y })),
      sources: w.map.sources.map((s: any) => ({
        id: s.id,
        warning: s.warning,
        blocked: s.blocked,
      })),
    });
    const bucket = Math.floor(w.time / 10);
    if (!captured.has(bucket)) {
      captured.add(bucket);
      await pages[0].screenshot({ path: `${output}/approach-${bucket}.png` });
    }
    await pages[0].waitForTimeout(100);
  }
  await pages[0].screenshot({ path: `${output}/source-watch.png` });
  writeFileSync(
    output + "/observer.json",
    JSON.stringify(
      {
        method:
          "two real browsers; static seed observation route, normal DOM inputs; server provenance recorded separately",
        source: source.id,
        elapsed: q?.room.world.time,
        result: q?.room.world.mission.stage,
        errors,
        observed,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw Error(errors.join("\n"));
} finally {
  await browser.close();
}
