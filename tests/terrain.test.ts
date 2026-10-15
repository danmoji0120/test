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

it("positions all seven V4 enemy kinds and a physical motorpool exit safely across100 seeds", async () => {
  const { createWorld, makePlayer } = await import("../src/game/simulation");
  const { enemyRadius } = await import("../src/game/armor");
  const { invalidateNavigation } = await import("../src/game/map");
  for (let seed = 0; seed < 100; seed++) {
    const w = createWorld("spawn-v4", seed, [makePlayer("p", "P")], 10);
    for (const kind of [
      "rifle",
      "rush",
      "heavy",
      "juggernaut",
      "drone",
      "walker",
      "artillery",
    ])
      expect(
        w.enemies.some((e) => e.kind === kind),
        `${seed}:${kind}`,
      ).toBe(true);
    for (const e of w.enemies)
      expect(
        blocked(e, w.map.obstacles, enemyRadius(e.kind)),
        `${seed}:${e.kind}`,
      ).toBe(false);
    const s = w.map.sources.find((s) => s.kind === "barracks")!,
      e = w.enemies.find(
        (e) => e.kind === "walker" && e.reserve && e.sourceId === s.id,
      )!;
    expect(e).toBeTruthy();
    w.map.obstacles.find((o) => o.id === s.doorId)!.open = true;
    invalidateNavigation(w.map);
    expect(
      findPath(e, s.entry, w.map, 54).length,
      `motorpool exit ${seed}`,
    ).toBeGreaterThan(0);
  }
}, 20000);
