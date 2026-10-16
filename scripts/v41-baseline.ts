/** Controlled V4 experiments. No human balance claims; same harness is retained for comparison. */
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
  type WeaponId,
  type EnemyKind,
} from "../src/shared/data";
const out = process.env.QA_OUTPUT || "docs/v4.1/baseline";
mkdirSync(out, { recursive: true });
let cached: ReturnType<typeof createWorld> | undefined;
function arena(seed = 42) {
  const p = makePlayer("pilot", "CONTROLLED");
  const w = (cached ??= createWorld("fixture", seed, [p], 10));
  w.players = [p];
  w.random = seed;
  w.time = 0;
  w.projectiles = [];
  w.wrecks = [];
  w.events = [];
  w.eventId = 0;
  w.noises = [];
  w.supportSignals = [];
  w.dispatchKeys = {};
  w.mission.stage = "recon";
  w.mission.elapsed = 0;
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
  w.map.supplies = [];
  w.alertState.heat = 0;
  w.alertState.level = 0;
  w.map.obstacles = [];
  w.enemies = [];
  w.squads = {};
  w.director.next = 1e9;
  w.reinforcements = [];
  w.map.installations = [];
  p.x = 3000;
  p.y = 2100;
  return { p, w };
}
const damage = [];
for (const weapon of ["ar", "smg", "sg"] as WeaponId[])
  for (const kind of [
    "rifle",
    "rush",
    "heavy",
    "juggernaut",
    "drone",
    "walker",
    "artillery",
  ] as EnemyKind[])
    for (const range of [90, 250, 500, 750])
      for (const facing of [0, Math.PI / 2, Math.PI]) {
        let sum = 0;
        for (let n = 0; n < 25; n++) {
          const { p, w } = arena(42 + n);
          p.weapon = weapon;
          p.angle = 0;
          const e = spawnEnemy(w, { x: p.x + range, y: p.y }, kind, {
            angle: facing,
            hp: 1e6,
          })!;
          fire(w, p);
          sum += 1e6 - e.hp;
        }
        const average = sum / 25;
        damage.push({
          weapon,
          kind,
          range,
          facing,
          damage: average,
          estimatedShots:
            average > 0 ? Math.ceil(ENEMIES[kind].hp / average) : null,
          estimatedSeconds:
            average > 0
              ? (Math.ceil(ENEMIES[kind].hp / average) - 1) *
                WEAPONS[weapon].rate
              : null,
        });
      }
const rockets = [];
for (const facing of [0, Math.PI / 2, Math.PI]) {
  const { p, w } = arena();
  const e = spawnEnemy(w, { x: p.x + 200, y: p.y }, "walker", {
    angle: facing,
  })!;
  launch(w, p, e, "rocket", p.id, false);
  for (let n = 0; n < 30 && w.projectiles.length; n++) {
    w.time += 1 / 30;
    tickProjectiles(w, 1 / 30);
  }
  const afterRocket = e.hp;
  let arShots = 0;
  while (e.hp > 0 && arShots < 200) {
    p.recoil = 0;
    fire(w, p);
    arShots++;
  }
  rockets.push({
    facing,
    rocketDamage: 650 - afterRocket,
    afterRocket,
    arShots,
    arSeconds: Math.max(0, arShots - 1) * WEAPONS.ar.rate,
  });
}
const movement = [];
for (const mode of ["stationary", "strafe", "circle", "cover"]) {
  const { p, w } = arena();
  p.hp = 1e6;
  const e = spawnEnemy(w, { x: 3000, y: 1750 }, "rifle", {
    elite: true,
    role: "anchor",
  })!;
  if (mode === "cover")
    w.map.obstacles = [{ x: 2860, y: 1890, w: 280, h: 40, kind: "wall" }];
  let shots = 0,
    hits = 0;
  for (let n = 0; n < 900; n++) {
    p.input.dx =
      mode === "strafe"
        ? Math.floor(n / 24) % 2
          ? 1
          : -1
        : mode === "circle"
          ? Math.cos((n / 30) * 1.1)
          : 0;
    p.input.dy = mode === "circle" ? Math.sin((n / 30) * 1.1) : 0;
    const last = w.eventId;
    tick(w, 1 / 30);
    for (const ev of w.events.filter((x) => x.id > last)) {
      if (ev.type === "shot" && ev.enemy) shots++;
      if (ev.type === "hit" && ev.actor === p.id) hits++;
    }
  }
  movement.push({
    mode,
    seconds: w.time,
    shots,
    hits,
    damage: 1e6 - p.hp,
    hitRate: shots ? hits / shots : 0,
  });
}
const objectives = [];
for (const weapon of ["ar", "smg", "sg"] as WeaponId[]) {
  const { p, w } = arena();
  p.weapon = weapon;
  p.ammo = WEAPONS[weapon].mag;
  p.reserve = WEAPONS[weapon].reserve;
  const d = {
    id: "target",
    kind: "generator" as const,
    x: p.x + 200,
    y: p.y,
    hp: 420,
    maxHp: 420,
    discovered: true,
  };
  w.map.installations = [d];
  p.input.fire = true;
  let n = 0;
  for (; n < 900 && d.hp > 0; n++) tick(w, 1 / 30);
  objectives.push({ weapon, seconds: w.time, hp: d.hp });
}
writeFileSync(
  out + "/combat.json",
  JSON.stringify(
    {
      fixture:
        "Controlled open-range measurements, 25 seeded shots per sample; estimated TTK excludes reload and assumes repeated same expected damage. Movement uses 1e6 HP to measure incoming damage, not mission success.",
      damage,
      rockets,
      movement,
      objectives,
    },
    null,
    2,
  ),
);
console.log({ samples: damage.length, rockets, movement, objectives });
