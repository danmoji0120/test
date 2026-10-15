import { it, expect } from "vitest";
import { createWorld, makePlayer, spawnEnemy } from "../src/game/simulation";
import { requestSupport, tickReinforcements } from "../src/game/reinforcements";
import { blocked, distance, invalidateNavigation } from "../src/game/map";
function world() {
  const w = createWorld("dispatch", 7, [makePlayer("p", "P")]);
  w.players.forEach((p) => (p.connected = false));
  w.alertState.level = 4;
  return w;
}
function march(w: ReturnType<typeof world>, seconds: number) {
  for (let i = 0; i < seconds * 30; i++) {
    w.time += 1 / 30;
    tickReinforcements(w, 1 / 30);
  }
}
it("prepositions real reserves, deduplicates a request and marches continuously from its source", () => {
  const w = world(),
    s = w.map.sources.find((s) => s.kind === "outpost")!,
    target = { x: s.entry.x + 250, y: s.entry.y + 200 };
  w.map.obstacles = [];
  invalidateNavigation(w.map);
  const original = w.enemies
    .filter((e) => e.reserve && e.sourceId === s.id)
    .map((e) => e.id);
  const r = requestSupport(w, "one", target, "squad", s.id)!;
  expect(requestSupport(w, "one", target)).toBe(r);
  expect(r.members).toEqual(original);
  const before = w.enemies.length;
  const last = new Map(w.enemies.map((e) => [e.id, { x: e.x, y: e.y }]));
  for (let i = 0; i < 45 * 30; i++) {
    w.time += 1 / 30;
    tickReinforcements(w, 1 / 30);
    for (const e of w.enemies) {
      expect(distance(e, last.get(e.id)!)).toBeLessThan(8.1);
      last.set(e.id, { x: e.x, y: e.y });
    }
  }
  expect(w.enemies).toHaveLength(before);
  expect(r.state).toBe("deployed");
  expect(
    w.trajectories
      .filter((t) => t.request === r.id)
      .every((t) => t.points.length > 5),
  ).toBe(true);
  expect(
    w.enemies
      .filter((e) => r.members.includes(e.id))
      .every((e) => distance(e, target) < 100),
  ).toBe(true);
});
it("external troops first exist beyond a valid border gate then physically enter", () => {
  const w = world(),
    s = w.map.sources.find((s) => s.kind === "external")!;
  const target = { x: s.entry.x + (s.x < 0 ? 450 : -450), y: s.y };
  const r = requestSupport(w, "border", target, "director", s.id)!;
  march(w, 50);
  expect(r.members.length).toBeGreaterThan(0);
  const traces = w.trajectories.filter((t) => t.request === r.id);
  expect(traces.every((t) => t.born.x < 0 || t.born.x > w.map.width)).toBe(
    true,
  );
  expect(
    traces.every((t) =>
      t.points.some((p) => p.x > 40 && p.x < w.map.width - 40),
    ),
  ).toBe(true);
  for (const t of traces)
    for (let i = 1; i < t.points.length; i++)
      expect(distance(t.points[i], t.points[i - 1])).toBeLessThan(145);
});
it("cancels a disabled source and releases assigned reserves without creating soldiers", () => {
  const w = world(),
    s = w.map.sources.find((s) => s.kind === "barracks")!;
  const r = requestSupport(w, "cancel", w.map.core, "squad", s.id)!;
  const count = w.enemies.length;
  s.disabled = true;
  march(w, 20);
  expect(r.state).toBe("cancelled");
  expect(w.enemies).toHaveLength(count);
  expect(
    w.enemies.filter((e) => e.sourceId === s.id).every((e) => !e.requestId),
  ).toBe(true);
});
it("holds at the actor limit and cancels when a route is cut", () => {
  const w = world(),
    s = w.map.sources.find((s) => s.kind === "external" && s.x < 0)!;
  w.map.obstacles = [];
  invalidateNavigation(w.map);
  while (w.enemies.length < 30) spawnEnemy(w, { x: 2500, y: 1600 }, "rifle");
  const r = requestSupport(w, "cap", { x: 3000, y: 1650 }, "director", s.id)!;
  march(w, 30);
  expect(r.state).toBe("queued");
  expect(w.enemies).toHaveLength(30);
  w.enemies = w.enemies.slice(0, 10);
  w.map.obstacles = [{ x: 2000, y: 0, w: 100, h: w.map.height, kind: "wall" }];
  invalidateNavigation(w.map);
  march(w, 1);
  expect(r.state).toBe("cancelled");
});
it("never places any initial or local reserve actor in solid geometry over 100 seeds", () => {
  for (let seed = 0; seed < 100; seed++) {
    const w = createWorld("spawn-" + seed, seed, [makePlayer("p", "P")]);
    expect(w.enemies.length).toBeLessThanOrEqual(30);
    for (const e of w.enemies)
      expect(blocked(e, w.map.obstacles, 19), seed + ":" + e.id).toBe(false);
  }
});
