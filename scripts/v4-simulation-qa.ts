import { createWorld, makePlayer, tick } from "../src/game/simulation";
import { visibleWorld } from "../src/server/visibility";
import { packRoom, type StreamCursor } from "../src/shared/snapshot";
import { ENEMIES, type World } from "../src/shared/data";
import { forceBudget, MAX_ACTORS } from "../src/game/budgets";
import { distance } from "../src/game/map";
import { Pilot } from "./bot";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
const output = process.env.QA_REPORT_DIR || "docs/v4/simulation";
mkdirSync(output, { recursive: true });
const levels = (process.env.QA_LEVELS || "1,3,5,7,8,10").split(",").map(Number),
  seeds = (process.env.QA_SEEDS || "7,42,103").split(",").map(Number),
  counts = (process.env.QA_COUNTS || "1,2,4").split(",").map(Number);
type Scenario = {
  level: number;
  seed: number;
  count: number;
  mode: "primary" | "all" | "blind" | "blind-all" | "evade" | "hold";
};
const scenarios: Scenario[] = levels.flatMap((level) =>
  counts.flatMap((count) =>
    seeds.map((seed) => ({
      level,
      count,
      seed,
      mode: (process.env.QA_MODE || "primary") as Scenario["mode"],
    })),
  ),
);
if (process.env.QA_EXTRA !== "0")
  for (const mode of ["all", "blind", "blind-all", "evade", "hold"] as const)
    for (const seed of seeds)
      scenarios.push({ level: 10, count: mode === "all" ? 4 : 1, seed, mode });
const report: any[] = [];
for (const scenario of scenarios) {
  const { level, seed, count, mode } = scenario,
    players = Array.from({ length: count }, (_, i) => {
      const p = makePlayer("p" + i, "Pilot " + i);
      p.character = i % 2 ? "luna" : "aria";
      p.weapon = i % 3 === 1 ? "smg" : "ar";
      p.tactical =
        mode.startsWith("blind") || mode === "hold" ? "ammo" : "launcher";
      return p;
    }),
    w = createWorld("v4-" + JSON.stringify(scenario), seed, players, level),
    pilots = players.map(() => {
      const p = new Pilot();
      p.strategy = mode.includes("all")
        ? "all"
        : mode === "evade"
          ? "evade"
          : "primary";
      p.reckless = mode.startsWith("blind");
      p.avoidArmor = mode === "evade";
      return p;
    });
  const times: number[] = [],
    bytes: number[] = [],
    start = performance.now();
  let cursor: StreamCursor | undefined,
    initialBytes = 0,
    maxAlert = 0,
    downs = 0,
    hurt = 0,
    rockets = 0,
    lastHP = players.map((p) => p.hp),
    lastR = players.map((p) => (p.rockets ?? 0)),
    maxBudget = forceBudget(w),
    lastPeak = 0;
  const maxSeconds = Number(process.env.QA_MAX_SECONDS || 600);
  for (
    let step = 0;
    step < maxSeconds * 30 && !["success", "failed"].includes(w.mission.stage);
    step++
  ) {
    if (step % 3 === 0) {
      const view = visibleWorld(w) as unknown as World;
      players.forEach((p, i) => {
        const input = pilots[i].input(view, p, i);
        input.dx = Math.abs(input.dx) > 0.1 ? Math.sign(input.dx) : 0;
        input.dy = Math.abs(input.dy) > 0.1 ? Math.sign(input.dy) : 0;
        if (
          mode === "hold" &&
          w.mission.objectives.some(
            (o) => !o.optional && o.state === "complete",
          )
        ) {
          input.dx = 0;
          input.dy = 0;
          input.fire = true;
          input.sprint = false;
          input.interact = false;
          input.revive = false;
          input.tactical = false;
          if (!view.enemies.length) input.angle = step * 0.01;
        }
        p.input = input;
      });
    }
    if (step % 2 === 0) {
      const publicWorld = visibleWorld(w),
        next = packRoom(
          {
            code: "QA001",
            host: "p0",
            phase: "playing",
            seed,
            difficulty: level,
            contract: w.contract,
            players: publicWorld.players,
            world: publicWorld,
          },
          cursor,
        ),
        n = Buffer.byteLength(
          JSON.stringify({ type: "state", room: next.room }),
        );
      if (!cursor) initialBytes = n;
      else bytes.push(n);
      cursor = next.cursor;
    }
    const before = performance.now();
    tick(w, 1 / 30);
    times.push(performance.now() - before);
    maxAlert = Math.max(maxAlert, w.alertState.level);
    players.forEach((p, i) => {
      if (p.hp < lastHP[i]) {
        hurt += lastHP[i] - p.hp;
        if (p.down) downs++;
      }
      if ((p.rockets ?? 0) < lastR[i]) rockets += lastR[i] - (p.rockets ?? 0);
      lastHP[i] = p.hp;
      lastR[i] = (p.rockets ?? 0);
    });
    if (w.enemies.length > lastPeak) {
      lastPeak = w.enemies.length;
      maxBudget = forceBudget(w);
    }
  }
  const provenance = w.trajectories.map((t) => {
    const source = w.map.sources.find((s) => s.id === t.source)!,
      req = w.reinforcements.find((r) => r.id === t.request),
      kind = req?.roster?.[req.members.indexOf(t.enemy)] ?? "rifle",
      validOrigin =
        source.kind === "external"
          ? t.born.x < 0 ||
            t.born.x > w.map.width ||
            t.born.y < 0 ||
            t.born.y > w.map.height
          : distance(t.born, source) < 130,
      continuous = t.points.every(
        (p, i) =>
          i === 0 ||
          distance(p, t.points[i - 1]) <=
            Math.max(270, ENEMIES[kind].speed) * (p.at - t.points[i - 1].at) +
              2,
      );
    return {
      enemy: t.enemy,
      source: t.source,
      request: t.request,
      kind,
      validOrigin,
      continuous,
      samples: t.points.length,
      route: !!req?.path.length,
    };
  });
  if (provenance.some((t) => !t.validOrigin || !t.continuous || !t.route))
    throw Error(
      "Invalid physical dispatch continuity: " + JSON.stringify(scenario),
    );
  if (w.metrics.peakActors > MAX_ACTORS) throw Error("Regional bound violated");
  times.sort((a, b) => a - b);
  bytes.sort((a, b) => a - b);
  const mean = (a: number[]) =>
      a.reduce((n, v) => n + v, 0) / Math.max(1, a.length),
    percent = (a: number[], p: number) => a[Math.floor(a.length * p)];
  const row = {
    ...scenario,
    finalPlayers: players.map((p, i) => ({
      x: p.x,
      y: p.y,
      hp: p.hp,
      input: p.input,
      goal: pilots[i].goal,
      path: pilots[i].path.slice(0, 6),
    })),
    budgetSeconds: maxSeconds,
    result: w.mission.stage,
    elapsed: w.time,
    firstContact: w.metrics.firstContact,
    combatSeconds: w.metrics.combatSeconds,
    primaryAt: w.metrics.primaryAt,
    maxAlert,
    downs,
    hurt,
    rockets,
    kills: players.reduce((n, p) => n + p.kills, 0),
    remaining: w.enemies.length,
    remainingKinds: w.enemies.reduce(
      (a, e) => ((a[e.kind] = (a[e.kind] ?? 0) + 1), a),
      {} as Record<string, number>,
    ),
    peak: w.metrics.peakActors,
    maxBudget,
    objectives: w.mission.objectives.map((o) => ({
      id: o.id,
      kind: o.kind,
      state: o.state,
    })),
    requests: w.reinforcements,
    provenance,
    responseLog: w.responseLog,
    cpuMs: performance.now() - start,
    tickMs: {
      mean: mean(times),
      p50: percent(times, 0.5),
      p95: percent(times, 0.95),
      p99: percent(times, 0.99),
      max: Math.max(...times),
    },
    snapshotBytes: {
      initial: initialBytes,
      mean: mean(bytes),
      p95: percent(bytes, 0.95),
      bytesPerSecond: bytes.reduce((n, v) => n + v, 0) / Math.max(1, w.time),
    },
  };
  report.push(row);
  console.log(
    JSON.stringify({
      scenario,
      result: row.result,
      seconds: Math.round(w.time),
      maxAlert,
      downs,
      hurt: Math.round(hurt),
      rockets,
      departures: row.requests.filter((r) => r.departed >= 0).length,
      peak: row.peak,
      p95: row.tickMs.p95,
    }),
  );
  writeFileSync(
    output + "/matrix.json",
    JSON.stringify(
      {
        method:
          "30Hz authoritative simulation; public fog-filtered observations and ordinary discrete WASD at10Hz; no player teleport, scripted damage or forced defeat; input automation is not human fun/difficulty approval. Unfinished rows retain their actual stage at the recorded budgetSeconds, without a forced defeat.",
        report,
      },
      null,
      2,
    ),
  );
}
