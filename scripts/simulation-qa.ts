import { createWorld, makePlayer, tick } from "../src/game/simulation";
import { Pilot } from "./bot";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
const report: any[] = [];
for (const count of [1, 2, 4])
  for (const seed of [7, 42, 103]) {
    const players = Array.from({ length: count }, (_, i) => {
        const p = makePlayer("p" + i, "Pilot " + i);
        p.character = i % 2 ? "luna" : "aria";
        return p;
      }),
      w = createWorld(`qa-${count}-${seed}`, seed, players),
      bots = players.map(() => new Pilot());
    const start = performance.now();
    for (
      let step = 0;
      step < 27001 && !["success", "failed"].includes(w.mission.stage);
      step++
    ) {
      players.forEach((p, i) => (p.input = bots[i].input(w, p, i)));
      tick(w, 1 / 30);
    }
    const row = {
      count,
      seed,
      result: w.mission.stage,
      elapsed: Math.round(w.mission.elapsed * 10) / 10,
      kills: players.reduce((s, p) => s + p.kills, 0),
      hp: players.map((p) => Math.round(p.hp)),
      cpuMs: Math.round(performance.now() - start),
    };
    report.push(row);
    console.log(row);
  }
writeFileSync(
  (process.env.QA_REPORT_DIR || "docs") + "/simulation-qa.json",
  JSON.stringify(report, null, 2),
);
