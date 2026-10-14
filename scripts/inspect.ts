import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.log("ERROR", e.message));
await page.goto("http://localhost:3000");
await page.waitForFunction(() =>
  document.body.textContent?.includes("서버 연결됨"),
);
await page.screenshot({
  path: "docs/screenshots/lobby-1920.png",
  fullPage: true,
});
await page.click('[data-character="luna"]');
await page.screenshot({
  path: "docs/screenshots/luna-1920.png",
  fullPage: true,
});
await page.setViewportSize({ width: 1280, height: 720 });
await page.screenshot({
  path: "docs/screenshots/lobby-1280.png",
  fullPage: true,
});
await page.click('[data-action="create"]');
await page.waitForSelector('[data-action="ready"]');
await page.click('[data-action="ready"]');
await page.click('[data-action="start"]');
await page.waitForSelector("#battle");
await page.waitForTimeout(1500);
await page.screenshot({ path: "docs/screenshots/combat-1280.png" });
console.log(
  await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    qa: (window as any).dollQA.room.phase,
  })),
);
await browser.close();
