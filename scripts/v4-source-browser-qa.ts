import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { generateMap, distance } from "../src/game/map";
import { Pilot } from "./bot";
import { drive } from "./browser-driver";
const output = process.env.QA_OUTPUT || "docs/v4/browser/source-watch";
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
      ...(i === 0
        ? {
            recordVideo: {
              dir: output + "/video",
              size: { width: 1280, height: 720 },
            },
          }
        : {}),
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
await pages[0].fill("#seed", "42");
await pages[0].locator("#seed").dispatchEvent("change");
await pages[0].selectOption("#difficulty", "8");
for (const p of pages) {
  await p.selectOption("#tactical", "launcher");
  await p.click('[data-action="ready"]');
}
await pages[0].click('[data-action="start"]');
await Promise.all(pages.map((p) => p.waitForSelector("#battle")));
// Static authored seed route only; no server actor positions, health or timers are changed.
const map = generateMap(42),
  source = map.sources
    .filter((s) => s.kind === "barracks")
    .sort(
      (a, b) => distance(a.entry, map.spawn) - distance(b.entry, map.spawn),
    )[0];
const observed: any[] = [],
  captured = new Set<number>(),
  start = Date.now();
const emergence = new Set<string>();
let q: any;
let firstContact = -1;
const heavyFirst = new Map<string, number>();
try {
  while (Date.now() - start < 180000) {
    q = await read();
    if (q.room.phase !== "playing") break;
    const w = q.room.world;
    if (firstContact < 0 && w.enemies.length) firstContact = w.time;
    if (
      w.mission.objectives.some(
        (o: any) => !o.optional && o.state === "complete",
      )
    )
      pilots.forEach(
        (pilot, i) =>
          (pilot.destination = {
            x: source.entry.x + (i ? 180 : -180),
            y: source.entry.y + 150,
          }),
      );
    for (const e of w.enemies)
      if (
        ["walker", "juggernaut"].includes(e.kind) &&
        distance(e, source.entry) < 450 &&
        !heavyFirst.has(e.id)
      )
        heavyFirst.set(e.id, w.time);

    await Promise.all(
      pages.map(async (page, i) => {
        const own = i ? await read(i) : q;
        const p = w.players.find((p: any) => p.id === own.id);
        const input = pilots[i].input(w, p, i);
        // Observe the guard's first radio call before returning fire; all actions remain ordinary inputs.
        if (firstContact >= 0 && w.time - firstContact < 2.1) {
          input.fire = false;
          input.dx = input.dy = 0;
          input.sprint = false;
        }
        if ([...heavyFirst.values()].some((at) => w.time - at < 3)) {
          input.fire = false;
          input.tactical = false;
        }
        await drive(page, input);
      }),
    );
    observed.push({
      time: w.time,
      alert: w.alertState,
      notices: w.notices,
      players: w.players.map((p: any) => ({
        hp: p.hp,
        down: p.down,
        x: p.x,
        y: p.y,
      })),
      enemies: w.enemies.map((e: any) => ({
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        phase: e.phase,
      })),
      sources: w.map.sources.map((s: any) => ({
        id: s.id,
        warning: s.warning,
        blocked: s.blocked,
      })),
    });
    for (const e of w.enemies) {
      if (
        emergence.size < 16 &&
        !emergence.has(e.id) &&
        distance(e, source.entry) < 230
      ) {
        emergence.add(e.id);
        await pages[0].screenshot({
          path: `${output}/emergence-${e.id}-${w.time.toFixed(1)}.png`,
        });
      }
    }
    const bucket = Math.floor(w.time / 10);
    if (!captured.has(bucket)) {
      captured.add(bucket);
      await pages[0].screenshot({ path: `${output}/approach-${bucket}.png` });
    }
    if (Math.floor(w.time) % 10 === 0)
      console.log(
        "watch",
        Math.round(w.time),
        w.alertState.level,
        w.enemies.map((e: any) => e.kind).join(","),
      );
    if (w.time > 115) break;
    await pages[0].waitForTimeout(100);
  }
  await pages[0].screenshot({ path: `${output}/source-watch.png` });
  writeFileSync(
    output + "/observer.json",
    JSON.stringify(
      {
        method:
          "two real browsers difficulty8 seed42; destroy the first generator then move to the motorpool observation approach; hold fire for first2.1s contact and3s after visible armor; ordinary DOM controls only, independently audited server provenance",
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
