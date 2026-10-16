import { resolve } from "node:path";
import { existsSync, mkdirSync as mkdir, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
const reference = resolve(
  process.env.QA_V4_REFERENCE_ROOT || ".qa-private-v4-reference",
);
if (!existsSync(reference + "/src")) {
  mkdir(reference, { recursive: true });
  const archive = execFileSync(
    "git",
    [
      "archive",
      "54709a6",
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
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
const roots = [
  ["v4", reference],
  ["v41", process.cwd()],
];
for (const [version, cwd] of roots)
  for (const width of [1920, 1280])
    for (const count of [1, 2, 4]) {
      const out = resolve(
        process.env.QA_REPORT_DIR || "docs/v4.1/performance",
        `${version}-${width}-${count}`,
      );
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
      const code = await new Promise<number>((r) =>
        p.on("exit", (c) => r(c ?? 1)),
      );
      if (code) throw Error(`${version}/${width}/${count} failed`);
      console.log("MEASURED", version, width, count);
    }

for (const [version, cwd] of roots)
  for (const terrain of [false, true]) {
    const out = resolve(
      process.env.QA_REPORT_DIR || "docs/v4.1/performance",
      `${version}-server`,
    );
    mkdirSync(out, { recursive: true });
    const p = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/v4-server-stress.ts"],
      {
        cwd,
        env: {
          ...process.env,
          QA_REPORT_DIR: out,
          QA_STRESS_TERRAIN: terrain ? "1" : "",
        },
        stdio: "inherit",
      },
    );
    const code = await new Promise<number>((r) =>
      p.on("exit", (c) => r(c ?? 1)),
    );
    if (code) throw Error("Server measurement failed");
  }
