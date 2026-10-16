import { MISSIONS, operationOptions } from "../src/shared/missions";
import { generateOperationMap, workPoint } from "../src/game/operation-world";
import { reachableArea } from "../src/game/navigation";
import { blocked, distance, movementBlocked } from "../src/game/map";
import { mkdirSync, writeFileSync } from "node:fs";
const output = process.env.QA_OUTPUT ?? "docs/v4.2/generation";
mkdirSync(output, { recursive: true });
const counts = (process.env.QA_COUNTS ?? "1,2,4").split(",").map(Number);
const limit = Number(process.env.QA_SEED_COUNT ?? 100),
  seeds = [
    ...new Set([7, 42, 103, ...Array.from({ length: limit }, (_, i) => i)]),
  ].slice(0, limit);
const rows: any[] = [],
  failures: any[] = [];
for (const spec of Object.values(MISSIONS).filter(
  (m) =>
    !process.env.QA_MISSIONS ||
    process.env.QA_MISSIONS.split(",").includes(m.id),
))
  for (const profile of spec.profiles.filter(
    (p) =>
      !process.env.QA_PROFILES ||
      process.env.QA_PROFILES.split(",").includes(p),
  ))
    for (const count of counts) {
      const start = performance.now();
      for (const seed of seeds) {
        const deployment = seed % 3,
          options = operationOptions(spec.id, profile, deployment),
          before = performance.now();
        try {
          const map = generateOperationMap(seed, options, 3, count);
          const first = map.zones.find((z) =>
            map.installations.some(
              (d) =>
                d.zoneId === z.id &&
                map.missionNodes!.some(
                  (n) => n.id === d.objectiveId && n.required,
                ),
            ),
          )!;
          const heavy = reachableArea(map, first.entry, 56);
          for (const s of map.sources)
            if (!heavy.canReach(s.entry))
              throw Error("Disconnected heavy source " + s.id);
          for (const d of map.installations) {
            if (blocked(d, map.obstacles, 43))
              throw Error("Facility intersects terrain " + d.id);
            if (movementBlocked(workPoint(d, map), map, 20))
              throw Error("Blocked interaction point " + d.id);
            const zone = map.zones.find((z) => z.id === d.zoneId)!;
            if (!heavy.canReach(zone.entry))
              throw Error("Heavy cannot reach site approach " + d.id);
          }
          for (const p of map.deployments!)
            if (!heavy.canReach(p)) throw Error("Disconnected deployment");
          for (const p of map.extractions)
            if (!heavy.canReach(p)) throw Error("Disconnected extraction");
          if (!map.obstacles.some((o) => o.kind === "rock"))
            throw Error("Natural terrain was removed");
          if (seed === 7) {
            const replay = generateOperationMap(seed, options, 3, count);
            if (JSON.stringify(map) !== JSON.stringify(replay))
              throw Error("Nondeterministic generation");
          }
          rows.push({
            mission: spec.id,
            profile,
            count,
            seed,
            deployment,
            width: map.width,
            height: map.height,
            signature: map.generation!.signature,
            attempts: map.generation!.attempts,
            diagnostics: map.generation!.diagnostics,
            baseTravelSeconds: map.generation!.baseTravelSeconds,
            routeUnits: map.generation!.routeUnits,
            obstacles: map.obstacles.length,
            rocks: map.obstacles.filter((o) => o.kind === "rock").length,
            roads: map.roads.length,
            sources: map.sources.length,
            facilities: map.installations.length,
            heavyReachableCells: heavy.cells,
            generationAndValidationMs: performance.now() - before,
          });
        } catch (e) {
          failures.push({
            mission: spec.id,
            profile,
            count,
            seed,
            deployment,
            error: String(e),
          });
          console.log("FAIL", JSON.stringify(failures.at(-1)));
        }
      }
      console.log(
        JSON.stringify({
          mission: spec.id,
          profile,
          count,
          rows: rows.length,
          failures: failures.length,
          ms: performance.now() - start,
        }),
      );
      writeFileSync(
        output + "/world-generation.json",
        JSON.stringify(
          {
            method:
              "11 allowed mission/profile combinations,100 deterministic Seeds each,1/2/4 players,three rotating deployment choices; actual collision/working points/dependency route/56-radius connected component for every source/site/deployment/extraction; no terrain removal; no gameplay victory assertions",
            rows,
            failures,
          },
          null,
          2,
        ),
      );
    }
if (failures.length) process.exitCode = 1;
