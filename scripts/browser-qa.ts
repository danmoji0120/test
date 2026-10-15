import { drive } from "./browser-driver";
import { chromium, type Page } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { Pilot } from "./bot";
import type { World, Input } from "../src/shared/data";
const url = process.env.QA_URL || "http://localhost:3000";
const output = process.env.QA_OUTPUT || "docs/after";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const errors: string[] = [],
  pages: Page[] = [],
  pilots = Array.from({ length: 4 }, () => {
    const p = new Pilot();
    if (process.env.QA_STRATEGY === "all") p.strategy = "all";
    if (process.env.QA_REVERSE === "1") p.reverse = true;
    return p;
  });
mkdirSync("docs/screenshots", { recursive: true });
const read = (p: Page) =>
  p.evaluate(() => JSON.parse(JSON.stringify((window as any).dollQA)));
for (let i = 0; i < 4; i++) {
  const context = await browser.newContext({
    viewport: { width: i === 0 ? 1920 : 1280, height: i === 0 ? 1080 : 720 },
  });
  const page = await context.newPage();
  pages.push(page);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => (window as any).dollQA?.connected);
  await page.waitForFunction(() =>
    Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0),
  );
  await page.fill("#name", ["아리아", "루나", "스파크", "에코"][i]);
}
await pages[0].screenshot({ path: `${output}/lobby-1920.png` });
await pages[0].click('[data-character="luna"]');
await pages[0].screenshot({ path: `${output}/luna-1920.png` });
await pages[0].click('[data-character="aria"]');
await pages[1].screenshot({
  path: `${output}/lobby-1280.png`,
  fullPage: true,
});
await pages[0].click('[data-action="create"]');
await pages[0].waitForSelector('[data-action="ready"]');
const code = (await read(pages[0])).room.code;
for (let i = 1; i < 4; i++) {
  await pages[i].fill("#code", code);
  await pages[i].click('[data-action="join"]');
  await pages[i].waitForSelector('[data-action="ready"]');
}
await pages[1].click('[data-character="luna"]');
if (process.env.QA_MIXED === "1") {
  await pages[1].click('[data-weapon="smg"]');
  await pages[2].click('[data-weapon="sg"]');
  await pages[2].waitForTimeout(200);
  await pages[2].click('[data-weapon="sg"]');
}
await pages[3].click('[data-character="luna"]');
await pages[0].fill("#seed", process.env.QA_SEED || "42");
await pages[0].locator("#seed").dispatchEvent("change");
for (const page of pages) await page.click('[data-action="ready"]');
await pages[0].screenshot({
  path: `${output}/squad-4.png`,
  fullPage: true,
});
await pages[0].click('[data-action="start"]');
await Promise.all(pages.map((p) => p.waitForSelector("#battle")));
await pages[0].waitForTimeout(800);
await pages[0].screenshot({ path: `${output}/combat-1920.png` });
await pages[1].screenshot({ path: `${output}/combat-1280.png` });
let lastStage = "",
  lastLog = 0,
  iterations = 0,
  reconnected = false,
  fireCaptured = false;
const start = Date.now(),
  stageTimes: Record<string, number> = {};
let final: any;
const fpsSamples: number[] = [];
const observedEvents = new Set<number>();
const feedback: Record<string, number> = {};
let downCount = 0;
const downs = new Set<string>();

try {
  while (Date.now() - start < 750000) {
    const state = await read(pages[0]);
    if (state.room.phase === "result") {
      final = state;
      break;
    }
    const w = state.room.world as World;
    if (!w) throw Error("Missing world");
    for (const e of w.events)
      if (!observedEvents.has(e.id)) {
        observedEvents.add(e.id);
        if (!e.pellet) {
          const key =
            e.type === "shot" ? `shot:${e.weapon ?? "enemy"}` : e.type;
          feedback[key] = (feedback[key] ?? 0) + 1;
        }
      }
    for (const p of w.players) {
      if (p.down && !downs.has(p.id)) {
        downCount++;
        downs.add(p.id);
      }
      if (!p.down) downs.delete(p.id);
    }
    if (w.mission.stage !== lastStage) {
      lastStage = w.mission.stage;
      stageTimes[lastStage] = w.mission.elapsed;
      console.log("STAGE", lastStage, w.mission.elapsed.toFixed(1));
      await pages[0].screenshot({
        path: `${output}/stage-${lastStage}.png`,
      });
    }
    if (Date.now() - lastLog > 30000) {
      lastLog = Date.now();
      console.log(
        "PLAY",
        Math.round(w.mission.elapsed),
        w.players
          .map(
            (p) =>
              `${p.name}:${Math.round(p.hp)}hp/${p.kills}k@${Math.round(p.x)},${Math.round(p.y)}`,
          )
          .join(" "),
        "enemies",
        w.enemies.length,
      );
    }
    await Promise.all(
      pages.map(async (page, i) => {
        const q = i === 0 ? state : await read(page);
        const p = w.players.find((p) => p.id === q.id);
        if (p) await drive(page, pilots[i].input(w, p, i));
      }),
    );
    iterations++;
    if (
      !fireCaptured &&
      (feedback["shot:ar"] ?? 0) + (feedback["shot:sg"] ?? 0) > 5
    ) {
      await pages[0].screenshot({ path: `${output}/firing.png` });
      fireCaptured = true;
    }
    if (!reconnected && w.mission.elapsed > 20) {
      const old = await read(pages[3]);
      await pages[3].reload();
      await pages[3].waitForSelector("#battle");
      const restored = await read(pages[3]);
      if (restored.id !== old.id || restored.room.world.id !== w.id)
        throw Error("Reconnect identity/run mismatch");
      reconnected = true;
      console.log("RECONNECT PASS");
    }
    if (iterations % 30 === 0 && state.frames)
      fpsSamples.push(...state.frames.slice(-30));
    await pages[0].waitForTimeout(65);
  }
  if (!final) throw Error("Browser mission timed out");
  await pages[0].screenshot({ path: `${output}/result-1920.png` });
  await pages[1].screenshot({ path: `${output}/result-1280.png` });
  const finals = await Promise.all(pages.map(read));
  if (new Set(finals.map((q) => q.room.world.mission.stage)).size !== 1)
    throw Error("Mission result mismatch");
  const stage = final.room.world.mission.stage;
  fpsSamples.sort((a, b) => a - b);
  const report = {
    date: new Date().toISOString(),
    runId: final.room.world.id,
    metrics: final.room.world.metrics,
    browser: browser.version(),
    viewports: ["1920x1080", "1280x720"],
    players: 4,
    seed: final.room.seed,
    loadout: final.room.players.map((p: any) => ({
      character: p.character,
      weapon: p.weapon,
    })),
    escapeSeconds: final.room.world.mission.elapsed - stageTimes.extract,
    objectives: final.room.world.mission.objectives.map((o: any) => ({
      id: o.id,
      kind: o.kind,
      state: o.state,
    })),
    extraction: final.room.world.mission.extraction,
    feedback,
    downCount,
    stageTimes,
    elapsed: final.room.world.mission.elapsed,
    result: stage,
    kills: final.room.players.map((p: any) => ({
      name: p.name,
      kills: p.kills,
      hp: p.hp,
    })),
    reconnect: reconnected,
    repeatDeployment: false,
    errors,
    frameMs: {
      samples: fpsSamples.length,
      median: fpsSamples[Math.floor(fpsSamples.length * 0.5)],
      p95: fpsSamples[Math.floor(fpsSamples.length * 0.95)],
      average: fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length,
    },
  };
  writeFileSync(
    (process.env.QA_REPORT_DIR || "docs") + "/browser-qa.json",
    JSON.stringify(report, null, 2),
  );
  if (stage !== "success") throw Error("Browser mission failed");
  const before = final.room.world.id;
  await pages[0].click('[data-action="return"]');
  await pages[0].waitForSelector('[data-action="ready"]');
  await pages[0].reload();
  await pages[0].waitForSelector('[data-action="ready"]');
  for (const page of pages) await page.click('[data-action="ready"]');
  const readyStates = await Promise.all(pages.map(read));
  const leaderIndex = readyStates.findIndex((q) => q.id === q.room.host);
  if (leaderIndex < 0) throw Error("No connected squad leader");
  await pages[leaderIndex].click('[data-action="start"]');
  await pages[0].waitForSelector("#battle");
  const again = await read(pages[0]);
  if (again.room.world.id === before) throw Error("Run ID reused");
  report.repeatDeployment = true;
  writeFileSync(
    (process.env.QA_REPORT_DIR || "docs") + "/browser-qa.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) throw Error("Browser errors recorded");
} catch (e) {
  await pages[0]
    .screenshot({ path: `${output}/qa-failure.png` })
    .catch(() => {});
  const q = await read(pages[0]).catch(() => null);
  writeFileSync(
    (process.env.QA_REPORT_DIR || "docs") + "/browser-failure.json",
    JSON.stringify({ error: String(e), errors, state: q }, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
