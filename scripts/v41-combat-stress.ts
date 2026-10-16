import {
  createWorld,
  makePlayer,
  spawnEnemy,
  tick,
} from "../src/game/simulation";
import { visibleWorld } from "../src/server/visibility";
import { packRoom, type StreamCursor } from "../src/shared/snapshot";
import { blocked } from "../src/game/map";
import { enemyRadius,ensureComponents } from "../src/game/armor";
import { forceBudget } from "../src/game/budgets";
import { ENEMIES, type EnemyKind } from "../src/shared/data";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
const output =
  process.env.QA_REPORT_DIR || "docs/v4.1/performance/combat-smoke";
mkdirSync(output, { recursive: true });
const players = Array.from({ length: 4 }, (_, i) =>
    Object.assign(makePlayer("p" + i, "STRESS"), {
      weapon: ["ar", "smg", "sg", "at"][i],
      consumable: i === 0 ? "smoke" : "antiarmor",
    }),
  ),
  w = createWorld("synthetic-server-stress", 42, players, 10);
if (!process.env.QA_STRESS_TERRAIN) w.map.obstacles = [];
w.enemies = [];
w.squads = {};
w.director.next = 1e8;
w.alertState.heat = 130;
w.alertState.level = 4;
const anchor = process.env.QA_STRESS_TERRAIN
  ? w.map.zones[0].entry
  : { x: 2900, y: 2050 };
players.forEach((p, i) =>
  Object.assign(p, { x: anchor.x + i * 50, y: anchor.y + 200, hp: 1e6 }),
);
const actorLimit=Number(process.env.QA_STRESS_ACTORS||64);
for (let i = 0; i < 2000 && w.enemies.length < actorLimit; i++) {
  const kind = (Object.keys(ENEMIES) as EnemyKind[])[i % 7],
    a = i * 2.399,
    r = 300 + (i % 8) * 90;
  spawnEnemy(
    w,
    { x: 3000 + Math.cos(a) * r, y: 2100 + Math.sin(a) * r },
    kind,
    { hp: 1e6 },
  );
}
if(process.env.QA_INITIALIZE_PARTS)w.enemies.forEach(ensureComponents);
const ticks: number[] = [],
  services: number[] = [],
  bytes: number[] = [];
let cursor: StreamCursor | undefined;
let maxProjectiles = 0,
  maxSmokes = 0,
  smokeSeconds = 0;
const qualities: Record<string, number> = {};
for (let i = 0; i < 900; i++) {
  players.forEach((p, n) => {
    p.input.fire = true;
    p.input.aim = true;
    p.input.slot = p.guns.primary.ammo + p.guns.primary.reserve > 0 ? 1 : 2;
    const target = w.enemies[(n * 7) % w.enemies.length];
    p.input.angle = Math.atan2(target.y - p.y, target.x - p.x);
    if (n === 0 && i >= 60 && i <= 120) {
      p.input.slot = 3;
      p.input.fire = i > 75;
      p.input.targetX = p.x + 150;
      p.input.targetY = p.y;
    }
    p.input.dx = Math.cos(i * 0.03 + n);
    p.input.dy = Math.sin(i * 0.03 + n);
  });
  const last = w.eventId;
  const before = performance.now();
  tick(w, 1 / 30);
  ticks.push(performance.now() - before);
  maxProjectiles = Math.max(maxProjectiles, w.projectiles.length);
  maxSmokes = Math.max(maxSmokes, w.map.smokes?.length ?? 0);
  if (w.map.smokes?.length) smokeSeconds += 1 / 30;
  for (const e of w.events.filter((e) => e.id > last && e.quality))
    qualities[e.quality!] = (qualities[e.quality!] ?? 0) + 1;
  if (i % 2 === 0) {
    const publicWorld = visibleWorld(w),
      next = packRoom(
        { code: "STRESS", players: publicWorld.players, world: publicWorld },
        cursor,
      );
    cursor = next.cursor;
    bytes.push(Buffer.byteLength(JSON.stringify(next.room)));
  }
  services.push(performance.now() - before);
}
const stats = (a: number[]) => {
  a.sort((a, b) => a - b);
  return {
    mean: a.reduce((n, v) => n + v, 0) / a.length,
    p50: a[Math.floor(a.length * 0.5)],
    p95: a[Math.floor(a.length * 0.95)],
    p99: a[Math.floor(a.length * 0.99)],
    max: Math.max(...a),
  };
};
const report = {
  maxProjectiles,
  maxSmokes,
  smokeSeconds,
  qualities,
  equipment: players.map((p) => ({
    primary: p.primary,
    guns: p.guns,
    consumable: p.consumable,
    count: p.consumableCount,
  })),
  fixture: `V4.1 additional AP/parts/smoke stress. Deliberate${actorLimit}-high-HP-enemies to sustain damage processing,4 high-health scripted targets,${process.env.QA_STRESS_TERRAIN ? "actual Barren Frontier obstacles" : "open terrain"},alert4,30 simulated seconds; exceeds normal admission budgets; not gameplay/difficulty evidence`,
  ticks: stats(ticks),
  tickPlusSnapshot: stats(services),
  snapshotBytes: stats(bytes),
  budget: forceBudget(w),
  heapMiB: process.memoryUsage().heapUsed / 1024 / 1024,
  rssMiB: process.memoryUsage().rss / 1024 / 1024,
};
writeFileSync(
  output +
    (process.env.QA_STRESS_TERRAIN
      ? "/server-terrain-stress.json"
      : "/server-stress.json"),
  JSON.stringify(report, null, 2),
);
console.log(report);
