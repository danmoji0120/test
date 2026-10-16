import { spawn } from "node:child_process";
import { mkdirSync, existsSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const reference = resolve(
  process.env.QA_V41_REFERENCE_ROOT || ".qa-private-v41-reference",
);
if (!existsSync(reference + "/src")) {
  mkdirSync(reference, { recursive: true });
  const archive = execFileSync(
    "git",
    [
      "archive",
      "51f7432d82aac4abb070a110656a2043101d66f3",
      "src",
      "scripts",
      "assets",
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "index.html",
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  execFileSync("tar", ["-x", "-C", reference], { input: archive });
}
if (!existsSync(reference + "/node_modules"))
  symlinkSync(
    resolve("node_modules"),
    reference + "/node_modules",
    process.platform === "win32" ? "junction" : "dir",
  );
const roots = [
  ["v41", reference],
  ["v42", process.cwd()],
];
const base = resolve(process.env.QA_REPORT_DIR || "docs/v4.2/performance");
for (const [version, cwd] of roots)
  for (const width of [1920, 1280])
    for (const count of [1, 2, 4]) {
      const out = resolve(base, `${version}-${width}-${count}`);
      mkdirSync(out, { recursive: true });
      const p = spawn(
        process.execPath,
        ["--import", "tsx", "scripts/dev-qa-session.ts"],
        {
          cwd,
          env: {
            ...process.env,
            QA_SCRIPTS: "scripts/render-qa.ts",
            QA_REPRESENTATIVE: "1",
            QA_WIDTH: String(width),
            QA_HEIGHT: width === 1920 ? "1080" : "720",
            QA_RENDER_PAGES: String(count),
            QA_OUTPUT: out,
            QA_PORT: "3424",
          },
          stdio: "inherit",
        },
      );
      if (await new Promise((r) => p.on("exit", r)))
        throw Error("Render measurement failed");
    }
for (const [version, cwd] of roots) {
  const out = resolve(base, `${version}-server`);
  mkdirSync(out, { recursive: true });
  const p = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/v4-server-stress.ts"],
    {
      cwd,
      env: { ...process.env, QA_REPORT_DIR: out, QA_STRESS_TERRAIN: "1" },
      stdio: "inherit",
    },
  );
  if (await new Promise((r) => p.on("exit", r)))
    throw Error("Server comparison failed");
}
