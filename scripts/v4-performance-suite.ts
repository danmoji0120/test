import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
for (const width of [1920, 1280])
  for (const pages of [1, 2, 4]) {
    const output = `docs/v4/performance/render-${width}-${pages}`;
    mkdirSync(output, { recursive: true });
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/dev-qa-session.ts"],
      {
        env: {
          ...process.env,
          QA_SCRIPTS: "scripts/render-qa.ts",
          QA_RENDER_PAGES: String(pages),
          QA_WIDTH: String(width),
          QA_HEIGHT: width === 1920 ? "1080" : "720",
          QA_OUTPUT: output,
        },
        stdio: "inherit",
      },
    );
    const code = await new Promise<number>((r) =>
      child.on("exit", (c) => r(c ?? 1)),
    );
    if (code) throw Error("Render suite failure");
  }
const child = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/dev-qa-session.ts"],
  {
    env: {
      ...process.env,
      QA_SCRIPTS: "scripts/audio-qa.ts,scripts/v4-art-qa.ts",
      QA_OUTPUT: "docs/v4/performance/audio-art",
    },
    stdio: "inherit",
  },
);
process.exitCode = await new Promise<number>((r) =>
  child.on("exit", (c) => r(c ?? 1)),
);
