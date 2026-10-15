import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
const port = process.env.QA_PORT || "3302";
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
  qa = spawn(process.execPath, ["--import", "tsx", "scripts/browser-qa.ts"], {
    env: { ...process.env, QA_URL: `http://localhost:${port}` },
    stdio: "inherit",
  });
  process.exitCode = await new Promise<number>((r) =>
    qa!.on("exit", (code) => r(code ?? 1)),
  );
} finally {
  const evidence = trace.replace(/\.json$/, "-completed.json");
  if (process.env.QA_REPORT_DIR && existsSync(evidence)) {
    mkdirSync(process.env.QA_REPORT_DIR, { recursive: true });
    copyFileSync(
      evidence,
      resolve(process.env.QA_REPORT_DIR, "server-trace.json"),
    );
  }
  stop();
}
