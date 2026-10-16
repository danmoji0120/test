import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const out = process.env.QA_OUTPUT || "docs/v4.1/fixtures";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const report = [];
for (const name of ["ricochet", "partial", "component", "tracking"]) {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.QA_URL || "http://localhost:3417") +
      "/scripts/v41-combat-fixture.html?case=" +
      name,
  );
  await page.waitForFunction(() => (window as any).fixture);
  await page.waitForTimeout(name === "tracking" ? 2500 : 1120);
  await page.screenshot({ path: out + "/fixture-" + name + ".png" });
  report.push({
    ...(await page.evaluate(() => (window as any).fixture.report())),
    errors,
  });
  await page.close();
  if (errors.length) throw Error(errors.join(","));
}
writeFileSync(
  out + "/fixture-qa.json",
  JSON.stringify(
    {
      method:
        "Real browser renders of authoritative combat-rule fixtures, fixed open terrain / stationary targets or high-HP moving observation target; explicitly not a normal network mission.",
      report,
    },
    null,
    2,
  ),
);
await browser.close();
