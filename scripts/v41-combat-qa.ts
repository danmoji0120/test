import { mkdirSync, writeFileSync } from "node:fs";
import {
  createWorld,
  makePlayer,
  spawnEnemy,
  fire,
  tick,
} from "../src/game/simulation";
import { launch, tickProjectiles } from "../src/game/projectiles";
import {
  WEAPONS,
  ENEMIES,
  emptyInput,
  type WeaponId,
  type EnemyKind,
} from "../src/shared/data";
const output = process.env.QA_OUTPUT || "docs/v4.1/combat";
mkdirSync(output, { recursive: true });
function arena(seed = 42) {
  const p = makePlayer("p", "CONTROLLED"),
    w = createWorld("combat-experiment", seed, [p], 10);
  w.map.obstacles = [];
  w.map.installations = [];
  w.map.supplies = [];
  w.enemies = [];
  w.squads = {};
  w.reinforcements = [];
  w.director.next = 1e9;
  w.mission.objectives = [
    {
      id: "intel",
      kind: "intel",
      label: "fixture",
      position: { x: 0, y: 0 },
      optional: true,
      state: "available",
      progress: 0,
      total: 3,
      reward: 0,
      discovered: false,
    },
  ];
  Object.assign(p, { x: 3000, y: 2100 });
  return { p, w };
}
const weapons = Object.keys(WEAPONS) as WeaponId[],
  damage = [];
for (const weapon of weapons)
  for (const kind of Object.keys(ENEMIES) as EnemyKind[])
    for (const range of [90, 250, 500, 750])
      for (const face of ["front", "side", "rear"]) {
        const { p, w } = arena();
        p.weapon = weapon;
        p.ammo = WEAPONS[weapon].mag;
        p.reserve = WEAPONS[weapon].reserve;
        p.angle = 0;
        p.input.aim = true;
        const e = spawnEnemy(w, { x: p.x + range, y: p.y }, kind, {
          angle: face === "front" ? Math.PI : face === "rear" ? 0 : Math.PI / 2,
        })!;
        let firstDamage = 0,
          shots = 0,
          reloads = 0,
          lastFire = -100,
          ended = 0;
        for (let step = 0; step < 1800 && e.hp > 0; step++) {
          w.time = step / 30;
          p.recoil = Math.max(0, p.recoil - 0.045 / 30);
          if (p.ammo <= 0 && p.reserve > 0) {
            const add = Math.min(WEAPONS[weapon].mag, p.reserve);
            p.ammo += add;
            p.reserve -= add;
            lastFire = w.time + WEAPONS[weapon].reload - WEAPONS[weapon].rate;
            reloads++;
          }
          if (p.ammo > 0 && w.time - lastFire >= WEAPONS[weapon].rate - 1e-5) {
            const hp = e.hp;
            fire(w, p);
            shots++;
            lastFire = w.time;
            if (shots === 1 && weapon !== "at") firstDamage = hp - e.hp;
          }
          tickProjectiles(w, 1 / 30);
          if (
            weapon === "at" &&
            shots === 1 &&
            w.projectiles.length === 0 &&
            firstDamage === 0
          )
            firstDamage = ENEMIES[kind].hp - e.hp;
          ended = w.time;
          if (p.ammo === 0 && p.reserve === 0 && !w.projectiles.length) break;
        }
        damage.push({
          weapon,
          kind,
          range,
          face,
          firstDamage,
          shots,
          reloads,
          seconds: ended,
          killed: e.hp <= 0,
          remaining: Math.max(0, e.hp),
          components: e.components,
        });
      }
const movement = [];
for (const level of [3, 10])
  for (const group of [1, 3])
    for (const mode of ["stationary", "strafe", "circle", "zigzag", "cover"]) {
      const { p, w } = arena();
      w.difficulty = level;
      p.hp = 1e6;
      for (let i = 0; i < group; i++)
        spawnEnemy(
          w,
          { x: p.x + (i - 1) * 170, y: p.y - 350 },
          i === 2 ? "heavy" : "rifle",
          {
            elite: level === 10,
            role: i === 1 ? "flank" : "anchor",
            angle: Math.PI / 2,
          },
        );
      if (mode === "cover")
        w.map.obstacles = [{ x: 2700, y: 1880, w: 600, h: 45, kind: "wall" }];
      let shots = 0,
        hits = 0;
      const paths: Record<string, { x: number; y: number }[]> = {};
      for (let n = 0; n < 900; n++) {
        p.input = emptyInput();
        p.input.dx =
          mode === "strafe"
            ? Math.floor(n / 24) % 2
              ? 1
              : -1
            : mode === "circle"
              ? Math.cos((n / 30) * 1.1)
              : mode === "zigzag"
                ? Math.floor(n / 7) % 2
                  ? 1
                  : -1
                : 0;
        p.input.dy = mode === "circle" ? Math.sin((n / 30) * 1.1) : 0;
        const id = w.eventId;
        tick(w, 1 / 30);
        for (const event of w.events.filter((e) => e.id > id)) {
          if (event.type === "shot" && event.enemy) shots++;
          if (event.type === "hit" && event.actor === p.id) hits++;
        }
        if (n % 30 === 0)
          for (const e of w.enemies)
            (paths[e.id] ??= []).push({ x: e.x, y: e.y });
      }
      movement.push({
        level,
        group,
        mode,
        shots,
        hits,
        damage: 1e6 - p.hp,
        hitRate: shots ? hits / shots : 0,
        roles: w.enemies.map((e) => ({
          kind: e.kind,
          role: e.role,
          assignment: e.assignment,
        })),
        paths,
      });
    }
const generators = [];
for (const weapon of weapons)
  for (const face of ["front", "rear"]) {
    const { p, w } = arena();
    p.weapon = weapon;
    p.ammo = WEAPONS[weapon].mag;
    p.reserve = WEAPONS[weapon].reserve;
    p.input.aim = true;
    const d: any = {
      id: "generator",
      kind: "generator" as const,
      x: 3200,
      y: 2100,
      hp: 420,
      maxHp: 420,
      discovered: true,
      angle: face === "front" ? Math.PI : 0,
    };
    w.map.installations = [d];
    p.angle = 0;
    p.input.fire = true;
    let shots = 0;
    for (let n = 0; n < 900 && d.hp > 0; n++) {
      if (p.ammo === 0 && p.reserve > 0) {
        w.time += WEAPONS[weapon].reload;
        const add = Math.min(WEAPONS[weapon].mag, p.reserve);
        p.ammo += add;
        p.reserve -= add;
      }
      if (p.ammo === 0) break;
      p.recoil = 0;
      fire(w, p);
      shots++;
      for (
        let j = 0;
        j < Math.ceil(WEAPONS[weapon].rate * 30) && d.hp > 0;
        j++
      ) {
        w.time += 1 / 30;
        tickProjectiles(w, 1 / 30);
      }
    }
    generators.push({
      weapon,
      face,
      shots,
      seconds: w.time,
      hp: d.hp,
      components: d.components,
    });
  }
const report = {
  fixture:
    "Fixed-position ray/projectile damage with data-defined reload/cadence, no enemy AI; not human TTK. Movement experiments use actual 30Hz inputs and 1e6HP to record damage. Same source harness runs against V4 reference and V4.1.",
  damage,
  movement,
  generators,
};
writeFileSync(
  output + "/combat-experiments.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      damageSamples: damage.length,
      movement: movement.map(({ paths, ...m }) => m),
      generators,
    },
    null,
    2,
  ),
);
