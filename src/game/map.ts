import { geometryCandidates, invalidateGeometry } from "./spatial";
import { clearNavigation } from "./navigation";
import type { GameMap, Rect, Vec, Zone, ZoneKind } from "../shared/data";
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export function blocked(p: Vec, obstacles: Rect[], radius = 16) {
  return geometryCandidates(
    obstacles,
    p.x - radius,
    p.y - radius,
    radius * 2,
    radius * 2,
  ).some(
    (o) =>
      !(o.kind === "door" && o.open) &&
      p.x + radius > o.x &&
      p.x - radius < o.x + o.w &&
      p.y + radius > o.y &&
      p.y - radius < o.y + o.h &&
      (!o.polygon ||
        pointInPolygon(p, o.polygon) ||
        o.polygon.some(
          (a, i) =>
            segmentDistanceSquared(
              p,
              a,
              o.polygon![(i + 1) % o.polygon!.length],
            ) <
            radius * radius,
        )),
  );
}
export function movementBlocked(p: Vec, map: GameMap, r = 16) {
  return (
    blocked(p, map.obstacles, r) ||
    map.installations.some((d) => d.hp > 0 && distance(p, d) < 43 + r)
  );
}
export function movementClear(a: Vec, b: Vec, map: GameMap, r = 16) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 18));
  for (let i = 1; i <= steps; i++)
    if (
      movementBlocked(
        {
          x: a.x + ((b.x - a.x) * i) / steps,
          y: a.y + ((b.y - a.y) * i) / steps,
        },
        map,
        r,
      )
    )
      return false;
  return true;
}
export function move(p: Vec, dx: number, dy: number, map: GameMap, r = 16) {
  const x = Math.max(
    Math.min(r, p.x),
    Math.min(Math.max(map.width - r, p.x), p.x + dx),
  );
  if (!movementBlocked({ x, y: p.y }, map, r)) p.x = x;
  const y = Math.max(
    Math.min(r, p.y),
    Math.min(Math.max(map.height - r, p.y), p.y + dy),
  );
  if (!movementBlocked({ x: p.x, y }, map, r)) p.y = y;
}
/** Substeps for strategic updates: never jump through thin walls after a long AI interval. */
export function moveSwept(
  p: Vec,
  dx: number,
  dy: number,
  map: GameMap,
  r = 16,
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
  for (let i = 0; i < steps; i++) move(p, dx / steps, dy / steps, map, r);
}
/** Ray vs AABB slab intersection; distance in [0,max], Infinity for a miss. */
export function rayRect(p: Vec, dir: Vec, o: Rect, max: number) {
  let near = 0,
    far = max;
  for (const axis of ["x", "y"] as const) {
    const lo = o[axis],
      hi = lo + (axis === "x" ? o.w : o.h),
      v = dir[axis];
    if (Math.abs(v) < 1e-8) {
      if (p[axis] < lo || p[axis] > hi) return Infinity;
    } else {
      let a = (lo - p[axis]) / v,
        b = (hi - p[axis]) / v;
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a);
      far = Math.min(far, b);
      if (near > far) return Infinity;
    }
  }
  if (!o.polygon) return near;
  if (pointInPolygon(p, o.polygon)) return 0;
  let hit = Infinity;
  for (let i = 0; i < o.polygon.length; i++) {
    const a = o.polygon[i],
      b = o.polygon[(i + 1) % o.polygon.length],
      sx = b.x - a.x,
      sy = b.y - a.y,
      den = dir.x * sy - dir.y * sx;
    if (Math.abs(den) < 1e-8) continue;
    const qx = a.x - p.x,
      qy = a.y - p.y,
      t = (qx * sy - qy * sx) / den,
      u = (qx * dir.y - qy * dir.x) / den;
    if (t >= 0 && t <= max && u >= 0 && u <= 1) hit = Math.min(hit, t);
  }
  return hit;
}
export function pointInPolygon(p: Vec, poly: Vec[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function segmentDistanceSquared(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return (p.x - a.x - dx * t) ** 2 + (p.y - a.y - dy * t) ** 2;
}
export function wallDistance(p: Vec, angle: number, max: number, map: GameMap) {
  const d = { x: Math.cos(angle), y: Math.sin(angle) };
  return geometryCandidates(
    map.obstacles,
    Math.min(p.x, p.x + d.x * max),
    Math.min(p.y, p.y + d.y * max),
    Math.abs(d.x * max),
    Math.abs(d.y * max),
  ).reduce(
    (v, o) =>
      o.kind === "door" && o.open ? v : Math.min(v, rayRect(p, d, o, max)),
    max,
  );
}
export function visible(a: Vec, b: Vec, map: GameMap) {
  const d = distance(a, b);
  return wallDistance(a, Math.atan2(b.y - a.y, b.x - a.x), d, map) >= d - 1;
}
export { region as generateMap } from "./map-generator";
export function invalidateNavigation(map: GameMap) {
  clearNavigation(map);
  invalidateGeometry(map.obstacles);
}
export { findPath } from "./navigation";
