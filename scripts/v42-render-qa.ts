import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const out = process.env.QA_OUTPUT || "docs/v4.2/performance/world-render";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});
const rows: any[] = [],
  errors: string[] = [];
const stats = (a: number[]) => {
  a.sort((a, b) => a - b);
  return {
    samples: a.length,
    mean: a.reduce((n, v) => n + v, 0) / a.length,
    p95: a[Math.floor(a.length * 0.95)],
  };
};
try {
  for (const profile of ["compact", "standard", "large", "expanded"]) {
    const p = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    p.on("pageerror", (e) => errors.push(e.message));
    const before = Date.now();
    await p.goto(
      (process.env.QA_URL || "http://localhost:3304") +
        "/scripts/v42-render-fixture.html?profile=" +
        profile,
    );
    await p.waitForFunction(() => !!(window as any).measure);
    const entryMs = Date.now() - before;
    await p.waitForTimeout(Number(process.env.QA_RENDER_WARM_MS || 12000));
    const initial = await p.evaluate(() => (window as any).measure());
    const checks = await p.evaluate(() => (window as any).chunkChecks());
    await p.screenshot({ path: out + "/" + profile + ".png" });
    const after = await p.evaluate(() => (window as any).traverse());
    if (
      // Independently clipped Skia canvases quantize antialiased image samples slightly
      // differently. Permit at most4/255 per channel, while identical-coordinate
      // regeneration must remain byte-exact. Raw mismatches are retained in evidence.
      checks.maxDifference > 4 ||
      checks.repaintMismatchChannels ||
      after.chunks.canvasBytes > 64 * 1024 * 1024 ||
      after.floor !== null ||
      (profile !== "compact" && after.chunks.evicted === 0)
    )
      throw Error(
        "Chunk invariant failure " + JSON.stringify({ profile, checks, after }),
      );
    rows.push({
      profile,
      entryMs,
      dimensions: initial.dimensions,
      generationMs: initial.generationMs,
      frames: stats(initial.frames),
      drawMs: stats(initial.drawMs),
      averageFPS: 1000 / stats(initial.frames).mean,
      heapMiB: initial.heapMiB,
      actors: initial.actors,
      initialChunks: initial.chunks,
      afterTraversal: after.chunks,
      checks,
    });
    console.log("WORLD RENDER", profile, rows.at(-1));
    await p.close();
  }
} finally {
  await browser.close();
  writeFileSync(
    out + "/world-render.json",
    JSON.stringify(
      {
        fixture:
          "Actual generated terrain/Fog/PNG rendering, controlled camera traversal and pixel comparisons. Not gameplay victory proof; single1920x1080 software browser.",
        rows,
        errors,
      },
      null,
      2,
    ),
  );
}
if (errors.length) throw Error(errors.join("\n"));
