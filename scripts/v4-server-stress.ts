import {
  createWorld,
  makePlayer,
  spawnEnemy,
  tick,
} from "../src/game/simulation";
import { visibleWorld } from "../src/server/visibility";
import { packRoom, type StreamCursor } from "../src/shared/snapshot";
import { forceBudget } from "../src/game/budgets";
import { ENEMIES, type EnemyKind } from "../src/shared/data";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
const output = process.env.QA_REPORT_DIR || "docs/v4/performance";
mkdirSync(output, { recursive: true });
const players = Array.from({ length: 4 }, (_, i) =>
    makePlayer("p" + i, "STRESS"),
  ),
  w = createWorld("synthetic-server-stress", 42, players, 10);
w.map.obstacles = [];
w.enemies = [];
w.squads = {};
w.director.next = 1e8;
w.alertState.heat = 130;
w.alertState.level = 4;
players.forEach((p, i) =>
  Object.assign(p, { x: 2900 + i * 50, y: 2050, hp: 1e6 }),
);
for (let i = 0; i < 64; i++) {
  const kind = (Object.keys(ENEMIES) as EnemyKind[])[i % 7],
    a = i * 2.399,
    r = 300 + (i % 8) * 90;
  spawnEnemy(w, { x: 3000 + Math.cos(a) * r, y: 2100 + Math.sin(a) * r }, kind);
}
const ticks: number[] = [],
  services: number[] = [],
  bytes: number[] = [];
let cursor: StreamCursor | undefined;
for (let i = 0; i < 900; i++) {
  players.forEach((p, n) => {
    p.input.dx = Math.cos(i * 0.03 + n);
    p.input.dy = Math.sin(i * 0.03 + n);
  });
  const before = performance.now();
  tick(w, 1 / 30);
  ticks.push(performance.now() - before);
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
  fixture:
    "Deliberate worst-case64 simultaneously detailed mixed actors,4 high-health scripted targets,open terrain,alert4,30 simulated seconds; exceeds normal admission budgets; not gameplay/difficulty evidence",
  ticks: stats(ticks),
  tickPlusSnapshot: stats(services),
  snapshotBytes: stats(bytes),
  budget: forceBudget(w),
  heapMiB: process.memoryUsage().heapUsed / 1024 / 1024,
  rssMiB: process.memoryUsage().rss / 1024 / 1024,
};
writeFileSync(output + "/server-stress.json", JSON.stringify(report, null, 2));
console.log(report);
