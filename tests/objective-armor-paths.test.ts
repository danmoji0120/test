import { it, expect } from "vitest";
import { createWorld, makePlayer } from "../src/game/simulation";
import {
  findPath,
  movementBlocked,
  distance,
  wallDistance,
} from "../src/game/map";
import { hitRegions, worldPoint, rayHit } from "../src/game/armor";
it("keeps an AP1-accessible reachable rear core for both generators across100 seeds, so non-AT primaries are never equipment-locked", () => {
  for (let seed = 0; seed < 100; seed++) {
    const w = createWorld("core-access", seed, [makePlayer("p", "P")], 1);
    for (const d of w.map.installations.filter((d) => d.kind === "generator")) {
      const core = hitRegions(d).find((r) => r.id === "core")!,
        point = worldPoint(d, core);
      let valid = false;
      for (const range of [110, 160, 210]) {
        for (const delta of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
          const a = (d.angle ?? 0) + Math.PI + delta,
            p = { x: d.x + Math.cos(a) * range, y: d.y + Math.sin(a) * range };
          if (movementBlocked(p, w.map, 16)) continue;
          const ray = rayHit(
            d,
            p,
            Math.atan2(point.y - p.y, point.x - p.x),
            distance(p, point) + 30,
          );
          if (
            ray?.region.id === "core" &&
            ray.region.av < 1 &&
            wallDistance(
              p,
              Math.atan2(point.y - p.y, point.x - p.x),
              distance(p, point),
              w.map,
            ) >=
              ray.distance - 0.01 &&
            findPath(w.map.spawn, p, w.map).length > 0
          ) {
            valid = true;
            break;
          }
        }
        if (valid) break;
      }
      expect(
        valid,
        `seed ${seed} ${d.id} must allow a real reachable core shot`,
      ).toBe(true);
    }
  }
}, 30000);
