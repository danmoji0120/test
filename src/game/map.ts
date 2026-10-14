import type { GameMap, Rect, Vec } from "../shared/data";
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
      p.x + radius > o.x &&
      p.x - radius < o.x + o.w &&
      p.y + radius > o.y &&
      p.y - radius < o.y + o.h,
  );
}
export function move(p: Vec, dx: number, dy: number, map: GameMap, r = 16) {
  const x = Math.max(r, Math.min(map.width - r, p.x + dx));
  if (!blocked({ x, y: p.y }, map.obstacles, r)) p.x = x;
  const y = Math.max(r, Math.min(map.height - r, p.y + dy));
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
  return near;
}
export function wallDistance(p: Vec, angle: number, max: number, map: GameMap) {
  const d = { x: Math.cos(angle), y: Math.sin(angle) };
  return map.obstacles.reduce(
    (v, o) => Math.min(v, rayRect(p, d, o, max)),
    max,
  );
}
export function visible(a: Vec, b: Vec, map: GameMap) {
  const d = distance(a, b);
  return wallDistance(a, Math.atan2(b.y - a.y, b.x - a.x), d, map) >= d - 1;
}
export function generateMap(seed: number): GameMap {
  const rand = rng(seed),
    flip = rand() > 0.5;
  const obstacles: Rect[] = [
    { x: 0, y: 0, w: 2400, h: 45, kind: "wall" },
    { x: 0, y: 1755, w: 2400, h: 45, kind: "wall" },
    { x: 0, y: 0, w: 45, h: 1800, kind: "wall" },
    { x: 2355, y: 0, w: 45, h: 1800, kind: "wall" },
  ];
  // Broad, fixed corridors keep every variation navigable. Props vary within reserved cells.
  for (const [x, y, w, h] of [
    [510, 220, 55, 420],
    [510, 870, 55, 600],
    [1030, 45, 55, 380],
    [1030, 640, 55, 520],
    [1510, 350, 55, 460],
    [1510, 1050, 55, 520],
    [2000, 45, 55, 480],
    [2000, 770, 55, 650],
  ])
    obstacles.push({ x, y, w, h, kind: "wall" });
  for (const [x, y] of [
    [230, 550],
    [730, 380],
    [740, 1050],
    [280, 1260],
    [1240, 450],
    [1220, 1380],
    [1760, 560],
    [1760, 1180],
    [2160, 1000],
  ]) {
    obstacles.push({
      x: x + Math.floor(rand() * 55),
      y: y + Math.floor(rand() * 45),
      w: rand() > 0.45 ? 130 : 90,
      h: rand() > 0.5 ? 65 : 110,
      kind: rand() > 0.45 ? "container" : "crate",
    });
  }
  return {
    width: 2400,
    height: 1800,
    obstacles,
    spawn: { x: 240, y: flip ? 1520 : 260 },
    core: { x: 1770, y: 880 },
    relays: [
      { x: 780, y: 700 },
      { x: 1240, y: flip ? 230 : 1050 },
    ],
    extract: { x: 2200, y: flip ? 250 : 1570 },
    supplies: [
      { x: 370, y: 870, used: false },
      { x: 1310, y: 840, used: false },
      { x: 1820, y: 1470, used: false },
    ],
    intel: { x: 1175, y: flip ? 1625 : 225 },
    seed,
  };
}
const navigationGrids = new WeakMap<GameMap, Uint8Array>();
function navigationGrid(map: GameMap) {
  let grid = navigationGrids.get(map);
  if (!grid) {
    grid = new Uint8Array(48 * 36);
    for (let y = 0; y < 36; y++)
      for (let x = 0; x < 48; x++)
        grid[y * 48 + x] = Number(
          blocked({ x: x * 50 + 25, y: y * 50 + 25 }, map.obstacles, 20),
        );
    navigationGrids.set(map, grid);
  }
  return grid;
}
/** Small-grid A*; diagonal corner-cutting is deliberately disallowed. */
export function findPath(start: Vec, goal: Vec, map: GameMap): Vec[] {
  const grid = navigationGrid(map);
  const cell = 50,
    cols = 48,
    rows = 36,
    key = (x: number, y: number) => y * cols + x;
  const sx = Math.floor(start.x / cell),
    sy = Math.floor(start.y / cell),
    originalGx = Math.floor(goal.x / cell),
    originalGy = Math.floor(goal.y / cell),
    s = key(sx, sy);
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
  return path.reverse();
}
