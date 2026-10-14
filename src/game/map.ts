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
/** V2: irregular industrial wings carved into solid terrain, linked by dog-leg halls and service bypasses. */
export function generateMap(seed: number): GameMap {
  const rand = rng(seed),
    width = 5000,
    height = 3300,
    cell = 50;
  const cols = width / cell,
    rows = height / cell;
  const floor = new Uint8Array(cols * rows);
  const carve = (x: number, y: number, w: number, h: number) => {
    for (
      let yy = Math.max(1, Math.floor(y / cell));
      yy < Math.min(rows - 1, Math.ceil((y + h) / cell));
      yy++
    )
      for (
        let xx = Math.max(1, Math.floor(x / cell));
        xx < Math.min(cols - 1, Math.ceil((x + w) / cell));
        xx++
      )
        floor[yy * cols + xx] = 1;
  };
  const labels: Record<ZoneKind, string> = {
    yard: "외곽 진입로",
    security: "보안 관제실",
    warehouse: "화물 창고",
    corridor: "설비 복도",
    reactor: "발전실",
    extraction: "추출 구역",
  };
  // Footprints vary independently. These are wings of a facility, not cells of an equal-size grid.
  const plans: [number, number, number, number, ZoneKind][] = [
    [100, 2200, 900, 800, "yard"],
    [1100, 2300, 650, 650, "security"],
    [1800, 1950, 950, 1000, "warehouse"],
    [2950, 2250, 600, 650, "corridor"],
    [3750, 2150, 900, 900, "warehouse"],
    [3900, 1150, 750, 650, "security"],
    [2850, 1000, 850, 1000, "yard"],
    [2050, 1250, 600, 600, "corridor"],
    [1100, 1000, 700, 700, "security"],
    [250, 800, 650, 1050, "warehouse"],
    [700, 100, 1500, 650, "reactor"],
    [2550, 100, 1500, 650, "extraction"],
  ];
  const zones: Zone[] = plans.map(([x, y, w, h, kind], id) => {
    x += (Math.floor(rand() * 3) - 1) * 50;
    y += (Math.floor(rand() * 3) - 1) * 50;
    w += (Math.floor(rand() * 3) - 1) * 100;
    h += (Math.floor(rand() * 3) - 1) * 100;
    carve(x, y, w, h);
    return {
      id,
      x,
      y,
      w,
      h,
      kind,
      label: labels[kind],
      variant: Math.floor(rand() * 3),
      center: { x: x + w / 2, y: y + h / 2 },
      entry: { x: x + w / 2, y: y + h / 2 },
      pads: [],
    };
  });
  const connect = (a: Vec, b: Vec, wide: number, horizontal: boolean) => {
    const mid = horizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    for (const [p, q] of [
      [a, mid],
      [mid, b],
    ])
      carve(
        Math.min(p.x, q.x) - wide / 2,
        Math.min(p.y, q.y) - wide / 2,
        Math.abs(p.x - q.x) + wide,
        Math.abs(p.y - q.y) + wide,
      );
  };
  const route = zones.map((z) => z.id);
  for (let i = 1; i < zones.length; i++)
    connect(
      zones[i - 1].center,
      zones[i].center,
      i === 10 ? 250 : 200,
      rand() > 0.5,
    );
  // Independent service links create loops, including alternate approaches to the central wings.
  for (const [a, b] of [
    [0, 9],
    [2, 7],
    [3, 6],
    rand() > 0.5 ? [1, 8] : [4, 6],
    [6, 11],
  ])
    connect(zones[a].center, zones[b].center, 150, rand() > 0.5);
  const obstacles: Rect[] = [];
  // Merge identical horizontal solid runs vertically. Keeps navigation and ray casting compact.
  let previous = new Map<string, Rect>();
  for (let y = 0; y < rows; y++) {
    const current = new Map<string, Rect>();
    for (let x = 0; x < cols;) {
      if (floor[y * cols + x]) {
        x++;
        continue;
      }
      const begin = x;
      while (x < cols && !floor[y * cols + x]) x++;
      const key = `${begin}:${x}`,
        old = previous.get(key);
      if (old) {
        old.h += cell;
        current.set(key, old);
      } else {
        const rect: Rect = {
          x: begin * cell,
          y: y * cell,
          w: (x - begin) * cell,
          h: cell,
          kind: "wall",
        };
        obstacles.push(rect);
        current.set(key, rect);
      }
    }
    previous = current;
  }
  const add = (
    zone: Zone,
    x: number,
    y: number,
    w: number,
    h: number,
    kind: Rect["kind"],
  ) => obstacles.push({ x: zone.x + x, y: zone.y + y, w, h, kind });
  for (const z of zones) {
    // Large opaque machinery leaves a cross-shaped passage through every objective center.
    const cx = z.w / 2,
      cy = z.h / 2,
      gap = z.kind === "corridor" ? 95 : 130;
    if (z.kind === "corridor") {
      add(
        z,
        65,
        70,
        Math.max(80, cx - gap - 65),
        Math.max(80, cy - gap - 70),
        "wall",
      );
      add(
        z,
        cx + gap,
        cy + gap,
        Math.max(80, cx - gap - 65),
        Math.max(80, cy - gap - 70),
        "wall",
      );
    } else {
      const kind =
        z.kind === "warehouse" || z.kind === "yard" ? "container" : "wall";
      add(
        z,
        80,
        80,
        Math.max(90, cx - gap - 80),
        Math.max(90, cy - gap - 80),
        kind,
      );
      add(
        z,
        cx + gap,
        cy + gap,
        Math.max(90, cx - gap - 80),
        Math.max(90, cy - gap - 80),
        kind,
      );
      if (z.variant !== 1)
        add(
          z,
          cx + gap,
          80,
          Math.max(70, cx - gap - 100),
          Math.max(70, cy - gap - 100),
          z.kind === "reactor" ? "crate" : kind,
        );
      if (z.variant !== 0)
        add(
          z,
          80,
          cy + gap,
          Math.max(70, cx - gap - 100),
          Math.max(70, cy - gap - 100),
          "crate",
        );
    }
  }
  for (const z of zones) {
    // Guards occupy lane corners and entry throats, never the insides of structures.
    for (const [dx, dy] of [
      [-90, -90],
      [90, 90],
      [-90, 90],
      [90, -90],
      [0, -z.h / 2 + 70],
      [0, z.h / 2 - 70],
      [-z.w / 2 + 70, 0],
      [z.w / 2 - 70, 0],
    ]) {
      const p = { x: z.center.x + dx, y: z.center.y + dy };
      if (!blocked(p, obstacles, 24)) z.pads.push(p);
    }
  }
  const center = (i: number) => ({ ...zones[i].center }),
    core = center(10);
  return {
    width,
    height,
    obstacles,
    zones,
    route,
    spawn: { x: zones[0].center.x, y: zones[0].y + zones[0].h - 120 },
    core,
    extract: center(11),
    devices: [
      { x: core.x - 75, y: core.y - 65, hp: 240, maxHp: 240 },
      { x: core.x + 75, y: core.y + 65, hp: 240, maxHp: 240 },
    ],
    supplies: [0, 2, 4, 6, 8, 10].map((i) => ({
      ...center(i),
      x: center(i).x - 60,
      y: center(i).y + 60,
      used: false,
    })),
    intel: { ...center(7), x: center(7).x + 70 },
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
