import type { World, Enemy, Player, Vec } from "../shared/data";
import { distance, movementBlocked } from "./map";
import { ballisticDistance } from "./ballistics";
import { enemyRadius } from "./armor";
export const clearShot = (w: World, e: Enemy, target: Player) =>
  ballisticDistance(
    w,
    e,
    Math.atan2(target.y - e.y, target.x - e.x),
    distance(e, target),
  ) >=
  distance(e, target) - 17;
/** Uses a confirmed visible target. It chooses a real lateral firing angle; navigation still validates the path. */
export function peekPosition(
  w: World,
  e: Enemy,
  target: Player,
): Vec | undefined {
  const a = Math.atan2(target.y - e.y, target.x - e.x),
    side = Number(e.id.slice(1)) % 2 ? 1 : -1;
  for (const width of [150, 240, 330])
    for (const sign of [side, -side]) {
      const p = {
        x: e.x - Math.sin(a) * width * sign,
        y: e.y + Math.cos(a) * width * sign,
      };
      if (
        p.x < 70 ||
        p.y < 70 ||
        p.x > w.map.width - 70 ||
        p.y > w.map.height - 70 ||
        movementBlocked(p, w.map, enemyRadius(e.kind))
      )
        continue;
      if (
        ballisticDistance(
          w,
          p,
          Math.atan2(target.y - p.y, target.x - p.x),
          distance(p, target),
        ) >=
        distance(p, target) - 17
      )
        return p;
    }
}
