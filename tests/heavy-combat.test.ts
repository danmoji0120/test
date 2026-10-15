import { heavyAI } from "../src/game/heavy-ai";
import { it, expect } from "vitest";
import {
  createWorld,
  makePlayer,
  spawnEnemy,
  fire,
  tick,
} from "../src/game/simulation";
import { rayHit, armorMultiplier, enemyRadius } from "../src/game/armor";
import { launch, tickProjectiles, fireLauncher } from "../src/game/projectiles";
import { enemyAI } from "../src/game/squads";
import { visibleWorld } from "../src/server/visibility";
import { blocked, invalidateNavigation, distance } from "../src/game/map";
function fixture() {
  const p = makePlayer("p", "P"),
    w = createWorld("heavy", 42, [p], 10);
  w.enemies = [];
  w.squads = {};
  w.projectiles = [];
  w.map.obstacles = [];
  invalidateNavigation(w.map);
  Object.assign(p, { x: 1000, y: 1000, angle: 0 });
  return w;
}
it("introduces role-specific rosters at 5/7/8/9 without changing infantry health", () => {
  for (const [level, kind] of [
    [5, "juggernaut"],
    [7, "drone"],
    [8, "walker"],
    [9, "artillery"],
  ] as const) {
    const w = createWorld("roster", 42, [makePlayer("p", "P")], level);
    expect(w.enemies.some((e) => e.kind === kind)).toBe(true);
    for (const e of w.enemies)
      expect(blocked(e, w.map.obstacles, enemyRadius(e.kind))).toBe(false);
  }
});
it("AP2 front shots fail while a real exposed rear region remains vulnerable", () => {
  const w = fixture(),
    e = spawnEnemy(w, { x: 1300, y: 1000 }, "walker")!;
  e.angle = Math.PI;
  expect(armorMultiplier(e, w.players[0])).toBe(0);
  expect(armorMultiplier(e, { x: 1600, y: 1000 })).toBe(0.65);
  fire(w, w.players[0]);
  expect(e.hp).toBe(650);
  expect(e.stagger).toBe(0);
  expect(
    w.events.some((x) => x.type === "hit" && x.quality === "ricochet"),
  ).toBe(true);
});
it("stale tactical/G input cannot fire an additional launcher beside a rifle", () => {
  const w = fixture(),
    p = w.players[0];
  p.rockets = 2;
  p.input.tactical = true;
  fireLauncher(w, p);
  expect(w.projectiles).toHaveLength(0);
  expect(p.ammo).toBe(30);
});
it("requires actual dated observation for artillery and never steers a launched shell", () => {
  const w = fixture(),
    p = w.players[0],
    e = spawnEnemy(w, { x: 2200, y: 1000 }, "artillery")!;
  for (let i = 0; i < 40; i++) {
    w.time += 1 / 30;
    enemyAI(w, 1 / 30);
  }
  expect(w.projectiles).toHaveLength(0);
  e.lastSeen = { x: p.x, y: p.y };
  e.memory = 7;
  e.reportAt = w.time;
  e.reportKind = "seen";
  e.cooldown = 0;
  for (let i = 0; i < 40; i++) {
    w.time += 1 / 30;
    enemyAI(w, 1 / 30);
  }
  const q = w.projectiles.find((q) => q.kind === "mortar")!;
  expect(q).toBeTruthy();
  expect(q.impactAt - q.at).toBeGreaterThan(2);
  const point = { ...q.target };
  p.x += 350;
  for (let i = 0; i < 90; i++) {
    w.time += 1 / 30;
    tickProjectiles(w, 1 / 30);
  }
  expect(q.target).toEqual(point);
  expect(p.hp).toBe(100);
});
it("hides artillery origin and owner while transmitting an incoming impact warning", () => {
  const w = fixture();
  launch(
    w,
    { x: 2200, y: 1000 },
    w.players[0],
    "mortar",
    "secret-artillery",
    true,
  );
  const q = visibleWorld(w).projectiles[0];
  expect(q).toBeTruthy();
  expect(q.owner).toBe("");
  expect(q.origin).toEqual(q.target);
  expect(q.x).toBe(1000);
});
it("walker projectiles hit solid terrain and cannot pass a wall into a player", () => {
  const w = fixture(),
    p = w.players[0];
  w.map.obstacles = [{ x: 1200, y: 0, w: 100, h: 4200, kind: "wall" }];
  launch(w, { x: 1500, y: 1000 }, p, "cannon", "walker", true);
  for (let i = 0; i < 90; i++) {
    w.time += 1 / 30;
    tickProjectiles(w, 1 / 30);
  }
  expect(p.hp).toBe(100);
  expect(w.projectiles).toHaveLength(0);
});
it("juggernaut cycles spinup, sustained fire and overheat instead of an endless laser", () => {
  const w = fixture(),
    p = w.players[0],
    e = spawnEnemy(w, { x: 1500, y: 1000 }, "juggernaut")!;
  const phases = new Set<string>();
  for (let i = 0; i < 150; i++) {
    w.time += 1 / 30;
    p.hp = 100;
    p.down = false;
    enemyAI(w, 1 / 30);
    if (e.phase) phases.add(e.phase);
  }
  expect(phases.has("spinup")).toBe(true);
  expect(phases.has("firing")).toBe(true);
  expect(phases.has("overheat")).toBe(true);
  expect(w.events.filter((e) => e.type === "shot")).toHaveLength(14);
});

it("does not reconstruct an unseen cannon origin from projectile timestamps or distance", () => {
  const w = fixture();
  launch(
    w,
    { x: 2000, y: 1000 },
    { x: 1000, y: 1000 },
    "cannon",
    "secret",
    true,
  );
  const q = w.projectiles[0];
  q.x = 1500;
  q.traveled = 500;
  const publicQ = visibleWorld(w).projectiles[0];
  expect(publicQ.origin).toEqual({ x: 1500, y: 1000 });
  expect(publicQ.traveled).toBe(0);
  expect(publicQ.at).toBe(w.time);
  expect(publicQ.target).toEqual(publicQ.origin);
});

it("records facility destruction once regardless of a bullet or explosive final hit", () => {
  const w = fixture(),
    d = w.map.installations.find((d) => d.kind === "barracks")!;
  d.hp = 0;
  // Objective transition owns the escalation and settlement, never each pellet/projectile.
  tick(w, 1 / 30);
  const heat = w.alertState.heat;
  tick(w, 1 / 30);
  expect(w.alertState.heat).toBe(heat);
  expect(w.mission.objectives.find((o) => o.id === d.id)!.state).toBe(
    "complete",
  );
});

it("moves a walker around cover toward its dated sighting instead of idling inside gun range", () => {
  const w = fixture(),
    e = spawnEnemy(w, { x: 1400, y: 1000 }, "walker")!;
  w.map.obstacles = [{ x: 1200, y: 880, w: 60, h: 240, kind: "wall" }];
  invalidateNavigation(w.map);
  e.lastSeen = { x: 1000, y: 1000 };
  e.memory = 9;
  heavyAI(w, e, undefined, 1 / 30);
  expect(e.path.length).toBeGreaterThan(0);
  expect(w.projectiles).toHaveLength(0);
  expect(e.lastSeen).toEqual({ x: 1000, y: 1000 });
});

it("will not authorize artillery from hearing alone or an unobserved facility dispatch coordinate", () => {
  const w = fixture(),
    e = spawnEnemy(w, { x: 2200, y: 1000 }, "artillery")!;
  e.lastSeen = { x: 1000, y: 1000 };
  e.memory = 7;
  e.reportAt = w.time;
  e.reportKind = "heard";
  heavyAI(w, e, undefined, 1 / 30);
  expect(e.windup).toBe(0);
  expect(w.projectiles).toHaveLength(0);
});

it("integrates mortar coordinates along the real launch-to-impact path and hides unseen airborne positions", () => {
  const w = fixture();
  launch(
    w,
    { x: 2200, y: 1000 },
    { x: 1000, y: 1000 },
    "mortar",
    "hidden",
    true,
  );
  const q = w.projectiles[0];
  w.time = 1.3;
  tickProjectiles(w, 1 / 30);
  expect(q.x).toBeCloseTo(1600);
  expect(q.y).toBe(1000);
  w.map.obstacles = [{ x: 1200, y: 0, w: 100, h: 4200, kind: "wall" }];
  const pub = visibleWorld(w).projectiles[0];
  expect(pub.shell).toBeUndefined();
  expect(pub.origin).toEqual(q.target);
  expect(pub.range).toBe(0);
});

it("a player rocket collides with a live facility rather than passing through it", () => {
  const w = fixture(),
    p = w.players[0],
    d = w.map.installations[0];
  Object.assign(d, { x: 1300, y: 1000, hp: 420, maxHp: 420 });
  launch(w, p, { x: 1900, y: 1000 }, "rocket", p.id, false);
  for (let i = 0; i < 30; i++) {
    w.time += 1 / 30;
    tickProjectiles(w, 1 / 30);
  }
  expect(w.projectiles).toHaveLength(0);
  expect(d.hp).toBeLessThan(200);
});
