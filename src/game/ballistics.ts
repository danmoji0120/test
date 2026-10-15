import type { World, Vec } from "../shared/data";
import { wallDistance, distance } from "./map";
import { rayHit } from "./armor";
/** Facility shells stop enemy fire too. Player attacks resolve the same regions in the shared damage pipeline. */
export function ballisticDistance(
  w: World,
  p: Vec,
  angle: number,
  max: number,
  ignore = "",
) {
  let length = wallDistance(p, angle, max, w.map);
  for (const d of w.map.installations)
    if (d.hp > 0 && d.id !== ignore) {
      const h = rayHit(d, p, angle, length);
      if (h) length = Math.min(length, h.distance);
    }
  return length;
}
export function blastClear(w: World, a: Vec, b: Vec, ignore = "") {
  const range = distance(a, b);
  if (range < 1) return true;
  const angle = Math.atan2(b.y - a.y, b.x - a.x),
    p = { x: a.x + Math.cos(angle), y: a.y + Math.sin(angle) };
  return ballisticDistance(w, p, angle, range - 1, ignore) >= range - 1.05;
}
