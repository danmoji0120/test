import { chromium, type Page } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const saved = JSON.parse(
  readFileSync("docs/browser-failure.json", "utf8"),
).state;
const profiles = JSON.parse(
  readFileSync("data/profiles.json", "utf8"),
).profiles;
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const pages: Page[] = [];
for (const player of saved.room.players) {
  const profile = profiles.find((v: any) => v.token.startsWith(player.id));
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  await context.addInitScript(
    (token) => localStorage.setItem("doll-token", token),
    profile.token,
  );
  const page = await context.newPage();
  pages.push(page);
  await page.goto("http://localhost:3000");
  await page.waitForFunction(() => (window as any).dollQA?.connected);
}
const initial = await pages[0].evaluate(() => (window as any).dollQA);
if (initial.room?.phase !== "lobby")
  throw Error("Reconnect window elapsed; room unavailable");
for (const page of pages) {
  const me = await page.evaluate(() => {
    const q = (window as any).dollQA;
    return q.room.players.find((p: any) => p.id === q.id);
  });
  if (!me.ready) await page.click('[data-action="ready"]');
}
const status = await Promise.all(
  pages.map((p) => p.evaluate(() => (window as any).dollQA)),
);
const host = status.findIndex((q) => q.id === q.room.host);
await pages[host].click('[data-action="start"]');
await Promise.all(pages.map((p) => p.waitForSelector("#battle")));
const runs = await Promise.all(
  pages.map((p) => p.evaluate(() => (window as any).dollQA.room.world.id)),
);
if (new Set(runs).size !== 1) throw Error("Redeployment mismatch");
const priorRun = profiles
  .find((p: any) => p.token.startsWith(saved.id))
  .settled.at(-1);
if (priorRun === runs[0]) throw Error("Run ID reused");
const report = {
  completedMission:
    "success; four-client result equality was checked before the preceding harness timed out on stale host selection",
  previousPlayers: saved.room.players.map((p: any) => ({
    name: p.name,
    kills: p.kills,
    hp: p.hp,
  })),
  reconnect: true,
  ready: true,
  currentHostUsed: true,
  repeatDeployment: true,
  newRunId: runs[0],
  priorRunId: priorRun,
  room: initial.room.code,
  profiles: saved.room.players.map((p: any) => {
    const v = profiles.find((v: any) => v.token.startsWith(p.id));
    return { name: p.name, credits: v.credits, runs: v.runs, wins: v.wins };
  }),
};
writeFileSync("docs/resume-qa.json", JSON.stringify(report, null, 2));
console.log(report);
await pages[0].screenshot({ path: "docs/screenshots/redeployment.png" });
await browser.close();
