import { it, expect } from "vitest";
import {
  createWorld,
  makePlayer,
  spawnEnemy,
  tick,
  fire,
} from "../src/game/simulation";
import {
  resetEquipment,
  equip,
  saveActive,
  validateLoadout,
  migrateLoadout,
} from "../src/shared/loadout";
import {
  penetrationMultiplier,
  rayHit,
  worldPoint,
  hitRegions,
  destroyed,
} from "../src/game/armor";
import { applyHit, resolveDamage } from "../src/game/combat";
import { launch, tickProjectiles, fireLauncher } from "../src/game/projectiles";
import { squadSees, lineOfSight, updateVision } from "../src/game/visibility";
import { visibleWorld } from "../src/server/visibility";
import { perceive } from "../src/game/perception";
import { heavyAI } from "../src/game/heavy-ai";
import { emptyInput, WEAPONS, type EnemyKind } from "../src/shared/data";
import { Store } from "../src/server/store";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
function arena() {
  const p = makePlayer("p", "P"),
    w = createWorld("combat", 42, [p], 3);
  w.enemies = [];
  w.squads = {};
  w.director.next = 1e9;
  w.map.obstacles = [];
  w.map.supplies = [];
  w.map.smokes = [];
  Object.assign(p, { x: 1000, y: 1000, angle: 0 });
  return { p, w };
}
it("exhaustively resolves 36 AP/AV combinations, durability and ordered scale", () => {
  for (let ap = 0; ap <= 5; ap++)
    for (let av = 0; av <= 5; av++) {
      const expected = ap < av ? 0 : ap === av ? 0.65 : 1;
      expect(penetrationMultiplier(ap, av)).toBe(expected);
      expect(
        resolveDamage(
          { normal: 100, durable: 20, ap, falloff: 0.5, scale: 0.8 },
          av,
          0.75,
          1.5,
        ),
      ).toBeCloseTo(expected * 40 * 0.5 * 0.8 * 1.5);
    }
  expect(resolveDamage({ normal: 100, durable: 20, ap: 2 }, 3, 0)).toBe(0);
});
it("preserves both magazines and reserves and cancels holstered reload without granting ammo", () => {
  const { p, w } = arena();
  p.input.fire = true;
  tick(w, 1 / 30);
  expect(p.ammo).toBe(29);
  p.input = emptyInput();
  p.input.reload = true;
  tick(w, 1 / 30);
  expect(p.reload).toBeGreaterThan(0);
  p.input = emptyInput();
  p.input.slot = 2;
  tick(w, 1 / 30);
  expect(p.weapon).toBe("pistol");
  expect(p.guns.primary.ammo).toBe(29);
  expect(p.guns.primary.reload).toBe(0);
  p.input.fire = true;
  for (let i = 0; i < 6; i++) tick(w, 1 / 30);
  expect(p.ammo).toBeLessThan(12);
  const pistol = p.ammo;
  p.input = emptyInput();
  p.input.slot = 1;
  tick(w, 1 / 30);
  expect(p.ammo).toBe(29);
  expect(p.guns.secondary.ammo).toBe(pistol);
});
it("rejects slot-switch and legacy-G attacks, and AT occupies the only primary slot", () => {
  const { p, w } = arena();
  p.weapon = "at";
  resetEquipment(p);
  p.input.fire = true;
  p.input.slot = 2;
  tick(w, 1 / 30);
  expect(w.projectiles).toHaveLength(0);
  expect(p.primary).toBe("at");
  expect(p.guns.primary.id).toBe("at");
  expect(Object.keys(p.guns)).toEqual(["primary", "secondary"]);
  p.input.tactical = true;
  fireLauncher(w, p);
  expect(w.projectiles).toHaveLength(0);
});
it("validates unlocked loadouts and migrates old tactical without replacing the selected rifle", () => {
  const profile = { unlocks: ["ar", "smg", "at", "pistol"] } as any;
  expect(
    validateLoadout(
      { primary: "sg", secondary: "pistol", consumable: "frag" },
      profile,
    ),
  ).toBeNull();
  expect(
    validateLoadout(
      { primary: "ar", secondary: "at", consumable: "frag" },
      profile,
    ),
  ).toBeNull();
  expect(
    validateLoadout(
      { primary: "ar", secondary: "pistol", consumable: "made-up" },
      profile,
    ),
  ).toBeNull();
  expect(
    migrateLoadout({ weapon: "smg", tactical: "launcher" }, profile.unlocks)
      .primary,
  ).toBe("smg");
});
it("loads version1 profiles preserving credits, unlocks, mods, operator metadata and reward history", () => {
  const dir = mkdtempSync(join(tmpdir(), "v41-save-"));
  try {
    const p = {
      token: "a".repeat(48),
      credits: 905,
      unlocks: ["ar", "sg"],
      mods: ["none", "loader"],
      runs: 9,
      wins: 4,
      kills: 82,
      settled: ["paid"],
      character: "luna",
      weapon: "sg",
      tactical: "launcher",
    };
    writeFileSync(
      join(dir, "profiles.json"),
      JSON.stringify({ version: 1, profiles: [p] }),
    );
    const s = new Store(dir),
      r = s.get(p.token);
    expect(r.credits).toBe(905);
    expect(r.mods).toContain("loader");
    expect(r.unlocks).toContain("sg");
    expect(r.loadout?.primary).toBe("sg");
    expect((r as any).character).toBe("luna");
    expect(s.settle(r, "paid", 999, true, 1)).toBe(false);
    s.save();
    expect(new Store(dir).get(p.token).credits).toBe(905);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("a frontal ray cannot select the rear core; off-center weapon module has real shape", () => {
  const { w } = arena(),
    e = spawnEnemy(w, { x: 1300, y: 1000 }, "walker", { angle: Math.PI })!;
  const front = rayHit(e, { x: 1000, y: 1000 }, 0, 500)!;
  expect(front.region.id).toBe("body");
  expect(front.region.av).toBe(5);
  const rear = rayHit(e, { x: 1600, y: 1000 }, Math.PI, 500)!;
  expect(rear.region.id).toBe("core");
  const weapon = hitRegions(e).find((r) => r.id === "weapon")!,
    wp = worldPoint(e, weapon);
  expect(
    rayHit(
      e,
      worldPoint(e, { x: weapon.x, y: weapon.y - 200 }),
      e.angle + Math.PI / 2,
      500,
    )?.region.id,
  ).toBe("weapon");
});
it("rear rocket deals 55–70% walker main HP, damages its drive and does not duplicate splash", () => {
  const { p, w } = arena(),
    e = spawnEnemy(w, { x: 1300, y: 1000 }, "walker", { angle: 0 })!;
  launch(w, p, e, "rocket", p.id, false);
  for (let i = 0; i < 40; i++) {
    w.time += 1 / 30;
    tickProjectiles(w, 1 / 30);
  }
  const dealt = 650 - e.hp;
  expect(dealt / 650).toBeGreaterThanOrEqual(0.55);
  expect(dealt / 650).toBeLessThanOrEqual(0.7);
  expect(destroyed(e, "core")).toBe(true);
  expect(
    w.events.filter((x) => x.type === "hit" && x.target === e.id),
  ).toHaveLength(1);
  expect(p.hp).toBe(100);
  const before = e.hp;
  for (let i = 0; i < 4; i++) {
    p.ammo = 30;
    p.recoil = 0;
    fire(w, p);
  }
  expect(e.hp).toBeGreaterThan(100);
  expect(before - e.hp).toBeLessThan(30);
});
it("destroying a physical weapon module disables cannon firing rather than adding duplicate body damage", () => {
  const { p, w } = arena(),
    e = spawnEnemy(w, { x: 1400, y: 1000 }, "walker", { angle: 0 })!;
  const reg = hitRegions(e).find((r) => r.id === "weapon")!,
    point = worldPoint(e, reg);
  const result = applyHit(
    w,
    e,
    { region: reg, point, distance: 0 },
    { normal: 200, durable: 200, ap: 5 },
    p,
  );
  expect(e.hp).toBeCloseTo(650 - result.damage);
  expect(destroyed(e, "weapon")).toBe(true);
  for (let i = 0; i < 90; i++) {
    w.time += 1 / 30;
    heavyAI(w, e, p, 1 / 30);
  }
  expect(w.projectiles).toHaveLength(0);
});
it("one held consumable click never consumes multiple charges; release permits another", () => {
  const { p, w } = arena();
  p.consumable = "medical";
  resetEquipment(p);
  p.hp = 1;
  equip(p, 3);
  p.switching = 0;
  p.input.fire = true;
  tick(w, 1 / 30);
  for (let i = 0; i < 150; i++) tick(w, 1 / 30);
  expect(p.consumableCount).toBe(1);
  expect(p.hp).toBeGreaterThan(60);
  p.input.fire = false;
  tick(w, 1 / 30);
  p.hp = 30;
  p.input.fire = true;
  for (let i = 0; i < 45; i++) tick(w, 1 / 30);
  expect(p.consumableCount).toBe(0);
});
it("smoke blocks AI and team observation in both directions, but does not stop physical bullets", () => {
  const { p, w } = arena(),
    e = spawnEnemy(w, { x: 1400, y: 1000 }, "rifle")!;
  w.map.smokes = [{ id: "s", x: 1200, y: 1000, radius: 110, until: 14 }];
  w.terrainRevision++;
  expect(lineOfSight(p, e, w.map)).toBe(false);
  expect(squadSees(w, e)).toBe(false);
  expect(perceive(w, e, [p], 1 / 30)).toBeUndefined();
  expect(visibleWorld(w).enemies).toHaveLength(0);
  const hp = e.hp;
  p.recoil = 0;
  fire(w, p);
  expect(e.hp).toBeLessThan(hp);
});
it("supplies are finite and replenish only actual slot ammunition within maxima", () => {
  const { p, w } = arena();
  p.ammo = 5;
  p.reserve = 0;
  saveActive(p);
  p.guns.secondary.reserve = 0;
  p.consumableCount = 0;
  w.map.supplies = [{ x: p.x, y: p.y, used: false }];
  p.input.interact = true;
  tick(w, 1 / 30);
  expect(p.reserve).toBeGreaterThan(0);
  expect(p.reserve).toBeLessThanOrEqual(WEAPONS.ar.reserve);
  expect(p.guns.secondary.reserve).toBeGreaterThan(0);
  expect(p.consumableCount).toBe(1);
  expect(p.rockets).toBeUndefined();
  const count = p.reserve;
  tick(w, 1 / 30);
  expect(p.reserve).toBe(count);
});
it("thrown antiarmor hits a real wall and explodes at its stopped location", () => {
  const { p, w } = arena();
  w.map.obstacles = [{ x: 1100, y: 900, w: 30, h: 200, kind: "wall" }];
  launch(w, p, { x: 1250, y: 1000 }, "antiarmor", p.id, false);
  const q = w.projectiles[0];
  for (let i = 0; i < 60; i++) {
    w.time += 1 / 30;
    tickProjectiles(w, 1 / 30);
  }
  expect(q.x).toBeLessThanOrEqual(1100);
  expect(w.projectiles).toHaveLength(0);
  expect(w.events.some((e) => e.type === "explode")).toBe(true);
});

it("preserves a clear geometric difference between frontal generator armor and exposed core, and calls actual local guards even on ricochet", () => {
  const { p, w } = arena(),
    d = w.map.installations.find((d) => d.kind === "generator")!;
  Object.assign(d, { x: 1300, y: 1000, angle: Math.PI, hp: 420 });
  const guard = spawnEnemy(w, { x: 1350, y: 1200 }, "rifle", {
    reserve: true,
  })!;
  const front = rayHit(d, p, 0, 600)!;
  const first = applyHit(w, d, front, { normal: 30, durable: 10, ap: 2 }, p);
  expect(first.damage).toBe(0);
  expect(d.hp).toBe(420);
  expect(guard.reserve).toBe(false);
  expect(guard.lastSeen).toEqual({ x: d.x, y: d.y });
  expect(guard.reportKind).toBe("heard");
  const back = rayHit(d, { x: 1600, y: 1000 }, Math.PI, 600)!;
  expect(back.region.id).toBe("core");
  expect(
    applyHit(w, d, back, { normal: 30, durable: 10, ap: 2 }, p).damage,
  ).toBeGreaterThan(20);
});
it("does not use hidden position or input velocity to update a lost aim observation", async () => {
  const { updateAim } = await import("../src/game/aim-controller");
  const { p, w } = arena(),
    e = spawnEnemy(w, { x: 1400, y: 1000 }, "rifle")!;
  w.time = 1;
  updateAim(w, e, p, 1 / 30);
  const stored = structuredClone(e.aimControl);
  p.x += 500;
  p.input.dx = 1;
  w.time = 2;
  updateAim(w, e, undefined, 1 / 30);
  expect(e.aimControl).toEqual(stored);
});

it("limits walker turret rotation separately from its body heading", async () => {
  const { updateAim, angleDelta } = await import("../src/game/aim-controller");
  const { p, w } = arena(),
    e = spawnEnemy(w, { x: 1400, y: 1000 }, "walker", {
      angle: 0,
      turretAngle: 0,
    })!;
  w.time = 1;
  updateAim(w, e, p, 1 / 30);
  expect(Math.abs(angleDelta(e.turretAngle!, 0))).toBeLessThanOrEqual(
    1.15 / 30 + 1e-8,
  );
  expect(Math.abs(angleDelta(e.angle, 0))).toBeLessThanOrEqual(0.7 / 30 + 1e-8);
});

it("uses the same installation clearance in movement, navigation and pilot corridor checks", async () => {
  const { move, findPath, movementClear, invalidateNavigation, distance } =
    await import("../src/game/map");
  const { p, w } = arena();
  w.map.installations = [
    {
      id: "solid",
      kind: "generator",
      hp: 420,
      maxHp: 420,
      x: 1200,
      y: 1000,
      discovered: true,
    },
  ];
  invalidateNavigation(w.map);
  expect(movementClear(p, { x: 1400, y: 1000 }, w.map)).toBe(false);
  const route = findPath(p, { x: 1400, y: 1000 }, w.map);
  expect(route.length).toBeGreaterThan(0);
  for (let n = 0; n < 1200 && route.length; n++) {
    const q = route[0],
      d = distance(p, q);
    if (d < 6) route.shift();
    else move(p, ((q.x - p.x) / d) * 5, ((q.y - p.y) / d) * 5, w.map);
  }
  expect(distance(p, { x: 1400, y: 1000 })).toBeLessThan(60);
});

it("ricochets never trigger flesh damage/hurt animation and projectile saturation cannot consume ammunition", () => {
  const { p, w } = arena(),
    e = spawnEnemy(w, { x: 1300, y: 1000 }, "walker", { angle: Math.PI })!;
  fire(w, p);
  expect(e.hp).toBe(650);
  expect(e.hurt).toBe(0);
  p.weapon = "at";
  resetEquipment(p);
  for (let i = 0; i < 96; i++)
    launch(w, p, { x: 2000, y: 1000 }, "rocket", p.id, false);
  const ammo = p.ammo;
  fire(w, p);
  expect(p.ammo).toBe(ammo);
});
it("uses impact-side geometry rather than a projectile launch origin for explosion armor", () => {
  const { p, w } = arena(),
    e = spawnEnemy(w, { x: 1300, y: 1000 }, "walker", { angle: Math.PI })!;
  launch(w, p, e, "rocket", p.id, false);
  w.projectiles[0].origin = { x: 1600, y: 1000 };
  for (let i = 0; i < 40; i++) {
    w.time += 1 / 30;
    tickProjectiles(w, 1 / 30);
  }
  expect(650 - e.hp).toBeCloseTo(274.95);
  expect(destroyed(e, "core")).toBe(false);
});

it("uses a generator as physical cover against enemy bullets and cannon blast without enemy-friendly facility damage", async () => {
  const { ballisticDistance, blastClear } =
    await import("../src/game/ballistics");
  const { p, w } = arena();
  w.map.installations = [
    {
      id: "cover",
      kind: "generator",
      x: 1200,
      y: 1000,
      hp: 420,
      maxHp: 420,
      angle: 0,
      discovered: true,
    },
  ];
  expect(ballisticDistance(w, { x: 1400, y: 1000 }, Math.PI, 600)).toBeLessThan(
    200,
  );
  expect(blastClear(w, { x: 1250, y: 1000 }, p)).toBe(false);
  launch(w, { x: 1400, y: 1000 }, p, "cannon", "enemy", true);
  for (let n = 0; n < 60; n++) {
    w.time += 1 / 30;
    tickProjectiles(w, 1 / 30);
  }
  expect(p.hp).toBe(100);
  expect(w.map.installations[0].hp).toBe(420);
});

it("retains one dedicated guard per strategic site instead of emptying every facility during a kite", () => {
  const w = createWorld("guards", 42, [makePlayer("p", "P")], 10);
  for (let zone = 0; zone < 6; zone++)
    expect(
      w.enemies.some(
        (e) => e.squad === "guard-" + zone && e.assignment === "guard",
      ),
    ).toBe(true);
});

it("finds a real lateral attack angle when a generator blocks the observed firing line", async () => {
  const { clearShot, peekPosition } = await import("../src/game/cover");
  const { p, w } = arena(),
    e = spawnEnemy(w, { x: 1400, y: 1000 }, "rifle")!;
  w.map.installations = [
    {
      id: "cover",
      kind: "generator",
      x: 1200,
      y: 1000,
      hp: 420,
      maxHp: 420,
      angle: 0,
      discovered: true,
    },
  ];
  expect(clearShot(w, e, p)).toBe(false);
  const peek = peekPosition(w, e, p);
  expect(peek).toBeTruthy();
  expect(Math.abs(peek!.y - e.y)).toBeGreaterThan(100);
});

it("does not treat smoke as an acoustic wall or reveal the heard shooter exactly", async () => {
  const { noise } = await import("../src/game/perception");
  const { p, w } = arena(),
    e = spawnEnemy(w, { x: 1700, y: 1000 }, "rifle")!;
  w.map.smokes = [{ id: "cloud", x: 1400, y: 1000, radius: 180, until: 20 }];
  noise(w, p, 900, "gunfire");
  expect(perceive(w, e, [p], 1 / 30)).toBeUndefined();
  expect(e.state).toBe("SUSPICIOUS");
  expect(e.lastSeen).not.toEqual({ x: p.x, y: p.y });
});

it("reports both weakpoint and partial-penetration facts instead of pretending a partial weak hit is full penetration", () => {
  const { p, w } = arena(),
    e = spawnEnemy(w, { x: 1300, y: 1000 }, "walker", { angle: 0 })!;
  const hit = rayHit(e, p, 0, 600)!;
  applyHit(w, e, hit, { normal: 30, durable: 10, ap: 2 }, p, "ar");
  const feedback = w.events.find((e) => e.type === "hit")!;
  expect(feedback.quality).toBe("weakpoint");
  expect(feedback.penetrationResult).toBe("partial");
  expect(feedback.damage).toBeCloseTo(7.41);
});

it("keeps infantry head hit geometry aligned with the upward-projected PNG face at every heading", () => {
  const { w } = arena(),
    e = spawnEnemy(w, { x: 1300, y: 1000 }, "rifle")!;
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    e.angle = angle;
    const part = hitRegions(e).find((p) => p.id === "head")!,
      head = worldPoint(e, part);
    expect(head.x).toBeCloseTo(e.x);
    expect(head.y).toBeCloseTo(e.y - 25);
    const ray = rayHit(e, { x: e.x - 200, y: head.y }, 0, 400)!;
    expect(ray.region.id).toBe("head");
    expect(ray.region.av).toBe(0);
  }
});
