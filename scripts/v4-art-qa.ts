import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const output = process.env.QA_OUTPUT || "docs/v4/screenshots/enemy-fixtures";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const report = [];
for (const kind of ["juggernaut", "drone", "walker", "artillery"]) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.QA_URL || "http://localhost:3304") +
      "/scripts/v4-combat-fixture.html?kind=" +
      kind,
  );
  await page.waitForFunction(() => (window as any).ready);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${output}/${kind}.png` });
  if (errors.length) throw Error(errors.join("\n"));
  report.push(
    await page.evaluate(() => {
      const w = (window as any).fixture.world;
      return {
        kind: w.enemies[0]?.kind,
        hp: w.players[0].hp,
        phase: w.enemies[0]?.phase,
        projectiles: w.projectiles.length,
      };
    }),
  );
  if (errors.length) throw Error(errors.join("\n"));
  await page.close();
}
writeFileSync(output + "/enemy-report.json", JSON.stringify(report, null, 2));
await browser.close();
