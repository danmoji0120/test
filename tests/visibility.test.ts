import { it, expect } from "vitest";
import {
  createWorld,
  makePlayer,
  spawnEnemy,
  event,
} from "../src/game/simulation";
import {
  lineOfSight,
  initialVision,
  updateVision,
  squadSees,
  visionPolygon,
} from "../src/game/visibility";
import { visibleWorld } from "../src/server/visibility";
function fixture() {
  const w = createWorld("visibility", 7, [
    makePlayer("p", "A"),
    makePlayer("q", "B"),
  ]);
  w.enemies = [];
  w.map.obstacles = [{ x: 500, y: 100, w: 60, h: 700, kind: "wall" }];
  Object.assign(w.players[0], { x: 350, y: 350 });
  Object.assign(w.players[1], { x: 350, y: 450 });
  w.visibility = initialVision(w.map);
  updateVision(w, true);
  return w;
}
it("blocks wall corners and containers, sees across low cover and an open door", () => {
  const w = fixture();
  expect(lineOfSight(w.players[0], { x: 650, y: 350 }, w.map)).toBe(false);
  expect(lineOfSight({ x: 480, y: 790 }, { x: 580, y: 780 }, w.map)).toBe(
    false,
  );
  for (const kind of ["crate", "container", "door"] as const) {
    w.map.obstacles = [{ x: 500, y: 100, w: 60, h: 700, kind }];
    expect(lineOfSight(w.players[0], { x: 650, y: 350 }, w.map)).toBe(
      kind === "crate",
    );
  }
  w.map.obstacles[0].open = true;
  expect(lineOfSight(w.players[0], { x: 650, y: 350 }, w.map)).toBe(true);
});
it("shares exact sight polygons and retains conservative exploration after leaving", () => {
  const w = fixture();
  const old = [...w.visibility.explored];
  Object.assign(w.players[1], { x: 650, y: 350 });
  updateVision(w, true);
  expect(squadSees(w, { x: 700, y: 350 })).toBe(true);
  expect(w.visibility.polygons).toHaveLength(2);
  w.players.forEach((p) => Object.assign(p, { x: 2000, y: 1500 }));
  updateVision(w, true);
  expect(squadSees(w, { x: 700, y: 350 })).toBe(false);
  expect(old.every((n, i) => !n || w.visibility.explored[i])).toBe(true);
});
it("does not leak hidden enemies or exact hidden attack endpoints through snapshots", () => {
  const w = fixture();
  spawnEnemy(w, { x: 650, y: 350 }, "rifle");
  event(w, {
    type: "shot",
    enemy: true,
    x: 650,
    y: 350,
    toX: 350,
    toY: 350,
    angle: Math.PI,
  });
  const view = visibleWorld(w);
  expect(view.enemies).toHaveLength(0);
  expect(view.events.some((e) => e.type === "shot" && e.enemy)).toBe(false);
  const sound = view.events.find((e) => e.type === "sound")!;
  expect(sound).toBeTruthy();
  expect(sound).not.toHaveProperty("toX");
  expect(sound.x).not.toBe(650);
  expect(sound.y).not.toBe(350);
});
it("a teammate visible across a wall exposes only the observed enemy and no private belief/path", () => {
  const w = fixture();
  Object.assign(w.players[1], { x: 650, y: 550 });
  spawnEnemy(w, { x: 650, y: 350 }, "rifle");
  const e = visibleWorld(w).enemies[0];
  expect(e.id).toBe(w.enemies[0].id);
  for (const key of ["target", "lastSeen", "path", "home", "tactical"])
    expect(e).not.toHaveProperty(key);
});
it("uses blocker intersections in the exact current polygon", () => {
  const w = fixture(),
    p = w.players[0];
  const polygon = visionPolygon(p, w.map, 600);
  expect(polygon.length).toBeGreaterThan(128);
  expect(
    polygon
      .filter((v) => Math.abs(v.y - p.y) < 20)
      .every((v) => v.x <= 500.001),
  ).toBe(true);
});

it("remembers hidden door state and transmits its newly observed opening once seen", () => {
  const w = fixture();
  w.map.obstacles = [
    {
      id: "test-door",
      x: 500,
      y: 100,
      w: 60,
      h: 700,
      kind: "door",
      open: false,
    },
  ];
  const before = visibleWorld(w);
  w.players.forEach((p) => Object.assign(p, { x: 2500, y: 1500 }));
  w.map.obstacles[0].open = true;
  w.terrainRevision++;
  const hidden = visibleWorld(w);
  expect(hidden.map.obstacles[0].open).toBe(false);
  w.players[0].x = 350;
  w.players[0].y = 350;
  const observed = visibleWorld(w);
  expect(observed.map.obstacles[0].open).toBe(true);
  expect(observed.terrainRevision).toBeGreaterThan(hidden.terrainRevision);
  expect(before.map.obstacles[0].open).toBe(false);
});
