import type { World, Enemy } from "../shared/data";
import { ENEMIES } from "../shared/data";
import { distance, moveSwept, findPath } from "./map";
import { enemyRadius, special, mobilityMultiplier } from "./armor";
/** Far units keep continuous positions and collision; only strategic decisions run at2Hz. */
export function strategicAI(w: World, e: Enemy, dt: number) {
  if (
    e.reserve ||
    e.traveling ||
    e.memory > 0 ||
    e.windup > 0 ||
    w.players.some((p) => p.connected && !p.down && distance(p, e) < 1300)
  )
    return false;
  e.strategicAt ??= 0;
  if (w.time >= e.strategicAt) {
    e.strategicAt = w.time + 0.5;
    const patrol = e.patrol.length ? e.patrol : [e.home],
      goal = patrol[e.patrolIndex % patrol.length];
    if (distance(e, goal) < 45) {
      e.patrolIndex = (e.patrolIndex + 1) % patrol.length;
      e.path = [];
    }
    if (!e.path.length || e.repath <= 0) {
      e.path = findPath(e, goal, w.map, enemyRadius(e.kind));
      e.repath = 3;
    }
  }
  while (e.path.length && distance(e, e.path[0]) < 8) e.path.shift();
  const point = e.path[0];
  if (point) {
    const d = distance(e, point),
      step = Math.min(
        d,
        ENEMIES[e.kind].speed * 0.5 * dt * mobilityMultiplier(e),
      );
    e.angle = Math.atan2(point.y - e.y, point.x - e.x);
    moveSwept(
      e,
      ((point.x - e.x) / d) * step,
      ((point.y - e.y) / d) * step,
      w.map,
      enemyRadius(e.kind),
    );
  }
  return true;
}
