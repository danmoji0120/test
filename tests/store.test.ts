import { it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/server/store";
it("persists unlocks, progression and exactly-once mission rewards across restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "doll-store-"));
  try {
    const s = new Store(dir),
      p = s.get();
    p.unlocks.push("sg");
    expect(s.settle(p, "run-1", 400, true, 15)).toBe(true);
    expect(s.settle(p, "run-1", 400, true, 15)).toBe(false);
    const restored = new Store(dir).get(p.token);
    expect(restored.credits).toBe(700);
    expect(restored.runs).toBe(1);
    expect(restored.unlocks).toContain("sg");
    expect(restored.kills).toBe(15);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("recovers a damaged primary save from a valid backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "doll-backup-"));
  try {
    const s = new Store(dir),
      p = s.get();
    s.save();
    writeFileSync(join(dir, "profiles.json"), "{broken");
    const restored = new Store(dir);
    expect(restored.get(p.token).token).toBe(p.token);
    expect(
      JSON.parse(readFileSync(join(dir, "profiles.json.bak"), "utf8")).version,
    ).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
