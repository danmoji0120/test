import {
  createWorld,
  makePlayer,
  tick,
  spawnEnemy,
} from "../src/game/simulation";
import { Pilot } from "./bot";
import { writeFileSync } from "node:fs";
const gc = (globalThis as any).gc as (() => void) | undefined;
const heap: number[] = [];
const times: number[] = [];
let successes = 0,
  failures = 0,
  maxEvents = 0,
  maxEnemies = 0;
for (let run = 0; run < 40; run++) {
  const w = createWorld("stability-" + run, run % 10, wPlayers()),
    pilots = w.players.map(() => new Pilot());
  for (
    let t = 0;
    t < 27001 && !["success", "failed"].includes(w.mission.stage);
    t++
  ) {
    w.players.forEach((p, i) => (p.input = pilots[i].input(w, p, i)));
    const before = performance.now();
    tick(w, 1 / 30);
    if (t % 15 === 0) times.push(performance.now() - before);
    maxEvents = Math.max(maxEvents, w.events.length);
    maxEnemies = Math.max(maxEnemies, w.enemies.length);
  }
  if (w.mission.stage === "success") successes++;
  else if (w.mission.stage === "failed") failures++;
  else throw Error("Unfinished mission");
  if (run % 5 === 4) {
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
  return Array.from({ length: 4 }, (_, i) => makePlayer("p" + i, "Pilot"));
}
times.sort((a, b) => a - b);
const report = {
  runs: 40,
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
writeFileSync(
  (process.env.QA_REPORT_DIR || "docs") + "/stability-qa.json",
  JSON.stringify(report, null, 2),
);
console.log(report);
