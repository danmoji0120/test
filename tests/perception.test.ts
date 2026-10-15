import { it, expect } from "vitest";
import { createWorld, makePlayer, spawnEnemy } from "../src/game/simulation";
import { perceive, noise } from "../src/game/perception";
import { enemyAI } from "../src/game/squads";
import { raiseAlert, tickAlert } from "../src/game/alert";
function world() {
  const w = createWorld("perception", 42, [makePlayer("p", "P")]);
  w.map.obstacles = [];
  w.enemies = [];
  Object.assign(w.players[0], { x: 1000, y: 1000 });
  w.mission.encounters = [];
  return w;
}
it("patrols independently and changes hearing to suspicion then investigation", () => {
  const w = world();
  const e = spawnEnemy(w, { x: 1400, y: 1000 }, "rifle")!;
  e.patrol = [
    { x: 1400, y: 1000 },
    { x: 1500, y: 1100 },
  ];
  w.map.obstacles = [{ x: 1200, y: 0, w: 60, h: 3300, kind: "wall" }];
  noise(w, w.players[0], 1000, "gunfire");
  perceive(w, e, w.players, 0.1);
  expect(e.state).toBe("SUSPICIOUS");
  expect(e.lastSeen).not.toEqual({ x: 1000, y: 1000 });
  w.noises = [];
  e.stateTime = 1;
  perceive(w, e, w.players, 0.1);
  expect(e.state).toBe("INVESTIGATE");
  e.memory = 0;
  Object.assign(e, { x: 1600, y: 1000 });
  perceive(w, e, w.players, 0.1);
  expect(e.state).toBe("RETURN");
  Object.assign(e, e.home);
  perceive(w, e, w.players, 0.1);
  expect(e.state).toBe("PATROL");
});
it("shares dated observations without following a hidden moving player", () => {
  const w = world();
  const e = spawnEnemy(w, { x: 1350, y: 1000 }, "rifle")!,
    ally = spawnEnemy(w, { x: 1750, y: 1000 }, "rush")!;
  perceive(w, e, w.players, 0.1);
  expect(ally.lastSeen).toEqual({ x: 1000, y: 1000 });
  w.map.obstacles = [{ x: 1200, y: 0, w: 60, h: 3300, kind: "wall" }];
  w.players[0].y = 1800;
  w.time = 2;
  perceive(w, e, w.players, 0.1);
  expect(e.lastSeen).toEqual({ x: 1000, y: 1000 });
});
it("runs a short rifle burst while moving instead of announcing every shot with a laser", () => {
  const w = world(),
    e = spawnEnemy(w, { x: 1400, y: 1000 }, "rifle")!;
  e.role = "flank";
  const start = { x: e.x, y: e.y };
  for (let i = 0; i < 30; i++) {
    w.time += 1 / 30;
    enemyAI(w, 1 / 30, 1);
  }
  expect(
    w.events.filter((e) => e.type === "shot" && e.enemy).length,
  ).toBeGreaterThanOrEqual(3);
  expect(Math.hypot(e.x - start.x, e.y - start.y)).toBeGreaterThan(5);
});
it("raises through five alert levels, then decays to a persistent destruction floor", () => {
  const w = world();
  raiseAlert(w, 100, "발전기 파괴", w.players[0], 2);
  expect(w.alertState.level).toBe(4);
  w.time = 100;
  tickAlert(w, 100);
  expect(w.alertState.level).toBe(2);
});
