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
/** Connected industrial modules. Every boundary has two entrances; interiors vary by type and variant. */
export function generateMap(seed: number): GameMap {
  const rand = rng(seed),
    cols = 4,
    rows = 3,
    mw = 1000,
    mh = 900;
  const width = cols * mw,
    height = rows * mh;
  const obstacles: Rect[] = [
    { x: 0, y: 0, w: width, h: 40, kind: "wall" },
    { x: 0, y: height - 40, w: width, h: 40, kind: "wall" },
    { x: 0, y: 0, w: 40, h: height, kind: "wall" },
    { x: width - 40, y: 0, w: 40, h: height, kind: "wall" },
  ];
  const route: number[] = [];
  const vertical = rand() > 0.5,
    reverse = rand() > 0.5;
  if (!vertical)
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++)
        route.push(row * cols + (row % 2 ? cols - 1 - col : col));
  else
    for (let col = 0; col < cols; col++)
      for (let row = 0; row < rows; row++)
        route.push((col % 2 ? rows - 1 - row : row) * cols + col);
  if (reverse) route.reverse();
  // Two independent doors at every shared edge make flanking a choice.
  for (let col = 1; col < cols; col++)
    for (let row = 0; row < rows; row++) {
      const offset = rand() > 0.5 ? 0 : 45,
        x = col * mw - 20,
        y = row * mh;
      for (const [a, b] of [
        [0, 130 + offset],
        [330 + offset, 570 - offset],
        [770 - offset, 900],
      ])
        obstacles.push({ x, y: y + a, w: 40, h: b - a, kind: "wall" });
    }
  for (let row = 1; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const offset = rand() > 0.5 ? 0 : 40,
        x = col * mw,
        y = row * mh - 20;
      for (const [a, b] of [
        [0, 150 + offset],
        [350 + offset, 650 - offset],
        [850 - offset, 1000],
      ])
        obstacles.push({ x: x + a, y, w: b - a, h: 40, kind: "wall" });
    }
  const labels: Record<ZoneKind, string> = {
    warehouse: "화물 창고",
    corridor: "수송 회랑",
    reactor: "발전실",
    security: "보안 관제실",
    yard: "야적장",
    extraction: "추출 구역",
  };
  const kinds: ZoneKind[] = ["warehouse", "corridor", "security", "yard"];
  const zones: Zone[] = [];
  for (let id = 0; id < cols * rows; id++) {
    const x = (id % cols) * mw,
      y = Math.floor(id / cols) * mh,
      index = route.indexOf(id);
    const kind: ZoneKind =
      index === 0
        ? "yard"
        : index === 10
          ? "reactor"
          : index === 11
            ? "extraction"
            : kinds[Math.floor(rand() * kinds.length)];
    const variant = Math.floor(rand() * 3);
    const zone: Zone = {
      id,
      x,
      y,
      w: mw,
      h: mh,
      kind,
      label: labels[kind],
      variant,
      center: { x: x + 500, y: y + 450 },
      entry: { x: x + 500, y: y + 450 },
      pads: [],
    };
    const templates: Record<ZoneKind, number[][]> = {
      warehouse: [
        [230, 240, 190, 85],
        [620, 550, 150, 100],
        [230, 600, 140, 75],
        [680, 220, 130, 100],
      ],
      corridor:
        variant === 0
          ? [
              [300, 100, 40, 230],
              [660, 570, 40, 230],
              [390, 240, 200, 40],
            ]
          : variant === 1
            ? [
                [100, 320, 260, 40],
                [640, 540, 260, 40],
                [650, 170, 40, 150],
              ]
            : [
                [310, 170, 40, 220],
                [650, 520, 40, 220],
                [170, 630, 150, 40],
              ],
      security: [
        [220, 230, 200, 40],
        [610, 600, 210, 40],
        [270, 280, 40, 130],
        [680, 450, 40, 140],
      ],
      yard:
        variant === 0
          ? [
              [250, 220, 130, 220],
              [640, 530, 140, 190],
            ]
          : variant === 1
            ? [
                [240, 230, 190, 80],
                [620, 560, 200, 80],
                [640, 230, 120, 90],
              ]
            : [
                [230, 220, 140, 90],
                [620, 520, 180, 150],
                [200, 600, 170, 70],
              ],
      reactor: [
        [240, 230, 150, 120],
        [650, 560, 140, 140],
        [640, 220, 140, 110],
        [240, 590, 140, 90],
      ],
      extraction: [
        [240, 230, 140, 85],
        [640, 590, 150, 90],
      ],
    };
    for (const [a, b, w, h] of templates[kind])
      obstacles.push({
        x: x + a,
        y: y + b,
        w,
        h,
        kind:
          kind === "corridor" || kind === "security"
            ? "wall"
            : kind === "yard" || kind === "warehouse"
              ? "container"
              : "crate",
      });
    // Mid-lane cover creates a protected close-range approach instead of a long open firing lane.
    if (kind !== "corridor")
      for (const [a, b] of [
        [430, 280],
        [430, 570],
      ])
        obstacles.push({ x: x + a, y: y + b, w: 100, h: 60, kind: "crate" });
    zone.pads = [
      [150, 150],
      [850, 150],
      [150, 750],
      [850, 750],
      [500, 220],
      [500, 700],
    ]
      .map(([a, b]) => ({ x: x + a, y: y + b }))
      .filter((p) => !blocked(p, obstacles, 24));
    zones.push(zone);
  }
  const center = (index: number) => ({ ...zones[route[index]].center });
  const core = center(10);
  return {
    width,
    height,
    obstacles,
    zones,
    route,
    spawn: center(0),
    core,
    extract: center(11),
    devices: [
      { x: core.x - 110, y: core.y - 70, hp: 240, maxHp: 240 },
      { x: core.x + 110, y: core.y + 70, hp: 240, maxHp: 240 },
    ],
    supplies: [0, 2, 4, 6, 8, 10].map((index) => ({
      ...center(index),
      x: center(index).x - 80,
      y: center(index).y + 80,
      used: false,
    })),
    intel: { ...center(7), x: center(7).x + 90 },
    seed,
  };
}
const navigationGrids = new WeakMap<GameMap, Uint8Array>();
function navigationGrid(map: GameMap) {
  let grid = navigationGrids.get(map);
  if (!grid) {
    const cols = Math.ceil(map.width / 50),
      rows = Math.ceil(map.height / 50);
    grid = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        grid[y * cols + x] = Number(
          blocked({ x: x * 50 + 25, y: y * 50 + 25 }, map.obstacles, 20),
        );
    navigationGrids.set(map, grid);
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
  const grid = navigationGrid(map);
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
