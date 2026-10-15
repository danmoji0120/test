import { it, expect } from "vitest";
import { generateMap, findPath, blocked, rayRect } from "../src/game/map";
it("uses the same polygon for rock occupancy and shot/visibility rays", () => {
  const rock = {
    x: 100,
    y: 100,
    w: 100,
    h: 100,
    kind: "rock" as const,
    polygon: [
      { x: 150, y: 100 },
      { x: 200, y: 150 },
      { x: 150, y: 200 },
      { x: 100, y: 150 },
    ],
  };
  expect(blocked({ x: 105, y: 105 }, [rock], 0)).toBe(false);
  expect(blocked({ x: 150, y: 150 }, [rock], 0)).toBe(true);
  expect(rayRect({ x: 0, y: 105 }, { x: 1, y: 0 }, rock, 300)).toBeCloseTo(145);
});
it("keeps a 112px walker route from every external entry to both primary approaches in 100 seeds", () => {
  for (let seed = 0; seed < 100; seed++) {
    const m = generateMap(seed);
    for (const s of m.sources.filter((s) => s.kind === "external"))
      for (const z of m.zones.slice(0, 2))
        expect(
          findPath(s.entry, z.entry, m, 56).length,
          `heavy ${seed}:${s.id}->${z.id}`,
        ).toBeGreaterThan(0);
    expect(m.obstacles.filter((o) => o.kind === "rock").length).toBeGreaterThan(
      20,
    );
    expect(m.roads.length).toBeGreaterThan(m.zones.length);
  }
}, 25000);
