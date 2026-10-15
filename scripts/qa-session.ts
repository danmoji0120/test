import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
const port = process.env.QA_PORT || "3302";
const reportDir =
  process.env.QA_REPORT_DIR || process.env.QA_OUTPUT || "docs/v3/manual";
// Keep the server in the same foreground QA process tree; detached jobs may be reclaimed by cloud tooling.
const dataDir = resolve(".qa-private-session-" + process.pid),
  trace = resolve(dataDir, "trace.json");
const server = spawn(process.execPath, ["dist/server.mjs"], {
  env: {
    ...process.env,
    PORT: port,
    NODE_ENV: "production",
    DATA_DIR: dataDir,
    QA_TRACE_FILE: trace,
  },
  stdio: "inherit",
});
let qa: ChildProcess | undefined,
  stopped = false;
server.on("exit", () => {
  if (!stopped) {
    process.exitCode = 1;
    qa?.kill("SIGTERM");
  }
});
const stop = () => {
  stopped = true;
  qa?.kill("SIGTERM");
  server.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    try {
      ready = (await fetch(`http://localhost:${port}/health`)).ok;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!ready) throw Error("QA server did not start");
  qa = spawn(
    process.execPath,
    ["--import", "tsx", process.env.QA_SCRIPT || "scripts/browser-qa.ts"],
    {
      env: {
        ...process.env,
        QA_URL: `http://localhost:${port}`,
        QA_OUTPUT: process.env.QA_OUTPUT || reportDir,
        QA_REPORT_DIR: reportDir,
      },
      stdio: "inherit",
    },
  );
  process.exitCode = await new Promise<number>((r) =>
    qa!.on("exit", (code) => r(code ?? 1)),
  );
} finally {
  const completed = trace.replace(/\.json$/, "-completed.json"),
    evidence = existsSync(completed) ? completed : trace;
  if (existsSync(evidence)) {
    mkdirSync(reportDir, { recursive: true });
    copyFileSync(evidence, resolve(reportDir, "server-trace.json"));
  }
  stop();
}
