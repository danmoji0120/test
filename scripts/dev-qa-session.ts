import { spawn } from "node:child_process";
import { resolve } from "node:path";
const port = process.env.QA_PORT || "3304",
  output = process.env.QA_OUTPUT || "docs/v3/final-performance";
const server = spawn(
  process.execPath,
  ["--import", "tsx", "src/server/index.ts"],
  {
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: port,
      DATA_DIR: resolve(".qa-private-dev-" + process.pid),
    },
    stdio: "inherit",
  },
);
try {
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    try {
      ready = (await fetch(`http://localhost:${port}/health`)).ok;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!ready) throw Error("QA dev server unavailable");
  for (const script of [
    "scripts/render-qa.ts",
    "scripts/audio-qa.ts",
    "scripts/region-visual-qa.ts",
  ]) {
    const child = spawn(process.execPath, ["--import", "tsx", script], {
      env: {
        ...process.env,
        QA_URL: `http://localhost:${port}`,
        QA_OUTPUT: output,
        QA_REPORT_DIR: output,
      },
      stdio: "inherit",
    });
    const code = await new Promise<number>((r) =>
      child.on("exit", (c) => r(c ?? 1)),
    );
    if (code !== 0) throw Error(script + " failed");
  }
} finally {
  server.kill("SIGTERM");
}
