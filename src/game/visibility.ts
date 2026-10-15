import type { GameMap, Rect, Vec, World } from "../shared/data";
import { distance, rayRect } from "./map";
export const SIGHT_RANGE = 850,
  FOG_CELL = 50;
export interface Vision {
  revision: number;
  cell: number;
  cols: number;
  rows: number;
  explored: number[];
  polygons: Vec[][];
  updated: number;
}
export const occludes = (o: Rect) =>
  o.kind !== "crate" && o.kind !== "fence" && !(o.kind === "door" && o.open);
export function sightDistance(
  p: Vec,
  angle: number,
  max: number,
  map: GameMap,
) {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const endX = p.x + dir.x * max,
    endY = p.y + dir.y * max,
    minX = Math.min(p.x, endX),
    maxX = Math.max(p.x, endX),
    minY = Math.min(p.y, endY),
    maxY = Math.max(p.y, endY);
  let length = max;
  for (const o of map.obstacles)
    if (
      occludes(o) &&
      o.x <= maxX &&
      o.x + o.w >= minX &&
      o.y <= maxY &&
      o.y + o.h >= minY
    )
      length = Math.min(length, rayRect(p, dir, o, max));
  return length;
}
export function lineOfSight(a: Vec, b: Vec, map: GameMap, range = Infinity) {
  const d = distance(a, b);
  return (
    d <= range &&
    sightDistance(a, Math.atan2(b.y - a.y, b.x - a.x), d, map) >= d - 0.01
  );
}
export function visionPolygon(
  p: Vec,
  map: GameMap,
  range = SIGHT_RANGE,
): Vec[] {
  const angles: number[] = Array.from(
    { length: 128 },
    (_, i) => (i * Math.PI * 2) / 128,
  );
  for (const o of map.obstacles) {
    if (
      !occludes(o) ||
      p.x < o.x - range ||
      p.x > o.x + o.w + range ||
      p.y < o.y - range ||
      p.y > o.y + o.h + range
    )
      continue;
    for (const v of o.polygon ?? [
      { x: o.x, y: o.y },
      { x: o.x + o.w, y: o.y },
      { x: o.x, y: o.y + o.h },
      { x: o.x + o.w, y: o.y + o.h },
    ]) {
      const a = Math.atan2(v.y - p.y, v.x - p.x);
      angles.push(a - 0.00001, a, a + 0.00001);
    }
  }
  return angles
    .sort((a, b) => a - b)
    .map((a) => {
      const d = sightDistance(p, a, range, map);
      return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
    });
}
export function squadSees(w: World, p: Vec) {
  return w.players.some(
    (a) => a.connected && !a.down && lineOfSight(a, p, w.map, SIGHT_RANGE),
  );
}
const visionCache = new WeakMap<
  World,
  { positions: (Vec & { id: string })[]; terrain: number }
>();
export function updateVision(w: World, force = false) {
  if (!force && w.time - w.visibility.updated < 0.2) return;
  const v = w.visibility;
  v.updated = w.time;
  const live = w.players.filter((p) => p.connected && !p.down);
  const cached = visionCache.get(w);
  if (
    !force &&
    cached &&
    cached.terrain === w.terrainRevision &&
    cached.positions.length === live.length &&
    live.every(
      (p, i) =>
        p.id === cached.positions[i].id && distance(p, cached.positions[i]) < 8,
    )
  )
    return;
  visionCache.set(w, {
    positions: live.map((p) => ({ id: p.id, x: p.x, y: p.y })),
    terrain: w.terrainRevision,
  });
  v.revision++;
  v.polygons = live.map((p) => visionPolygon(p, w.map));
  for (const p of live) {
    const minX = Math.max(0, Math.floor((p.x - SIGHT_RANGE) / v.cell)),
      maxX = Math.min(v.cols - 1, Math.floor((p.x + SIGHT_RANGE) / v.cell));
    const minY = Math.max(0, Math.floor((p.y - SIGHT_RANGE) / v.cell)),
      maxY = Math.min(v.rows - 1, Math.floor((p.y + SIGHT_RANGE) / v.cell));
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const k = y * v.cols + x;
        if (v.explored[k]) continue;
        if (
          [
            [1, 1],
            [49, 1],
            [1, 49],
            [49, 49],
            [25, 25],
          ].every(([a, b]) =>
            lineOfSight(
              p,
              { x: x * v.cell + a, y: y * v.cell + b },
              w.map,
              SIGHT_RANGE,
            ),
          )
        )
          v.explored[k] = 1;
      }
  }
}
export function initialVision(map: GameMap): Vision {
  const cols = Math.ceil(map.width / FOG_CELL),
    rows = Math.ceil(map.height / FOG_CELL);
  return {
    revision: 0,
    cell: FOG_CELL,
    cols,
    rows,
    explored: Array(cols * rows).fill(0),
    polygons: [],
    updated: -1,
  };
}
