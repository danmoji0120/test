import { it, expect } from "vitest";
import { generateMap, blocked, findPath } from "../src/game/map";
it("reproduces semantic layout, roads and source relations from seed", () => {
  expect(generateMap(11)).toEqual(generateMap(11));
  const maps = Array.from({ length: 20 }, (_, i) => generateMap(i));
  expect(new Set(maps.map((m) => m.topology)).size).toBeGreaterThan(15);
  expect(
    new Set(
      maps.map((m) =>
        JSON.stringify(m.installations.map((d) => [d.kind, d.x, d.y])),
      ),
    ).size,
  ).toBeGreaterThan(15);
});
it("keeps every objective, extraction and dispatch exit reachable across 100 seeds", () => {
  for (let seed = 0; seed < 100; seed++) {
    const m = generateMap(seed);
    expect(blocked(m.spawn, m.obstacles, 20), "spawn " + seed).toBe(false);
    for (const p of [
      ...m.installations,
      ...m.extractions,
      ...m.supplies,
      m.intel,
      ...m.sources.map((s) => s.entry),
    ]) {
      expect(blocked(p, m.obstacles, 20), `seed${seed}@${p.x},${p.y}`).toBe(
        false,
      );
      expect(
        findPath(m.spawn, p, m).length,
        `path${seed}@${p.x},${p.y}`,
      ).toBeGreaterThan(0);
    }
    for (const s of m.sources.filter((s) => s.kind !== "external")) {
      expect(blocked(s, m.obstacles, 20), "source" + seed + s.id).toBe(false);
      expect(
        findPath(s, s.entry, m).length,
        "exit" + seed + s.id,
      ).toBeGreaterThan(0);
    }
  }
});
