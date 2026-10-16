import { it, expect } from "vitest";
import { MISSIONS, operationOptions } from "../src/shared/missions";
import { generateOperationMap } from "../src/game/operation-world";
import { createWorld, makePlayer } from "../src/game/simulation";
import {
  findPath,
  movementClear,
  movementBlocked,
  invalidateNavigation,
} from "../src/game/map";
import { navigationStats } from "../src/game/navigation";
it("repositions reactor27/defense59 layouts when the exact heavy facility entry is blocked", () => {
  for (const [id, profile, seed, count] of [
    ["reactor", "standard", 27, 1],
    ["defense", "compact", 59, 4],
  ] as const) {
    const map = generateOperationMap(
      seed,
      operationOptions(id, profile, seed % 3),
      3,
      count,
    );
    for (const z of map.zones)
      expect(movementBlocked(z.entry, map, 56)).toBe(false);
  }
});
it("generates all allowed mission profiles deterministically, including alternate deployment at an extraction cell", () => {
  for (const spec of Object.values(MISSIONS))
    for (const profile of spec.profiles) {
      const options = operationOptions(spec.id, profile, 1),
        a = generateOperationMap(42, options, 1, 4),
        b = generateOperationMap(42, options, 1, 4);
      expect(a.generation!.signature).toBe(b.generation!.signature);
      expect(a).toEqual(b);
      expect(a.spawn).toEqual(a.deployments![1]);
      expect(a.generation!.baseTravelSeconds).toBeLessThan(180);
      expect(a.obstacles.some((o) => o.kind === "rock")).toBe(true);
    }
}, 20000);
it("caches actual radius-specific long paths and invalidates them on physical door changes", () => {
  const map = generateOperationMap(7, operationOptions("survey"), 3, 4),
    start = map.spawn,
    goal = map.zones[0].entry;
  const a = findPath(start, goal, map, 56),
    b = findPath(start, goal, map, 56);
  expect(b).toEqual(a);
  expect(navigationStats(map).hits).toBeGreaterThan(0);
  let p = start;
  for (const q of a) {
    expect(movementClear(p, q, map, 56)).toBe(true);
    p = q;
  }
  const gate = map.obstacles.find((o) => o.kind === "door")!;
  gate.open = false;
  invalidateNavigation(map);
  expect(navigationStats(map).cachedPaths).toBe(0);
});
it("retains three-slot/AP actors when a new compact operation is deployed", () => {
  const players = Array.from({ length: 4 }, (_, i) => makePlayer("p" + i, "P"));
  players[3].weapon = "at";
  const w = createWorld(
    "new",
    103,
    players,
    10,
    "blackout",
    operationOptions("defense"),
  );
  expect(w.map.width).toBe(3200);
  expect(w.players[3].primary).toBe("at");
  expect(w.players[3].guns.secondary.id).toBe("pistol");
  expect(w.enemies.some((e) => e.kind === "walker")).toBe(true);
  expect(w.mission.objectives.every((o) => o.id !== o.facilityId)).toBe(true);
});
it("changing only deployment preserves strategic terrain, roads and facilities", () => {
  const a = generateOperationMap(
      42,
      operationOptions("survey", "expanded", 0),
      3,
      4,
    ),
    b = generateOperationMap(
      42,
      operationOptions("survey", "expanded", 2),
      3,
      4,
    );
  expect(a.obstacles).toEqual(b.obstacles);
  expect(a.roads).toEqual(b.roads);
  expect(a.installations).toEqual(b.installations);
  expect(a.spawn).not.toEqual(b.spawn);
});
