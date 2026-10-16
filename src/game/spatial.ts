import type { Rect } from "../shared/data";
/** Static geometry is indexed once; door open/closed state remains live in exact tests. */
const indices = new WeakMap<
  Rect[],
  { length: number; cells: Map<string, Rect[]> }
>();
const CELL = 256;
export function geometryCandidates(
  obstacles: Rect[],
  x: number,
  y: number,
  w: number,
  h: number,
): Rect[] {
  if (obstacles.length < 24 || !Number.isFinite(x + y + w + h))
    return obstacles;
  let index = indices.get(obstacles);
  if (!index || index.length !== obstacles.length) {
    index = { length: obstacles.length, cells: new Map() };
    for (const o of obstacles)
      for (
        let cy = Math.floor(o.y / CELL);
        cy <= Math.floor((o.y + o.h) / CELL);
        cy++
      )
        for (
          let cx = Math.floor(o.x / CELL);
          cx <= Math.floor((o.x + o.w) / CELL);
          cx++
        ) {
          const key = cx + ":" + cy,
            list = index.cells.get(key) ?? [];
          list.push(o);
          index.cells.set(key, list);
        }
    indices.set(obstacles, index);
  }
  const found = new Set<Rect>();
  for (let cy = Math.floor(y / CELL); cy <= Math.floor((y + h) / CELL); cy++)
    for (let cx = Math.floor(x / CELL); cx <= Math.floor((x + w) / CELL); cx++)
      for (const o of index.cells.get(cx + ":" + cy) ?? []) found.add(o);
  return [...found];
}
export function invalidateGeometry(obstacles: Rect[]) {
  indices.delete(obstacles);
}
