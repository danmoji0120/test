import { spawn } from "node:child_process";
import { mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(process.env.QA_OUTPUT || "docs/v4.2/adversarial");
mkdirSync(root, { recursive: true });
const scenarios = [
  ["all-optional", { QA_STRATEGY: "all", QA_COUNTS: "4", QA_SEEDS: "42" }],
  [
    "blind-solo10",
    {
      QA_RECKLESS: "1",
      QA_COUNTS: "1",
      QA_SEEDS: "7,42,103",
      QA_DIFFICULTY: "10",
    },
  ],
  [
    "evade5",
    {
      QA_STRATEGY: "evade",
      QA_COUNTS: "1",
      QA_SEEDS: "103",
      QA_DIFFICULTY: "5",
    },
  ],
  [
    "launch-reverse",
    {
      QA_MISSIONS: "launch",
      QA_REVERSE: "1",
      QA_COUNTS: "2",
      QA_SEEDS: "7,42,103",
    },
  ],
  [
    "launch-split",
    { QA_MISSIONS: "launch", QA_SPLIT: "1", QA_COUNTS: "2", QA_SEEDS: "42" },
  ],
] as const;
const rows = [];
for (const [name, env] of scenarios) {
  const out = resolve(root, name);
  mkdirSync(out, { recursive: true });
  const fd = openSync(out + "/run.txt", "w");
  const p = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/v42-operation-qa.ts"],
    {
      env: { ...process.env, ...env, QA_OUTPUT: out },
      stdio: ["ignore", fd, fd],
    },
  );
  const code = await new Promise<number>((r) => p.on("exit", (c) => r(c ?? 1)));
  closeSync(fd);
  rows.push({ name, code });
  writeFileSync(root + "/suite.json", JSON.stringify(rows, null, 2));
  console.log("ADVERSARIAL", name, code);
  if (code) process.exitCode = 1;
}
