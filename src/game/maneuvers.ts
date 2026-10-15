import type { World, Vec } from "../shared/data";
import { findPath, distance } from "./map";
import { enemyRadius } from "./armor";
import { audit } from "./alert";
/** Reuse physically existing mobile troops when regional capacity is crowded. No births, removals or coordinate changes. */
export function redirectPatrols(w: World, target: Vec) {
  if (w.time - (w.director.redirectAt ?? -100) < 8) return 0;
  const candidates = w.enemies
    .filter(
      (e) =>
        e.hp > 0 &&
        !e.reserve &&
        !e.traveling &&
        e.memory <= 0 &&
        (!!e.requestId || e.sourceId.startsWith("patrol-")) &&
        distance(e, target) > 800,
    )
    .sort((a, b) => distance(a, target) - distance(b, target));
  let count = 0;
  for (const e of candidates) {
    const path = findPath(e, target, w.map, enemyRadius(e.kind));
    if (!path.length) continue;
    audit(
      w,
      "redirected",
      JSON.stringify({
        enemy: e.id,
        origin: { x: e.x, y: e.y },
        target,
        path,
        source: e.sourceId,
      }),
    );
    e.lastSeen = { ...target };
    e.memory = 5;
    e.home = { ...target };
    e.patrol = [{ ...target }];
    e.patrolIndex = 0;
    e.path = path;
    e.repath = 3;
    e.state = "INVESTIGATE";
    if (++count >= (w.director.commsDown ? 2 : 4)) break;
  }
  if (count) w.director.redirectAt = w.time;
  return count;
}
