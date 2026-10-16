import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const out = process.env.QA_OUTPUT ?? "docs/v4.2/ui",
  url = process.env.QA_URL ?? "http://localhost:3431";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors: string[] = [],
  records: any[] = [];
try {
  for (const mission of [
    "launch",
    "reactor",
    "transfer",
    "survey",
    "blitz",
    "defense",
  ]) {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      }),
      p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(url);
    await p.waitForFunction(() => (window as any).dollQA?.connected);
    await p.click('[data-action="create"]');
    await p.waitForSelector("#mission");
    await p.selectOption("#mission", mission);
    await p.waitForFunction(
      (m) => (window as any).dollQA.room?.operation?.missionId === m,
      mission,
    );
    await p.selectOption("#difficulty", "1");
    await p.fill("#seed", "42");
    await p.locator("#seed").dispatchEvent("change");
    await p.selectOption("#deployment", "1");
    await p.waitForFunction(
      () => (window as any).dollQA.room?.operation?.deployment === 1,
    );
    await p.screenshot({
      path: `${out}/${mission}-lobby-1280.png`,
      fullPage: true,
    });
    await p.click('[data-action="ready"]');
    await p.click('[data-action="start"]');
    await p.waitForSelector("#battle");
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/${mission}-insertion.png` });
    await p.keyboard.down("Tab");
    await p.waitForSelector("#tactical-map");
    await p.waitForTimeout(300);
    const before = await p.evaluate(() =>
      JSON.parse(JSON.stringify((window as any).dollQA)),
    );
    const rect = await p.locator("#tactical-map").boundingBox();
    if (!rect) throw Error("Missing tactical map");
    await p.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await p.mouse.wheel(0, -350);
    await p.waitForTimeout(500);
    await p.mouse.down();
    await p.mouse.move(
      rect.x + rect.width / 2 + 50,
      rect.y + rect.height / 2 + 20,
    );
    await p.mouse.up();
    await p.screenshot({ path: `${out}/${mission}-tactical.png` });
    const after = await p.evaluate(() =>
      JSON.parse(JSON.stringify((window as any).dollQA)),
    );
    const me = after.room.players.find((a: any) => a.id === after.id),
      old = before.room.players.find((a: any) => a.id === before.id);
    if (me.guns.primary.ammo !== old.guns.primary.ammo)
      throw Error("Tactical map click fired the primary");
    if (after.tactical.zoom <= 1) throw Error("Tactical map did not zoom");
    if (
      after.room.world.map.width > 12800 ||
      after.terrain.canvasBytes > 64 * 1024 * 1024
    )
      throw Error("Unbounded terrain canvas allocation");
    records.push({
      mission,
      operation: after.room.operation,
      width: after.room.world.map.width,
      height: after.room.world.map.height,
      spawn: after.room.world.map.spawn,
      me: { x: me.x, y: me.y },
      terrain: after.terrain,
      tactical: after.tactical,
      cameraBefore: before.camera,
      cameraAfter: after.camera,
      primaryAmmo: me.guns.primary.ammo,
    });
    await p.keyboard.up("Tab");
    await context.close();
    await new Promise((r) => setTimeout(r, 1100));
  }
  if (errors.length) throw Error(errors.join("\n"));
  writeFileSync(
    out + "/ui-qa.json",
    JSON.stringify(
      {
        method:
          "Actual production WebSocket and DOM inputs, ordinary insertion, no world mutation; UI only, not mission completion",
        records,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("UI cases passed", records.length);
} finally {
  await browser.close();
}
