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
  return obstacles.some(
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
export function move(p: Vec, dx: number, dy: number, map: GameMap, r = 16) {
  const x = Math.max(
    Math.min(r, p.x),
    Math.min(Math.max(map.width - r, p.x), p.x + dx),
  );
  if (!blocked({ x, y: p.y }, map.obstacles, r)) p.x = x;
  const y = Math.max(
    Math.min(r, p.y),
    Math.min(Math.max(map.height - r, p.y), p.y + dy),
  );
  if (!blocked({ x: p.x, y }, map.obstacles, r)) p.y = y;
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
  return map.obstacles.reduce(
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
  navigationGrids.delete(map);
}
const navigationGrids = new WeakMap<GameMap, Map<number, Uint8Array>>();
function navigationGrid(map: GameMap, radius: number) {
  const size = Math.max(20, Math.ceil(radius / 4) * 4),
    cache = navigationGrids.get(map) ?? new Map<number, Uint8Array>();
  navigationGrids.set(map, cache);
  let grid = cache.get(size);
  if (!grid) {
    const cols = Math.ceil(map.width / 50),
      rows = Math.ceil(map.height / 50);
    grid = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        grid[y * cols + x] = Number(
          blocked({ x: x * 50 + 25, y: y * 50 + 25 }, map.obstacles, size),
        );
    cache.set(size, grid);
  }
  return grid;
}
/** Small-grid A*; diagonal corner-cutting is deliberately disallowed. */
export function findPath(
  start: Vec,
  goal: Vec,
  map: GameMap,
  radius = 16,
): Vec[] {
  const grid = navigationGrid(map, radius);
  const cell = 50,
    cols = Math.ceil(map.width / 50),
    rows = Math.ceil(map.height / 50),
    key = (x: number, y: number) => y * cols + x;
  let sx = Math.floor(start.x / cell),
    sy = Math.floor(start.y / cell);
  const originalGx = Math.floor(goal.x / cell),
    originalGy = Math.floor(goal.y / cell);
  let bridge: Vec | undefined;
  if (grid[key(sx, sy)]) {
    const candidates: Vec[] = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = sx + dx,
          y = sy + dy,
          point = { x: x * cell + 25, y: y * cell + 25 };
        if (x < 1 || y < 1 || x >= cols - 1 || y >= rows - 1 || grid[key(x, y)])
          continue;
        if (!visible(start, point, map)) continue;
        let safe = true;
        for (let i = 1; i <= 8; i++)
          if (
            blocked(
              {
                x: start.x + ((point.x - start.x) * i) / 8,
                y: start.y + ((point.y - start.y) * i) / 8,
              },
              map.obstacles,
              radius,
            )
          ) {
            safe = false;
            break;
          }
        if (safe) candidates.push(point);
      }
    candidates.sort((a, b) => distance(start, a) - distance(start, b));
    bridge = candidates[0];
    if (!bridge) return [];
    sx = Math.floor(bridge.x / cell);
    sy = Math.floor(bridge.y / cell);
  }
  const s = key(sx, sy);
  let gx = originalGx,
    gy = originalGy;
  if (grid[key(gx, gy)]) {
    const nearby: Vec[] = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = gx + dx,
          y = gy + dy;
        if (
          x > 0 &&
          x < cols - 1 &&
          y > 0 &&
          y < rows - 1 &&
          !grid[key(x, y)] &&
          visible({ x: x * cell + 25, y: y * cell + 25 }, goal, map)
        )
          nearby.push({ x, y });
      }
    nearby.sort(
      (a, b) =>
        distance({ x: a.x * cell + 25, y: a.y * cell + 25 }, goal) -
        distance({ x: b.x * cell + 25, y: b.y * cell + 25 }, goal),
    );
    if (!nearby.length) return [];
    gx = nearby[0].x;
    gy = nearby[0].y;
  }
  const g = key(gx, gy);
  const open = [s],
    came = new Map<number, number>(),
    cost = new Map([[s, 0]]),
    score = new Map([[s, 0]]),
    closed = new Set<number>();
  let end = s;
  while (open.length) {
    let index = 0;
    for (let i = 1; i < open.length; i++)
      if (score.get(open[i])! < score.get(open[index])!) index = i;
    const k = open.splice(index, 1)[0];
    if (k === g) {
      end = k;
      break;
    }
    closed.add(k);
    const x = k % cols,
      y = Math.floor(k / cols);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        n = key(nx, ny);
      if (
        nx < 1 ||
        ny < 1 ||
        nx >= cols - 1 ||
        ny >= rows - 1 ||
        closed.has(n) ||
        grid[n] === 1
      )
        continue;
      const c = cost.get(k)! + 1;
      if (c < (cost.get(n) ?? Infinity)) {
        came.set(n, k);
        cost.set(n, c);
        score.set(n, c + Math.abs(nx - gx) + Math.abs(ny - gy));
        if (!open.includes(n)) open.push(n);
      }
    }
  }
  if (end !== g) return [];
  const path: Vec[] = [];
  while (end !== s) {
    path.push({
      x: (end % cols) * cell + 25,
      y: Math.floor(end / cols) * cell + 25,
    });
    end = came.get(end)!;
  }
  path.reverse();
  if (bridge) path.unshift(bridge);
  return path;
}
