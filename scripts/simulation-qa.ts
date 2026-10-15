import { createWorld, makePlayer, tick } from "../src/game/simulation";
import { visibleWorld } from "../src/server/visibility";
import { packRoom, type StreamCursor } from "../src/shared/snapshot";
import type { World } from "../src/shared/data";
import { Pilot } from "./bot";
import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync } from "node:fs";
const output = process.env.QA_REPORT_DIR || "docs/v3/final";
mkdirSync(output, { recursive: true });
const scenarios = [1, 2, 4].flatMap((count) =>
  [7, 42, 103].map((seed) => ({
    count,
    seed,
    level: 3,
    strategy: "primary",
    fail: false,
    reverse: false,
  })),
);
scenarios.push({
  count: 4,
  seed: 42,
  level: 1,
  strategy: "all",
  fail: false,
  reverse: true,
});
for (const count of [1, 2, 4])
  scenarios.push({
    count,
    seed: 42,
    level: 3,
    strategy: "primary",
    fail: true,
    reverse: false,
  });
const report: any[] = [];
for (const scenario of scenarios) {
  const { count, seed, level, strategy, reverse, fail } = scenario;
  const players = Array.from({ length: count }, (_, i) => {
    const p = makePlayer("p" + i, "Pilot " + i);
    p.character = i % 2 ? "luna" : "aria";
    return p;
  });
  const w = createWorld(
    `qa-${count}-${seed}-${strategy}-${fail}`,
    seed,
    players,
    level,
  );
  const bots = players.map(() => {
    const b = new Pilot();
    b.strategy = strategy as Pilot["strategy"];
    b.reverse = reverse;
    return b;
  });
  const start = performance.now(),
    times: number[] = [],
    bytes: number[] = [];
  let cursor: StreamCursor | undefined,
    observed: World,
    initialBytes = 0;
  for (
    let step = 0;
    step < 27001 && !["success", "failed"].includes(w.mission.stage);
    step++
  ) {
    if (step % 3 === 0) {
      const publicWorld = visibleWorld(w);
      observed = publicWorld as unknown as World;
      players.forEach((p, i) => {
        const input = bots[i].input(observed, p, i);
        input.dx = Math.abs(input.dx) > 0.1 ? Math.sign(input.dx) : 0;
        input.dy = Math.abs(input.dy) > 0.1 ? Math.sign(input.dy) : 0;
        if (fail) {
          input.fire = false;
          input.revive = false;
          input.interact = false;
        }
        p.input = input;
      });
      if (step % 30 === 0) {
        const next = packRoom({ world: publicWorld }, cursor);
        const size = Buffer.byteLength(JSON.stringify(next.room));
        if (!cursor) initialBytes = size;
        else bytes.push(size);
        cursor = next.cursor;
      }
    }
    const before = performance.now();
    tick(w, 1 / 30);
    times.push(performance.now() - before);
  }
  times.sort((a, b) => a - b);
  bytes.sort((a, b) => a - b);
  const provenance = w.trajectories.map((t) => {
    const source = w.map.sources.find((s) => s.id === t.source)!;
    const request = w.reinforcements.find((r) => r.id === t.request);
    const validOrigin =
      source.kind === "external"
        ? t.born.x < 0 || t.born.x > w.map.width
        : Math.hypot(t.born.x - source.x, t.born.y - source.y) < 100;
    const continuous = t.points.every(
      (p, i) =>
        i === 0 ||
        Math.hypot(p.x - t.points[i - 1].x, p.y - t.points[i - 1].y) <=
          240 * (p.at - t.points[i - 1].at) + 12,
    );
    return {
      enemy: t.enemy,
      source: t.source,
      request: t.request,
      validOrigin,
      continuous,
      samples: t.points.length,
      plannedRoute: !!request?.path.length,
    };
  });
  if (
    provenance.some((t) => !t.validOrigin || !t.continuous || !t.plannedRoute)
  )
    throw Error("Dispatch provenance/continuity failed");
  const row = {
    ...scenario,
    result: w.mission.stage,
    elapsed: w.time,
    kills: players.reduce((n, p) => n + p.kills, 0),
    remaining: w.enemies.length,
    metrics: w.metrics,
    objectives: w.mission.objectives.map((o) => ({ id: o.id, state: o.state })),
    requests: w.reinforcements.map((r) => ({
      id: r.id,
      state: r.state,
      source: r.sourceId,
      requested: r.requested,
      departed: r.departed,
      arrived: r.arrived,
    })),
    provenance,
    cpuMs: performance.now() - start,
    tickMs: {
      median: times[Math.floor(times.length * 0.5)],
      p95: times[Math.floor(times.length * 0.95)],
      p99: times[Math.floor(times.length * 0.99)],
    },
    snapshotBytes: {
      initial: initialBytes,
      median: bytes[Math.floor(bytes.length * 0.5)],
      p95: bytes[Math.floor(bytes.length * 0.95)],
    },
  };
  report.push(row);
  console.log({
    count,
    seed,
    level,
    strategy,
    fail,
    result: row.result,
    seconds: Math.round(w.time),
    kills: row.kills,
    remaining: row.remaining,
  });
  writeFileSync(
    output + "/simulation-qa.json",
    JSON.stringify(
      {
        method:
          "sanitized team public state at 10Hz, discrete held WASD, ordinary authoritative input; not human play or browser rendering",
        report,
      },
      null,
      2,
    ),
  );
}
if (
  report.some((r) => (r.fail ? r.result !== "failed" : r.result !== "success"))
)
  process.exitCode = 1;
