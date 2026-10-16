import {
  createWorld,
  makePlayer,
  spawnEnemy,
  tick,
} from "../src/game/simulation";
import { operationOptions, type MissionId } from "../src/shared/missions";
import { ENEMIES, type EnemyKind, type Vec } from "../src/shared/data";
import { movementBlocked } from "../src/game/map";
import { enemyRadius } from "../src/game/armor";
import { visibleWorld } from "../src/server/visibility";
import { packRoom, type StreamCursor } from "../src/shared/snapshot";
import { navigationStats } from "../src/game/navigation";
import { mkdirSync, writeFileSync } from "node:fs";
const out = process.env.QA_OUTPUT || "docs/v4.2/performance/operational-server";
mkdirSync(out, { recursive: true });
const stats = (a: number[]) => {
  a.sort((a, b) => a - b);
  return {
    mean: a.reduce((n, v) => n + v, 0) / a.length,
    p95: a[Math.floor(a.length * 0.95)],
    max: Math.max(...a),
  };
};
const rows = [];
for (const [mission, profile] of [
  ["blitz", "standard"],
  ["survey", "expanded"],
] as const)
  for (const actors of [20, 30, 64]) {
    const players = Array.from({ length: 4 }, (_, i) =>
      makePlayer("p" + i, "PERF"),
    );
    const before = performance.now(),
      w = createWorld(
        "perf-" + mission,
        42,
        players,
        10,
        "blackout",
        operationOptions(mission, profile),
      ),
      generationMs = performance.now() - before;
    // Explicit load fixture. No terrain deletion. Large HP prevents a scripted target death from ending measurement.
    w.enemies = [];
    w.squads = {};
    w.director.next = 1e8;
    for (const s of w.map.sources) s.disabled = true;
    for (const d of w.map.installations) d.hp = d.maxHp = 1e9;
    w.alertState.level = 4;
    w.alertState.heat = 130;
    const anchor = w.map.zones[0].entry;
    players.forEach((p, i) => {
      p.x = anchor.x + i * 15;
      p.y = anchor.y;
      p.hp = 1e6;
    });
    for (let i = 0; i < 4000 && w.enemies.length < actors; i++) {
      const kind = (Object.keys(ENEMIES) as EnemyKind[])[i % 7],
        a = i * 2.399,
        r = 180 + (i % 9) * 60;
      const pos = {
        x: anchor.x + Math.cos(a) * r,
        y: anchor.y + Math.sin(a) * r,
      };
      if (!movementBlocked(pos, w.map, enemyRadius(kind)))
        spawnEnemy(w, pos, kind);
    }
    if (w.enemies.length !== actors) throw Error("Could not place load actors");
    const ticks: number[] = [],
      service: number[] = [],
      bytes: number[] = [];
    let cursor: StreamCursor | undefined;
    for (let i = 0; i < 900; i++) {
      players.forEach((p, n) => {
        p.input.dx = Math.cos(i * 0.03 + n);
        p.input.dy = Math.sin(i * 0.03 + n);
      });
      const t = performance.now();
      tick(w, 1 / 30);
      ticks.push(performance.now() - t);
      if (i % 2 === 0) {
        const v = visibleWorld(w),
          q = packRoom({ code: "PERF", players: v.players, world: v }, cursor);
        cursor = q.cursor;
        bytes.push(Buffer.byteLength(JSON.stringify(q.room)));
      }
      service.push(performance.now() - t);
    }
    if (w.time < 29.99 || w.mission.stage === "failed")
      throw Error("Performance fixture ended early; invalid measurement");
    rows.push({
      mission,
      profile,
      actors,
      generationMs,
      tickMs: stats(ticks),
      tickPlusSnapshotMs: stats(service),
      initialBytes: bytes[0],
      deltaSnapshotBytes: stats(bytes.slice(1)),
      approxBytesPerSecond: stats(bytes.slice(1)).mean * 15,
      heapMiB: process.memoryUsage().heapUsed / 1048576,
      rssMiB: process.memoryUsage().rss / 1048576,
      navigation: navigationStats(w.map),
      actualEnemies: w.enemies.length,
      peakActors: w.metrics.peakActors,
      simulatedSeconds: w.time,
      missionStage: w.mission.stage,
    });
    console.log("SERVER PERF", rows.at(-1));
    writeFileSync(
      out + "/server.json",
      JSON.stringify(
        {
          fixture:
            "Actual standard/expanded geometry,4high-health scripted moving targets,protected work facilities,20/30nearby mixed enemies and64extreme overload,30simulated seconds,alert4; not gameplay evidence; director admissions disabled to hold load",
          rows,
        },
        null,
        2,
      ),
    );
  }
