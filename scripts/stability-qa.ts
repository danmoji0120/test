import {
  createWorld,
  makePlayer,
  tick,
  spawnEnemy,
} from "../src/game/simulation";
import { visibleWorld } from "../src/server/visibility";
import type { World } from "../src/shared/data";
import { Pilot } from "./bot";
import { writeFileSync, mkdirSync } from "node:fs";
const output = process.env.QA_REPORT_DIR || "docs/v3/final";
mkdirSync(output, { recursive: true });
const gc = (globalThis as any).gc as (() => void) | undefined;
const heap: number[] = [];
const times: number[] = [];
let successes = 0,
  failures = 0,
  maxEvents = 0,
  maxEnemies = 0;
const runs = Number(process.env.QA_RUNS || 40);
for (let run = 0; run < runs; run++) {
  const w = createWorld(
      "stability-" + run,
      process.env.QA_V4 ? [7, 42, 103, 211][run % 4] : run % 10,
      wPlayers(),
      process.env.QA_V4 ? [1, 3, 5, 7, 8, 10][run % 6] : 3,
    ),
    pilots = w.players.map(() => new Pilot());
  for (
    let t = 0;
    t < 27001 && !["success", "failed"].includes(w.mission.stage);
    t++
  ) {
    if (t % 3 === 0) {
      const publicWorld = visibleWorld(w) as unknown as World;
      w.players.forEach(
        (p, i) => (p.input = pilots[i].input(publicWorld, p, i)),
      );
    }
    const before = performance.now();
    tick(w, 1 / 30);
    if (t % 15 === 0) times.push(performance.now() - before);
    maxEvents = Math.max(maxEvents, w.events.length);
    maxEnemies = Math.max(maxEnemies, w.enemies.length);
  }
  if (w.mission.stage === "success") successes++;
  else if (w.mission.stage === "failed") failures++;
  else throw Error("Unfinished mission");
  if (run % 4 === 3) {
    gc?.();
    heap.push(process.memoryUsage().heapUsed);
    console.log(
      "Completed",
      run + 1,
      "heap MiB",
      Math.round(heap.at(-1)! / 1024 / 1024),
    );
  }
}
function wPlayers() {
  return Array.from({ length: 4 }, (_, i) => {
    const p = makePlayer("p" + i, "Pilot");
    if (process.env.QA_V4) p.tactical = "launcher";
    return p;
  });
}
times.sort((a, b) => a - b);
const report = {
  runs,
  mode: process.env.QA_V4
    ? "mixed V4 levels1/3/5/7/8/10, seeded prepared4-input pilots"
    : "V3 regression",
  successes,
  failures,
  maxEvents,
  maxEnemies,
  gcAvailable: !!gc,
  heapMiB: heap.map((n) => Math.round((n / 1024 / 1024) * 100) / 100),
  serverTickMs: {
    samples: times.length,
    median: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)],
  },
};
writeFileSync(output + "/stability-qa.json", JSON.stringify(report, null, 2));
console.log(report);
