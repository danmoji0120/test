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
const output = process.env.QA_REPORT_DIR || "docs/v4.1/stability";
mkdirSync(output, { recursive: true });
const gc = (globalThis as any).gc as (() => void) | undefined;
const heap: number[] = [];
const times: number[] = [];
let successes = 0,
  failures = 0,
  unfinished = 0,
  maxEvents = 0,
  maxEnemies = 0;
const runs = Number(process.env.QA_RUNS || 24);
const records: {
  run: number;
  seed: number;
  level: number;
  stage: string;
  seconds: number;
}[] = [];
for (let run = 0; run < runs; run++) {
  const w = createWorld(
      "stability-" + run,
      [7, 42, 103, 837261][run % 4],
      wPlayers(),
      [1, 3, 5, 7, 8, 10][run % 6],
    ),
    pilots = w.players.map(() => new Pilot());
  for (
    let t = 0;
    t < 10800 && !["success", "failed"].includes(w.mission.stage);
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
  else unfinished++;
  records.push({
    run,
    seed: w.map.seed,
    level: w.difficulty,
    stage: w.mission.stage,
    seconds: w.time,
  });
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
    p.weapon = (["ar", "smg", "sg", "at"] as const)[i];
    p.consumable = (["antiarmor", "smoke", "medical", "frag"] as const)[i];
    return p;
  });
}
times.sort((a, b) => a - b);
const report = {
  runs,
  mode: "V4.1 mixed finite three-slot loadouts, public actor observations,24 operations,360-second per-operation QA budget; no forced end state",
  unfinished,
  records,
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
