import { it, expect } from "vitest";
import {
  createWorld,
  makePlayer,
  spawnEnemy,
  tick,
} from "../src/game/simulation";
import { raiseAlert, tickAlert } from "../src/game/alert";
import { requestSupport, tickReinforcements } from "../src/game/reinforcements";
import { forceBudget, MAX_ACTORS } from "../src/game/budgets";
import { tickDirector } from "../src/game/director";
import { enemyAI } from "../src/game/squads";
import { distance, invalidateNavigation, blocked } from "../src/game/map";
import { enemyRadius, armored } from "../src/game/armor";
const make = (level = 10) =>
  createWorld("response", 7, [makePlayer("p", "P")], level);
function march(w: ReturnType<typeof make>, seconds: number) {
  for (let i = 0; i < seconds * 30; i++) {
    w.time += 1 / 30;
    tickReinforcements(w, 1 / 30);
  }
}
it("noise alone cannot escalate a difficulty10 operation beyond suspicion", () => {
  const w = make();
  for (let i = 0; i < 500; i++) {
    w.time = i * 0.2;
    raiseAlert(w, 3, "총성", w.players[0]);
    raiseAlert(w, 7, "불명음 수색");
  }
  expect(w.alertState.level).toBe(1);
  raiseAlert(w, 12, "병력 접촉");
  expect(w.alertState.level).toBe(2);
  raiseAlert(w, 8, "지원 요청");
  expect(w.alertState.level).toBe(2);
});
it("escalates accepted contacts and strategic destruction into actual maximum-response orders", () => {
  const w = make();
  raiseAlert(w, 35, "발전기 파괴", w.players[0], 2);
  w.time = 1;
  raiseAlert(w, 35, "발전기 파괴", w.players[0], 2);
  w.time = 2;
  raiseAlert(w, 35, "전초기지 파괴", w.players[0], 2);
  expect(w.alertState.level).toBe(4);
  w.director.next = 0;
  tickDirector(w, 1 / 30);
  expect(w.reinforcements.some((r) => r.roster?.some(armored))).toBe(true);
  expect(w.notices.some((n) => n.text.includes("중장갑"))).toBe(true);
  expect(
    w.reinforcements.every(
      (r) =>
        r.path.length > 0 && !!w.map.sources.find((s) => s.id === r.sourceId),
    ),
  ).toBe(true);
});
it("thirty distant soldiers and dormant reserves do not block an external departure", () => {
  const w = make(3);
  w.players[0].connected = false;
  w.alertState.level = 4;
  w.map.obstacles = [];
  invalidateNavigation(w.map);
  while (w.enemies.length < 30) spawnEnemy(w, { x: 2500, y: 1800 }, "rifle");
  const s = w.map.sources.find((s) => s.kind === "external")!,
    r = requestSupport(w, "far", w.map.zones[0].entry, "test", s.id)!;
  march(w, 25);
  expect(r.departed).toBeGreaterThan(0);
  expect(forceBudget(w).regional).toBeGreaterThan(30);
  expect(forceBudget(w).near).toBe(0);
  expect(w.enemies.length).toBeLessThanOrEqual(MAX_ACTORS);
});
it("dispatches a prepositioned walker through its actual motorpool door without creating a replacement", () => {
  const w = make();
  w.players[0].connected = false;
  w.alertState.level = 4;
  const s = w.map.sources.find((s) => s.kind === "barracks")!,
    initial = w.enemies.find(
      (e) => e.reserve && e.kind === "walker" && e.sourceId === s.id,
    )!;
  expect(initial).toBeTruthy();
  const before = w.enemies.length;
  const r = requestSupport(w, "heavy", w.map.zones[1].entry, "test", s.id, {
    heavy: true,
  })!;
  expect(r.members).toEqual([initial.id]);
  march(w, 160);
  expect(r.departed).toBeGreaterThan(0);
  expect(w.enemies.length).toBe(before);
  expect(["deployed", "arriving"]).toContain(r.state);
  const trajectory = w.trajectories.find((t) => t.enemy === initial.id)!;
  expect(distance(trajectory.born, s)).toBeLessThan(100);
  expect(trajectory.points.some((p) => distance(p, s) > 300)).toBe(true);
  for (let i = 1; i < trajectory.points.length; i++)
    expect(
      distance(trajectory.points[i], trajectory.points[i - 1]),
    ).toBeLessThanOrEqual(
      (trajectory.points[i].at - trajectory.points[i - 1].at) * 82 + 1,
    );
});
it("continues an already marching force after source destruction while cancelling the next queued force", () => {
  const w = make();
  w.players[0].connected = false;
  w.alertState.level = 4;
  const s = w.map.sources.find((s) => s.kind === "external")!,
    r = requestSupport(w, "one", w.map.zones[0].entry, "test", s.id, {
      heavy: true,
    })!;
  march(w, 8);
  expect(r.state).toBe("traveling");
  s.cooldown = 0;
  const next = requestSupport(w, "two", w.map.zones[1].entry, "test", s.id)!;
  const members = [...r.members];
  s.disabled = true;
  march(w, 1);
  expect(next.state).toBe("cancelled");
  expect(w.enemies.filter((e) => members.includes(e.id))).toHaveLength(
    members.length,
  );
  expect(r.state).not.toBe("cancelled");
});
it("preserves continuous far patrol movement and wall collision when detailed AI resumes", () => {
  const w = make(3);
  w.enemies = [];
  w.squads = {};
  Object.assign(w.players[0], { x: 6000, y: 3900 });
  const e = spawnEnemy(w, { x: 1500, y: 1000 }, "rifle")!;
  e.patrol = [{ x: 1700, y: 1000 }];
  const old = { x: e.x, y: e.y };
  for (let i = 0; i < 60; i++) {
    w.time += 1 / 30;
    const before = { x: e.x, y: e.y };
    enemyAI(w, 1 / 30);
    expect(distance(e, before)).toBeLessThan(6);
  }
  expect(distance(e, old)).toBeGreaterThan(20);
  Object.assign(w.players[0], { x: e.x + 1000, y: e.y });
  const before = { x: e.x, y: e.y };
  enemyAI(w, 1 / 30);
  expect(distance(e, before)).toBeLessThan(6);
});

it("blocks walking through a large live enemy body", () => {
  const w = make(8),
    p = w.players[0];
  w.enemies = [];
  w.map.obstacles = [];
  Object.assign(p, { x: 1000, y: 1000 });
  const e = spawnEnemy(w, { x: 1080, y: 1000 }, "walker")!;
  p.input.dx = 1;
  // Body overlap is rejected by ordinary server movement, independent of its PNG size.
  for (let i = 0; i < 20; i++) tick(w, 1 / 30);
  expect(distance(p, e)).toBeGreaterThanOrEqual(69);
});
