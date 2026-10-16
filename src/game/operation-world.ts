import { MISSIONS, operationOptions } from "../shared/missions";
import { RULES } from "../shared/rules";
import type { GameMap, Installation, Vec } from "../shared/data";
import type { OperationOptions } from "../shared/missions";
import { region } from "./map-generator";
import { spatialPlan } from "./world-plan";
import { distance, findPath, movementBlocked, movementClear } from "./map";
export function workPoint(d: Installation, map: GameMap): Vec {
  const z =
    map.zones.find((z) => z.id === d.zoneId) ??
    [...map.zones].sort(
      (a, b) => distance(a.center, d) - distance(b.center, d),
    )[0];
  const a = Math.atan2(z.entry.y - d.y, z.entry.x - d.x);
  for (const r of [110, 145, 180])
    for (const offset of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const p = {
        x: d.x + Math.cos(a + offset) * r,
        y: d.y + Math.sin(a + offset) * r,
      };
      if (!movementBlocked(p, map, 20)) return p;
    }
  throw Error("No working position for " + d.id);
}
function signature(
  map: GameMap,
  options: OperationOptions,
  difficulty: number,
  count: number,
) {
  let hash = 2166136261;
  const text = JSON.stringify([
    options,
    difficulty,
    count,
    map.zones,
    map.obstacles,
    map.roads,
    map.installations.map((d) => [d.id, d.x, d.y]),
  ]);
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash.toString(16).padStart(8, "0");
}
export function generateOperationMap(
  seed: number,
  options: OperationOptions,
  difficulty = 3,
  count = 1,
): GameMap {
  options = operationOptions(
    options.missionId,
    options.profile,
    options.deployment,
  );
  const diagnostics: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++)
    try {
      const map = region(
        seed,
        spatialPlan(seed, options, difficulty, count, attempt),
      );
      map.spawn = { ...map.deployments![0] };
      if (
        map.deployments!.some((spawn) =>
          [0, 1, 2, 3].some((i) =>
            movementBlocked(
              {
                x: spawn.x + (i % 2) * 60,
                y: spawn.y + Math.floor(i / 2) * 60,
              },
              map,
              20,
            ),
          ),
        )
      )
        throw Error("Unsafe deployment formation");
      for (const d of map.installations) {
        const p = workPoint(d, map);
        if (!findPath(map.spawn, p, map).length && distance(map.spawn, p) > 80)
          throw Error("Unreachable work point " + d.id);
      }
      for (const p of map.extractions)
        if (!findPath(map.spawn, p, map).length && distance(map.spawn, p) > 80)
          throw Error("Unreachable extraction");
      const main = map.installations.find(
        (d) => map.missionNodes!.find((n) => n.id === d.objectiveId)?.required,
      )!;
      const target = map.zones.find((z) => z.id === main.zoneId)!.entry;
      for (const zone of map.zones) {
        const path = findPath(target, zone.entry, map, 56);
        if (
          movementBlocked(zone.entry, map, 56) ||
          (!path.length && distance(target, zone.entry) > 80)
        )
          throw Error("Blocked heavy site approach " + zone.id);
      }
      for (const p of map.deployments!) {
        if (
          movementBlocked(p, map, 56) ||
          (!findPath(target, p, map, 56).length && distance(target, p) > 80)
        )
          throw Error("No heavy deployment approach");
      }
      for (const source of map.sources) {
        if (!findPath(source.entry, target, map, 56).length)
          throw Error("No heavy approach from " + source.id);
        if (
          source.kind !== "external" &&
          !movementClear(source, source.entry, map, 56)
        )
          throw Error("Blocked motorpool exit " + source.id);
      }
      const routes = map.deployments!.map((spawn) => {
        map.spawn = { ...spawn };
        return missionRouteUnits(map);
      });
      map.spawn = { ...map.deployments![options.deployment] };
      map.supplies.push({ x: map.spawn.x + 65, y: map.spawn.y, used: false });
      const routeUnits = routes[options.deployment];
      const baseTravelSeconds = routeUnits / RULES.moveSpeed;
      const maxTravel =
        options.missionId === "blitz"
          ? 90
          : options.missionId === "defense"
            ? 60
            : 180;
      if (Math.max(...routes) / RULES.moveSpeed > maxTravel)
        throw Error(
          `Excessive pure travel ${baseTravelSeconds.toFixed(1)}s > ${maxTravel}s`,
        );
      map.generation = {
        routeUnits,
        baseTravelSeconds,
        version: 42,
        signature: signature(map, options, difficulty, count),
        attempts: attempt + 1,
        diagnostics,
      };
      return map;
    } catch (e) {
      diagnostics.push(
        `attempt${attempt + 1}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  throw Error("작전구역 생성 실패: " + diagnostics.join("; "));
}

/** Dependency-respecting baseline route measured on actual collision paths, including extraction. */
function missionRouteUnits(map: GameMap) {
  const spec = MISSIONS[map.operation!.missionId];
  const required = map.missionNodes!.filter(
    (n) => n.required || (spec.id === "reactor" && n.id === "security"),
  );
  const visited = new Set<string>();
  let current = map.spawn,
    total = 0,
    completed = 0;
  const pathLength = (from: Vec, to: Vec) => {
    const path = findPath(from, to, map);
    if (!path.length && distance(from, to) > 80) return Infinity;
    let sum = 0,
      p = from;
    for (const q of path) {
      sum += distance(p, q);
      p = q;
    }
    return sum + distance(p, to);
  };
  while (visited.size < required.length) {
    const ready = required
      .filter(
        (n) =>
          !visited.has(n.id) &&
          (!n.prerequisiteIds.length ||
            (n.prerequisiteMode === "any"
              ? n.prerequisiteIds.some((id) => visited.has(id))
              : n.prerequisiteIds.every((id) => visited.has(id)))),
      )
      .map((n) => {
        const d = map.installations.find((d) => d.objectiveId === n.id)!;
        const p = workPoint(d, map);
        return { n, p, length: pathLength(current, p) };
      })
      .sort((a, b) => a.length - b.length);
    const next = ready[0];
    if (!next || !Number.isFinite(next.length))
      throw Error("No dependency-valid mission route");
    total += next.length;
    current = next.p;
    visited.add(next.n.id);
    if (spec.completion.ids.includes(next.n.id)) completed++;
    if (completed >= spec.completion.count) break;
  }
  const exit = Math.min(...map.extractions.map((p) => pathLength(current, p)));
  if (!Number.isFinite(exit)) throw Error("No final extraction route");
  return total + exit;
}
