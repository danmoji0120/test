import { chromium } from "playwright";
import { Pilot } from "./bot";
import { drive } from "./browser-driver";
import { mkdirSync, writeFileSync } from "node:fs";
import { emptyInput, type World } from "../src/shared/data";
const output = process.env.QA_OUTPUT || "docs/v4.2/hint-browser";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
  errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const read = () =>
  page.evaluate(() => JSON.parse(JSON.stringify((window as any).dollQA)));
try {
  await page.goto(process.env.QA_URL || "http://localhost:3435");
  await page.waitForFunction(() => !!(window as any).dollQA?.connected);
  await page.click('[data-action="create"]');
  await page.selectOption("#mission", "defense");
  await page.selectOption("#difficulty", "1");
  await page.fill("#seed", "7");
  await page.locator("#seed").dispatchEvent("change");
  await page.click('[data-action="ready"]');
  await page.click('[data-action="start"]');
  await page.waitForSelector("#battle");
  const pilot = new Pilot(),
    start = Date.now();
  let verified = false;
  while (Date.now() - start < 120000) {
    const s = await read(),
      w = s.room.world as World,
      p = w.players.find((p) => p.id === s.id)!;
    const task = w.mission.objectives.find((o) => o.action === "defend");
    if (
      task?.phase === "방어 중" &&
      Math.hypot(p.x - task.operatingPoint!.x, p.y - task.operatingPoint!.y) <
        110
    ) {
      await drive(page, {
        ...emptyInput(),
        angle: p.angle,
        dx: 0,
        dy: 0,
        interact: false,
        fire: false,
      });
      await page.waitForFunction(() =>
        document
          .querySelector("#interaction")
          ?.textContent?.startsWith("자동 진행"),
      );
      await page.screenshot({ path: output + "/automatic-defense-hint.png" });
      writeFileSync(
        output + "/hint-browser.json",
        JSON.stringify(
          {
            method:
              "Final production DOM/WebSocket input-only phase smoke; stopped during a real defense event, NOT a completed operation",
            phase: task.phase,
            seconds: w.time,
            hint: await page.locator("#interaction").innerText(),
            errors,
          },
          null,
          2,
        ),
      );
      verified = true;
      break;
    }
    await drive(page, pilot.input(w, p, 0));
    await page.waitForTimeout(80);
  }
  if (!verified || errors.length)
    throw Error("Final interaction hint browser smoke failed");
} finally {
  await browser.close();
}
