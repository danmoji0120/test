import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
const root = resolve(process.env.QA_REPORT_DIR || "docs/v4.2/browser-release");
mkdirSync(root, { recursive: true });
type Case = {
  mission: string;
  count: number;
  seed: number;
  slug?: string;
  loadouts?: string;
  protect?: boolean;
};
const cases: Case[] = [
  { mission: "launch", count: 1, seed: 42 },
  { mission: "launch", count: 2, seed: 42 },
  { mission: "reactor", count: 1, seed: 42 },
  { mission: "transfer", count: 2, seed: 42 },
  { mission: "survey", count: 4, seed: 42 },
  { mission: "blitz", count: 1, seed: 42 },
  { mission: "defense", count: 4, seed: 103 },
  {
    mission: "survey",
    count: 1,
    seed: 7,
    slug: "survey-1-seed7",
    loadouts: "ar/medical",
  },
  {
    mission: "defense",
    count: 4,
    seed: 7,
    slug: "defense-4-seed7",
    loadouts: "ar/medical",
  },
  {
    mission: "defense",
    count: 4,
    seed: 103,
    slug: "defense-4-protect",
    protect: true,
  },
];
const rows = [];
for (const s of cases) {
  const { mission, count, seed } = s;
  const out = resolve(root, s.slug ?? `${mission}-${count}`);
  mkdirSync(out, { recursive: true });
  const fd = openSync(out + "/run.txt", "w");
  console.log(
    "BROWSER BEGIN",
    mission,
    count,
    seed,
    s.protect ? "protect" : "",
  );
  const p = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/qa-session.ts"],
    {
      env: {
        ...process.env,
        QA_PORT: "3432",
        QA_OUTPUT: out,
        QA_REPORT_DIR: out,
        QA_MISSION: mission,
        QA_SPLIT: mission === "launch" && count === 2 ? "1" : "",
        QA_PROTECT: s.protect ? "1" : "",
        QA_PLAYERS: String(count),
        QA_SEED: String(seed),
        QA_DIFFICULTY: "1",
        QA_ALLOW_FAILURE: "1",
        QA_WALL_MS: process.env.QA_WALL_MS || "900000",
        QA_MIXED: s.loadouts ? "" : "1",
        QA_LOADOUTS: s.loadouts || "ar/antiarmor,smg/smoke,sg/medical,at/frag",
        QA_VIDEO: mission === "transfer" ? "1" : "",
      },
      stdio: ["ignore", fd, fd],
    },
  );
  const code = await new Promise<number>((r) => p.on("exit", (c) => r(c ?? 1)));
  closeSync(fd);
  rows.push({ ...s, code });
  writeFileSync(root + "/suite.json", JSON.stringify(rows, null, 2));
  console.log("BROWSER END", mission, code);
}
if (rows.some((r) => r.code)) process.exitCode = 1;
