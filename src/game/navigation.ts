import type { GameMap, Vec } from "../shared/data";
import { distance, movementBlocked, movementClear, visible } from "./map";
class MinHeap {
  data: { k: number; score: number; order: number }[] = [];
  before(
    a: { score: number; order: number },
    b: { score: number; order: number },
  ) {
    return a.score < b.score || (a.score === b.score && a.order < b.order);
  }
  push(k: number, score: number, order: number) {
    const a = this.data;
    a.push({ k, score, order });
    let i = a.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (!this.before(a[i], a[p])) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.data,
      head = a[0],
      last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= a.length) break;
        if (c + 1 < a.length && this.before(a[c + 1], a[c])) c++;
        if (!this.before(a[c], a[i])) break;
        [a[i], a[c]] = [a[c], a[i]];
        i = c;
      }
    }
    return head;
  }
}
interface Cache {
  grids: Map<number, Uint8Array>;
  edges: Map<number, Uint8Array>;
  paths: Map<string, Vec[]>;
  queries: number;
  hits: number;
  visited: number;
}
const caches = new WeakMap<GameMap, Cache>();
/** One connected-component flood verifies many destinations without repeating long A*. QA/planner use. */
export function reachableArea(map: GameMap, start: Vec, radius = 16) {
  const cols = Math.ceil(map.width / 50),
    rows = Math.ceil(map.height / 50),
    seen = new Uint8Array(cols * rows),
    queue = new Int32Array(cols * rows);
  const point = (k: number) => ({
    x: (k % cols) * 50 + 25,
    y: Math.floor(k / cols) * 50 + 25,
  });
  const sx = Math.floor(start.x / 50),
    sy = Math.floor(start.y / 50);
  let first = -1;
  for (let dy = -2; dy <= 2 && first < 0; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = sx + dx,
        y = sy + dy,
        k = y * cols + x;
      if (
        x > 0 &&
        y > 0 &&
        x < cols - 1 &&
        y < rows - 1 &&
        !movementBlocked(point(k), map, radius) &&
        movementClear(start, point(k), map, radius)
      ) {
        first = k;
        break;
      }
    }
  let head = 0,
    tail = 0;
  if (first >= 0) {
    queue[tail++] = first;
    seen[first] = 1;
  }
  while (head < tail) {
    const k = queue[head++],
      x = k % cols,
      y = Math.floor(k / cols);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        n = ny * cols + nx;
      if (nx < 1 || ny < 1 || nx >= cols - 1 || ny >= rows - 1 || seen[n])
        continue;
      if (movementBlocked(point(n), map, radius)) {
        seen[n] = 2;
        continue;
      }
      seen[n] = 1;
      queue[tail++] = n;
    }
  }
  return {
    cells: tail,
    canReach: (p: Vec) => {
      const x = Math.floor(p.x / 50),
        y = Math.floor(p.y / 50);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const cx = x + dx,
            cy = y + dy;
          if (
            cx > 0 &&
            cy > 0 &&
            cx < cols - 1 &&
            cy < rows - 1 &&
            seen[cy * cols + cx] === 1 &&
            movementClear(p, point(cy * cols + cx), map, radius)
          )
            return true;
        }
      return false;
    },
  };
}
export function clearNavigation(map: GameMap) {
  caches.delete(map);
}
export function navigationStats(map: GameMap) {
  const c = caches.get(map);
  return {
    queries: c?.queries ?? 0,
    hits: c?.hits ?? 0,
    visited: c?.visited ?? 0,
    cachedPaths: c?.paths.size ?? 0,
    edgeBytes: [...(c?.edges.values() ?? [])].reduce(
      (n, g) => n + g.byteLength,
      0,
    ),
    gridBytes: [...(c?.grids.values() ?? [])].reduce(
      (n, g) => n + g.byteLength,
      0,
    ),
  };
}
/** Lazy50-unit collision cells, typed costs, logarithmic priority queue, bounded reusable paths. */
export function findPath(
  start: Vec,
  goal: Vec,
  map: GameMap,
  radius = 16,
): Vec[] {
  if (!Number.isFinite(start.x + start.y + goal.x + goal.y)) return [];
  const cols = Math.ceil(map.width / 50),
    rows = Math.ceil(map.height / 50),
    size = cols * rows,
    r = Math.max(20, Math.ceil(radius / 4) * 4),
    c = caches.get(map) ?? {
      grids: new Map(),
      edges: new Map(),
      paths: new Map(),
      queries: 0,
      hits: 0,
      visited: 0,
    };
  caches.set(map, c);
  c.queries++;
  const grid = c.grids.get(r) ?? new Uint8Array(size);
  c.grids.set(r, grid);
  const edge = map.operation
    ? (c.edges.get(r) ?? new Uint8Array(size))
    : undefined;
  if (edge) c.edges.set(r, edge);

  const point = (k: number) => ({
    x: (k % cols) * 50 + 25,
    y: Math.floor(k / cols) * 50 + 25,
  });
  const valid = (x: number, y: number) =>
    x > 0 && y > 0 && x < cols - 1 && y < rows - 1;
  const closedCell = (x: number, y: number) => {
    if (!valid(x, y)) return true;
    const k = y * cols + x;
    if (!grid[k]) grid[k] = movementBlocked(point(k), map, r) ? 1 : 2;
    return grid[k] === 1;
  };
  let sx = Math.floor(start.x / 50),
    sy = Math.floor(start.y / 50),
    gx = Math.floor(goal.x / 50),
    gy = Math.floor(goal.y / 50),
    bridge: Vec | undefined;
  if (
    !valid(sx, sy) ||
    closedCell(sx, sy) ||
    (map.operation && !movementClear(start, point(sy * cols + sx), map, radius))
  ) {
    const near: Vec[] = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = sx + dx,
          y = sy + dy,
          p = { x: x * 50 + 25, y: y * 50 + 25 };
        if (!closedCell(x, y) && movementClear(start, p, map, radius))
          near.push(p);
      }
    near.sort((a, b) => distance(start, a) - distance(start, b));
    bridge = near[0];
    if (!bridge) return [];
    sx = Math.floor(bridge.x / 50);
    sy = Math.floor(bridge.y / 50);
  }
  if (map.operation && !bridge && distance(start, point(sy * cols + sx)) > 1)
    bridge = point(sy * cols + sx);
  const alternatives: number[] = [];
  if (closedCell(gx, gy)) {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = gx + dx,
          y = gy + dy;
        if (!closedCell(x, y) && visible(point(y * cols + x), goal, map))
          alternatives.push(y * cols + x);
      }
    alternatives.sort(
      (a, b) => distance(point(a), goal) - distance(point(b), goal),
    );
    if (!alternatives.length) return [];
    gx = alternatives[0] % cols;
    gy = Math.floor(alternatives[0] / cols);
  } else alternatives.push(gy * cols + gx);
  const s = sy * cols + sx,
    key = `${r}/${s}/${alternatives.join(",")}`;
  const cached = c.paths.get(key);
  if (cached) {
    c.hits++;
    c.paths.delete(key);
    c.paths.set(key, cached);
    return [...(bridge ? [bridge] : []), ...cached];
  }
  const goals = new Set(alternatives),
    cost = new Float32Array(size).fill(Infinity),
    parent = new Int32Array(size).fill(-1),
    closed = new Uint8Array(size),
    open = new MinHeap();
  const order = new Int32Array(size).fill(-1);
  let sequence = 0;
  cost[s] = 0;
  order[s] = sequence++;
  open.push(s, 0, order[s]);
  let end = -1;
  while (open.data.length) {
    const k = open.pop().k;
    if (closed[k]) continue;
    closed[k] = 1;
    c.visited++;
    if (goals.has(k)) {
      end = k;
      break;
    }
    const x = k % cols,
      y = Math.floor(k / cols);
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let direction = 0; direction < 4; direction++) {
      const [dx, dy] = directions[direction];
      const nx = x + dx,
        ny = y + dy,
        n = ny * cols + nx;
      if (closedCell(nx, ny) || closed[n]) continue;
      if (edge) {
        const known = 16 << direction,
          valid = 1 << direction;
        if (!(edge[k] & known)) {
          const clear = movementClear(point(k), point(n), map, r),
            opposite = direction ^ 1;
          edge[k] |= known | (clear ? valid : 0);
          edge[n] |= (16 << opposite) | (clear ? 1 << opposite : 0);
        }
        if (!(edge[k] & valid)) continue;
      }
      const next = cost[k] + 1;
      if (next >= cost[n]) continue;
      cost[n] = next;
      parent[n] = k;
      if (order[n] < 0) order[n] = sequence++;
      open.push(n, next + Math.abs(nx - gx) + Math.abs(ny - gy), order[n]);
    }
  }
  if (end < 0) return [];
  const path: Vec[] = [];
  while (end !== s) {
    path.push(point(end));
    end = parent[end];
    if (end < 0) return [];
  }
  path.reverse();
  c.paths.set(key, path);
  if (c.paths.size > 128) c.paths.delete(c.paths.keys().next().value!);
  return [...(bridge ? [bridge] : []), ...path];
}
