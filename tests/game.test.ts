import { describe, it, expect } from "vitest";
import {
  generateMap,
  findPath,
  blocked,
  move,
  visible,
  rayRect,
} from "../src/game/map";
import {
  createWorld,
  makePlayer,
  tick,
  fire,
  spawnEnemy,
  damagePlayer,
  finish,
} from "../src/game/simulation";
import { WEAPONS, emptyInput, type WeaponId } from "../src/shared/data";
import { Pilot } from "../scripts/bot";
function setup(n = 1) {
  const w = createWorld(
    "test",
    42,
    Array.from({ length: n }, (_, i) => makePlayer("p" + i, "Test " + i)),
  );
  w.map.obstacles = [{ x: 510, y: 220, w: 55, h: 420, kind: "wall" }];
  w.players.forEach((p, i) =>
    Object.assign(p, {
      x: 240 + (i % 2) * 60,
      y: 260 + Math.floor(i / 2) * 60,
    }),
  );
  w.enemies = [];
  w.mission.stage = "operate";
  return w;
}
function advance(w: ReturnType<typeof setup>, seconds: number) {
  for (let t = 0; t < seconds * 30; t++) tick(w, 1 / 30);
}
describe("seed and collision geometry", () => {
  it("reproduces the map and varies layout across seeds", () => {
    expect(generateMap(9)).toEqual(generateMap(9));
    expect(generateMap(9)).not.toEqual(generateMap(10));
  });
  it("keeps all objectives and extraction reachable for 100 seeds", () => {
    for (let seed = 0; seed < 100; seed++) {
      const m = generateMap(seed);
      for (const goal of [
        ...m.zones.map((z) => z.center),
        ...m.installations,
        m.intel,
        ...m.extractions,
        ...m.supplies,
      ].filter(
        (goal) => Math.hypot(goal.x - m.spawn.x, goal.y - m.spawn.y) > 1,
      )) {
        expect(blocked(goal, m.obstacles, 20)).toBe(false);
        expect(
          findPath(m.spawn, goal, m).length,
          `seed ${seed} goal ${goal.x},${goal.y}`,
        ).toBeGreaterThan(0);
      }
    }
  }, 20000);
  it("blocks movement and supports sliding along walls", () => {
    const m = generateMap(1),
      p = { x: 490, y: 300 };
    m.obstacles = [{ x: 510, y: 220, w: 55, h: 420, kind: "wall" }];
    move(p, 60, 25, m);
    expect(p.x).toBe(490);
    expect(p.y).toBe(325);
  });
  it("blocks lines of sight and rays at the closest surface", () => {
    const m = generateMap(1);
    m.obstacles = [{ x: 510, y: 220, w: 55, h: 420, kind: "wall" }];
    expect(visible({ x: 490, y: 300 }, { x: 650, y: 300 }, m)).toBe(false);
    expect(
      rayRect(
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 10, y: -5, w: 10, h: 10, kind: "wall" },
        100,
      ),
    ).toBe(10);
  });
});
describe("server combat rules", () => {
  it.each(["ar", "smg", "sg"] as WeaponId[])(
    "%s consumes one shell/cartridge and emits the correct number of rays",
    (weapon) => {
      const w = setup(),
        p = w.players[0];
      w.enemies = [];
      p.weapon = weapon;
      p.ammo = WEAPONS[weapon].mag;
      const before = p.ammo;
      fire(w, p);
      expect(p.ammo).toBe(before - 1);
      expect(w.events.filter((e) => e.type === "shot")).toHaveLength(
        WEAPONS[weapon].pellets,
      );
    },
  );
  it.each(["ar", "smg", "sg"] as WeaponId[])(
    "%s deals damage with line of sight",
    (weapon) => {
      const w = setup(),
        p = w.players[0];
      w.enemies = [];
      Object.assign(p, { x: 300, y: 800, weapon, angle: 0 });
      spawnEnemy(w, { x: 380, y: 800 }, "heavy");
      const hp = w.enemies[0].hp;
      fire(w, p);
      expect(w.enemies[0].hp).toBeLessThan(hp);
    },
  );
  it("stops shots at cover and never damages friendlies", () => {
    const w = setup(2),
      p = w.players[0];
    w.enemies = [];
    Object.assign(p, { x: 470, y: 300, angle: 0 });
    Object.assign(w.players[1], { x: 480, y: 300 });
    spawnEnemy(w, { x: 600, y: 300 }, "rifle");
    fire(w, p);
    expect(w.enemies[0].hp).toBe(65);
    expect(w.players[1].hp).toBe(100);
  });
  it("reload conserves total ammunition and cannot fire during reload", () => {
    const w = setup(),
      p = w.players[0];
    w.enemies = [];
    p.ammo = 5;
    p.reserve = 13;
    p.input = { ...emptyInput(), reload: true, fire: true };
    tick(w, 1 / 30);
    expect(p.reload).toBeGreaterThan(0);
    expect(p.ammo).toBe(5);
    p.input = emptyInput();
    advance(w, 2);
    expect(p.ammo).toBe(18);
    expect(p.reserve).toBe(0);
  });
  it("sprinting disables fire and normalized diagonal speed stays bounded", () => {
    const w = setup(),
      p = w.players[0];
    w.enemies = [];
    const x = p.x,
      y = p.y;
    p.input = { ...emptyInput(), dx: 1, dy: 1, sprint: true, fire: true };
    tick(w, 0.1);
    expect(Math.hypot(p.x - x, p.y - y)).toBeLessThan(43);
    expect(p.ammo).toBe(30);
  });
  it("revives a teammate with continuous nearby input; support is faster", () => {
    const w = setup(2),
      [p, q] = w.players;
    w.enemies = [];
    q.character = "luna";
    damagePlayer(w, p, 100);
    q.input = { ...emptyInput(), revive: true };
    advance(w, 2.3);
    expect(p.down).toBe(false);
    expect(p.hp).toBe(55);
  });
  it("does not revive through a wall or from far away", () => {
    const w = setup(2),
      [p, q] = w.players;
    w.enemies = [];
    Object.assign(p, { x: 490, y: 300 });
    Object.assign(q, { x: 580, y: 300 });
    damagePlayer(w, p, 100);
    q.input = { ...emptyInput(), revive: true };
    advance(w, 4);
    expect(p.down).toBe(true);
  });
  it("fails once all connected operators are down", () => {
    const w = setup(2);
    w.players.forEach((p) => damagePlayer(w, p, 100));
    tick(w, 0.03);
    expect(w.mission.stage).toBe("failed");
    const reward = w.mission.reward;
    finish(w, true, "invalid");
    expect(w.mission.reward).toBe(reward);
    expect(w.mission.stage).toBe("failed");
  });
  it("AI cannot see through a wall or walk into solid cover", () => {
    const w = setup();
    w.enemies = [];
    Object.assign(w.players[0], { x: 480, y: 300 });
    spawnEnemy(w, { x: 650, y: 300 }, "rifle");
    advance(w, 3);
    expect(w.players[0].hp).toBe(100);
    expect(w.enemies[0].target).toBeNull();
    for (let t = 0; t < 1800; t++) {
      tick(w, 1 / 30);
      for (const e of w.enemies)
        expect(blocked(e, w.map.obstacles, 18)).toBe(false);
    }
  });
  it("shot events and dead enemy state stay bounded under repeated combat", () => {
    const w = setup(),
      p = w.players[0];
    w.enemies = [];
    Object.assign(p, { x: 300, y: 800, angle: 0 });
    for (let i = 0; i < 300; i++) {
      spawnEnemy(w, { x: 380, y: 800 }, "rush");
      for (let s = 0; s < 5; s++) fire(w, p);
      tick(w, 1 / 30);
    }
    expect(w.events.length).toBeLessThanOrEqual(160);
    expect(w.enemies.every((e) => e.hp > 0)).toBe(true);
  });
});
describe("mission objectives", () => {
  it("simultaneous supply interaction cannot duplicate resupply", () => {
    const w = setup(4);
    for (const p of w.players) {
      Object.assign(p, w.map.supplies[0]);
      p.input = { ...emptyInput(), interact: true };
    }
    advance(w, 0.1);
    const reserve = w.players[0].reserve;
    advance(w, 1);
    expect(w.players[0].reserve).toBe(reserve);
    expect(w.map.supplies[0].used).toBe(true);
  });
  it("starts with a populated theatre and no guard-clearance gate", () => {
    const w = createWorld("free", 42, [makePlayer("p", "Test")]);
    expect(w.mission.objectives.filter((o) => !o.optional)).toHaveLength(2);
    expect(w.mission.stage).toBe("recon");
    expect(w.enemies.some((e) => e.reserve)).toBe(true);
  });
  it("requires every connected teammate at extraction and ignores disconnected clients", () => {
    const w = setup(2);
    w.enemies = [];
    w.mission.stage = "extract";
    Object.assign(w.mission.extraction, {
      state: "landed",
      site: { ...w.map.extractions[0] },
      eta: 0,
      departure: 1000,
    });
    Object.assign(w.players[0], w.map.extractions[0]);
    advance(w, 6);
    expect(w.mission.stage).toBe("extract");
    w.players[1].connected = false;
    advance(w, 5.2);
    expect(w.mission.stage).toBe("success");
  });
  it("runs the entire mission with 4 input-only pilots without modifying game state", () => {
    const w = createWorld(
        "complete",
        42,
        Array.from({ length: 4 }, (_, i) => makePlayer("p" + i, "Test")),
      ),
      pilots = w.players.map(() => new Pilot());
    let steps = 0;
    while (!["success", "failed"].includes(w.mission.stage) && steps < 27000) {
      w.players.forEach((p, i) => (p.input = pilots[i].input(w, p, i)));
      tick(w, 1 / 30);
      steps++;
    }
    console.log(
      "Full input-only mission:",
      w.mission.stage,
      w.mission.elapsed.toFixed(1),
      "seconds",
      w.players.map((p) => ({ hp: p.hp, kills: p.kills, ammo: p.reserve })),
    );
    expect(w.mission.stage).toBe("success");
    expect(
      w.map.installations
        .filter((d) => d.kind === "generator")
        .every((d) => d.hp <= 0),
    ).toBe(true);
    expect(w.players.reduce((n, p) => n + p.kills, 0)).toBeGreaterThan(0);
  }, 30000);
});

it("generators are independently damageable from insertion while enemies remain alive", () => {
  const w = setup(),
    p = w.players[0],
    gens = w.map.installations.filter((d) => d.kind === "generator");
  w.map.obstacles = [];
  for (const d of [...gens].reverse()) {
    Object.assign(p, { x: d.x - 100, y: d.y, angle: 0 });
    for (let n = 0; n < 15; n++) fire(w, p);
    expect(d.hp).toBe(0);
  }
  tick(w, 0.03);
  expect(w.mission.extraction.state).toBe("available");
  expect(w.mission.stage).not.toBe("extract");
});
it("shotgun has ten rays but one discharge and aggregated target impact", () => {
  const w = setup(),
    p = w.players[0];
  p.weapon = "sg";
  Object.assign(p, { x: 300, y: 800, angle: 0 });
  spawnEnemy(w, { x: 370, y: 800 }, "heavy");
  fire(w, p);
  const shots = w.events.filter((e) => e.type === "shot");
  expect(shots.length).toBe(10);
  expect(shots.filter((e) => !e.pellet).length).toBe(1);
  expect(w.events.filter((e) => e.type === "hit").length).toBe(1);
});

it("sustained automatic fire builds recoil and releasing the trigger recovers it", () => {
  const w = setup();
  w.enemies = [];
  const p = w.players[0];
  p.input = { ...emptyInput(), fire: true };
  advance(w, 2);
  expect(p.recoil).toBeGreaterThan(0.06);
  p.input = emptyInput();
  advance(w, 3);
  expect(p.recoil).toBe(0);
});

it("never boards an inbound transport and gives boarding priority at its departure boundary", () => {
  const w = setup();
  Object.assign(w.players[0], w.map.extractions[0]);
  w.mission.stage = "extract";
  Object.assign(w.mission.extraction, {
    state: "inbound",
    site: { ...w.map.extractions[0] },
    eta: 20,
    departure: 85,
  });
  advance(w, 3);
  expect(w.mission.stage).toBe("extract");
  expect(w.mission.extraction.boarding).toBe(0);
  Object.assign(w.mission.extraction, {
    state: "landed",
    departure: w.time + 0.01,
    boarding: 2.99,
  });
  tick(w, 0.03);
  expect(w.mission.stage).toBe("success");
});
it("different seeds change facility footprints, hall connections and machinery", () => {
  const maps = Array.from({ length: 20 }, (_, seed) => generateMap(seed));
  expect(
    new Set(
      maps.map((m) => JSON.stringify(m.zones.map((z) => [z.x, z.y, z.w, z.h]))),
    ).size,
  ).toBeGreaterThanOrEqual(4);
  expect(
    new Set(maps.map((m) => m.zones.map((z) => z.kind + z.variant).join()))
      .size,
  ).toBeGreaterThan(15);
});
it("AR drops a close rifle guard in two shots while SMG needs a longer stream", () => {
  for (const weapon of ["ar", "smg"] as const) {
    const w = setup(),
      p = w.players[0];
    Object.assign(p, { x: 300, y: 800, angle: 0, weapon });
    spawnEnemy(w, { x: 380, y: 800 }, "rifle");
    fire(w, p);
    fire(w, p);
    expect(w.enemies[0].hp <= 0).toBe(weapon === "ar");
  }
});

it("completes an operation with discrete WASD held for 100ms updates without waypoint oscillation", () => {
  const w = createWorld(
      "keyboard",
      42,
      Array.from({ length: 4 }, (_, i) => makePlayer("p" + i, "Keyboard")),
    ),
    pilots = w.players.map(() => new Pilot());
  for (
    let step = 0;
    step < 18000 && !["success", "failed"].includes(w.mission.stage);
    step++
  ) {
    if (step % 3 === 0)
      w.players.forEach((p, i) => {
        const input = pilots[i].input(w, p, i);
        input.dx = Math.abs(input.dx) > 0.1 ? Math.sign(input.dx) : 0;
        input.dy = Math.abs(input.dy) > 0.1 ? Math.sign(input.dy) : 0;
        p.input = input;
      });
    tick(w, 1 / 30);
  }
  expect(w.mission.stage).toBe("success");
});

it("hits the visible upper torso instead of requiring shots at an enemy's feet", () => {
  const w = setup(),
    p = w.players[0];
  Object.assign(p, { x: 300, y: 800 });
  spawnEnemy(w, { x: 400, y: 800 }, "rifle");
  p.angle = Math.atan2(800 - 35 - (p.y - 16), 400 - p.x);
  fire(w, p);
  expect(w.enemies[0].hp).toBeLessThan(65);
});

it("connects a physically clear cover corner to a free navigation start cell", () => {
  const m = generateMap(7),
    p = { x: 1437, y: 255 },
    goal = { x: 1550, y: 450 };
  m.obstacles = [{ x: 1250, y: 280, w: 170, h: 80, kind: "crate" }];
  expect(blocked(p, m.obstacles, 16)).toBe(false);
  const path = findPath(p, goal, m);
  expect(path.length).toBeGreaterThan(0);
  for (let step = 0; step < 4000 && path.length; step++) {
    const v = path[0],
      d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d < 8) {
      path.shift();
      continue;
    }
    move(p, ((v.x - p.x) / d) * 7, ((v.y - p.y) / d) * 7, m);
  }
  expect(Math.hypot(p.x - goal.x, p.y - goal.y)).toBeLessThan(100);
});

it("freezes combat immediately after boarding instead of damaging escaped teammates", () => {
  const w = setup(),
    p = w.players[0];
  w.mission.stage = "extract";
  Object.assign(w.mission.extraction, {
    state: "landed",
    site: { ...w.map.extractions[0] },
    eta: 0,
    departure: 1000,
  });
  w.mission.extraction.boarding = 2.99;
  Object.assign(p, { ...w.map.extractions[0], hp: 7, hurt: 4 });
  spawnEnemy(w, { x: p.x - 100, y: p.y }, "rifle");
  Object.assign(w.enemies[0], { windup: 0.01, angle: 0 });
  tick(w, 1 / 30);
  expect(w.mission.stage).toBe("success");
  expect(p.hp).toBe(7);
  expect(w.events.some((e) => e.type === "shot" && e.enemy)).toBe(false);
});

it("fires within a quarter second of first visual contact", () => {
  const w = setup(),
    p = w.players[0];
  w.map.obstacles = [];
  spawnEnemy(w, { x: p.x + 300, y: p.y }, "rifle");
  advance(w, 0.25);
  expect(w.events.some((e) => e.type === "shot" && e.enemy)).toBe(true);
});
it("relays the observed position to nearby guards but forgets it behind cover", () => {
  const w = setup(),
    p = w.players[0];
  w.map.obstacles = [];
  spawnEnemy(w, { x: p.x + 250, y: p.y }, "rifle");
  spawnEnemy(w, { x: p.x + 780, y: p.y }, "rush");
  w.enemies[1].role = "flank";
  tick(w, 1 / 30);
  expect(w.enemies[1].lastSeen).toEqual({ x: p.x, y: p.y });
  expect(w.enemies[1].memory).toBeGreaterThan(0);
  const snapshot = { ...w.enemies[1].lastSeen! };
  w.map.obstacles = [
    { x: p.x + 100, y: 0, w: 80, h: w.map.height, kind: "wall" },
  ];
  p.y += 100;
  advance(w, 1);
  expect(w.enemies[1].lastSeen).toEqual(snapshot);
  advance(w, 9);
  expect(w.enemies.every((e) => e.memory === 0 && e.target === null)).toBe(
    true,
  );
  expect(p.hp).toBe(100);
});
it("uses a free flanking goal and anchors a heavy gun at a cover corner", () => {
  const w = setup(),
    p = w.players[0];
  w.map.obstacles = [{ x: 600, y: 370, w: 160, h: 100, kind: "container" }];
  spawnEnemy(w, { x: 600, y: 260 }, "rush");
  spawnEnemy(w, { x: 680, y: 300 }, "heavy");
  w.enemies[0].role = "flank";
  w.enemies.forEach((e) => (e.cooldown = 1));
  tick(w, 1 / 30);
  const [flank, heavy] = w.enemies;
  expect(flank.tactical).not.toEqual({ x: p.x, y: p.y });
  expect(blocked(flank.tactical!, w.map.obstacles, 20)).toBe(false);
  expect(heavy.role).toBe("anchor");
  expect(heavy.tactical).not.toEqual({ x: p.x, y: p.y });
  expect(heavy.path.length).toBeGreaterThan(0);
});
