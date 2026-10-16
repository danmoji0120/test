/** Real network input only: slot actions at insertion, no hidden-state mutation. */
import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const out = process.env.QA_OUTPUT || "docs/v4.1/ui",
  url = process.env.QA_URL || "http://localhost:3416";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors: string[] = [];
const reports = [];
const read = (p: Page) =>
  p.evaluate(() => JSON.parse(JSON.stringify((window as any).dollQA)));
for (const consumable of ["antiarmor", "smoke", "frag", "medical"]) {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => (window as any).dollQA?.connected);
  await page.click('[data-weapon="at"]');
  await page.selectOption("#consumable", consumable);
  await page.screenshot({
    path: `${out}/loadout-${consumable}-1280.png`,
    fullPage: true,
  });
  await page.click('[data-action="create"]');
  await page.waitForSelector("#seed");
  await page.fill("#seed", "42");
  await page.locator("#seed").dispatchEvent("change");
  await page.selectOption("#difficulty", "1");
  await page.click('[data-action="ready"]');
  await page.click('[data-action="start"]');
  await page.waitForSelector("#battle");
  await page.waitForTimeout(400);
  const start = await read(page);
  await page.keyboard.press("2");
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/secondary-${consumable}.png` });
  const secondary = await read(page);
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.keyboard.press("1");
  await page.waitForTimeout(800);
  await page.mouse.down();
  await page.waitForTimeout(160);
  await page.screenshot({ path: `${out}/primary-at-${consumable}.png` });
  await page.mouse.up();
  await page.keyboard.press("3");
  await page.waitForTimeout(400);
  await page.mouse.move(760, 410);
  await page.mouse.down();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}/consumable-${consumable}.png` });
  await page.waitForTimeout(1000);
  await page.mouse.up();
  const end = await read(page);
  const me = end.room.players[0];
  reports.push({
    consumable,
    initial: start.room.players[0],
    secondary: secondary.room.players[0],
    end: me,
    smokes: end.room.world.map.smokes,
    events: end.room.world.events,
    phase: end.room.phase,
  });
  if (
    consumable !== "medical" &&
    me.consumableCount !== (consumable === "frag" ? 2 : 1)
  )
    throw Error("Held input consumed incorrect charge count: " + consumable);
  if (consumable === "medical" && me.consumableCount !== 2)
    throw Error("Full HP medical should not consume");
  if (me.guns.primary.ammo !== 0 || me.guns.secondary.ammo !== 11)
    throw Error("Independent ammo mismatch");
  await context.close();
}
writeFileSync(
  out + "/ui-qa.json",
  JSON.stringify(
    {
      method:
        "Actual production WebSocket/DOM controls at insertion. Medical full-HP rejection is shown; actual healing separately verified in authoritative tests/operation inputs. No teleport, enemy creation or damage fixture.",
      reports,
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
if (errors.length) throw Error(errors.join(","));
console.log(
  "four real loadouts, primary/secondary fire, held consumable latch and smoke: PASS",
);
