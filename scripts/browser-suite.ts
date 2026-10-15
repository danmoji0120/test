import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream, writeFileSync } from "node:fs";
const cases = [
  { name: "final-four", QA_PLAYERS: "4", QA_SEED: "42", QA_DIFFICULTY: "3" },
  {
    name: "final-solo",
    QA_PLAYERS: "1",
    QA_SEED: "7",
    QA_DIFFICULTY: "1",
    QA_STRATEGY: "all",
    QA_REVERSE: "1",
    QA_CONTRACT: "recon",
  },
  {
    name: "final-duo",
    QA_PLAYERS: "2",
    QA_SEED: "103",
    QA_DIFFICULTY: "3",
    QA_REVERSE: "1",
  },
];
mkdirSync("docs/v3", { recursive: true });
const results = [];
for (const item of cases) {
  const output = "docs/v3/" + item.name,
    stream = createWriteStream(output + "-run.txt");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/qa-session.ts"],
    {
      env: {
        ...process.env,
        ...item,
        QA_OUTPUT: output,
        QA_REPORT_DIR: output,
        QA_PORT: process.env.QA_PORT || "3302",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout!.pipe(stream);
  child.stderr!.pipe(stream);
  const code = await new Promise<number>((r) =>
    child.on("exit", (c) => r(c ?? 1)),
  );
  stream.end();
  results.push({ name: item.name, code });
  console.log(item.name, code === 0 ? "PASS" : "FAIL");
  writeFileSync("docs/v3/browser-suite.json", JSON.stringify(results, null, 2));
}
if (results.some((r) => r.code !== 0)) process.exitCode = 1;
