import { createWorld, makePlayer, tick } from "../src/game/simulation";
import {
  MISSIONS,
  operationOptions,
  type MissionId,
} from "../src/shared/missions";
import { visibleWorld } from "../src/server/visibility";
import type { World, PrimaryId, ConsumableId } from "../src/shared/data";
import { Pilot } from "./bot";
import { mkdirSync, writeFileSync } from "node:fs";
const output = process.env.QA_OUTPUT || "docs/v4.2/stability";
mkdirSync(output, { recursive: true });
const missions = Object.keys(MISSIONS) as MissionId[],
  rows: any[] = [];
const gc = (globalThis as any).gc as (() => void) | undefined;
function operation(run: number) {
  const mission = missions[run % 6],
    seed = [7, 42, 103, 211][Math.floor(run / 6) % 4];
  const players = Array.from({ length: 4 }, (_, i) => {
    const p = makePlayer("p" + i, "REPEAT");
    p.weapon = (["ar", "smg", "sg", "at"] as PrimaryId[])[i];
    p.consumable = (
      ["antiarmor", "smoke", "medical", "frag"] as ConsumableId[]
    )[i];
    return p;
  });
  const w = createWorld(
    "repeat-" + run,
    seed,
    players,
    1,
    "blackout",
    operationOptions(mission),
  );
  const pilots = players.map(() => new Pilot());
  let maxEvents = 0,
    maxActors = 0;
  for (
    let step = 0;
    step < 600 * 30 && !["success", "failed"].includes(w.mission.stage);
    step++
  ) {
    if (step % 3 === 0) {
      const view = visibleWorld(w) as unknown as World;
      players.forEach((p, i) => {
        const input = pilots[i].input(view, p, i);
        input.dx = Math.abs(input.dx) > 0.1 ? Math.sign(input.dx) : 0;
        input.dy = Math.abs(input.dy) > 0.1 ? Math.sign(input.dy) : 0;
        p.input = input;
      });
    }
    tick(w, 1 / 30);
    maxEvents = Math.max(maxEvents, w.events.length);
    maxActors = Math.max(maxActors, w.enemies.length);
  }
  if (!["success", "failed"].includes(w.mission.stage))
    throw Error("Unfinished stability case " + run);
  return {
    run,
    mission,
    seed,
    result: w.mission.stage,
    seconds: w.time,
    maxEvents,
    maxActors,
  };
}
gc?.();
const initialHeapMiB = process.memoryUsage().heapUsed / 1048576;
for (let run = 0; run < 24; run++) {
  const row = operation(run);
  gc?.();
  rows.push({
    ...row,
    heapMiB: process.memoryUsage().heapUsed / 1048576,
    rssMiB: process.memoryUsage().rss / 1048576,
  });
  console.log("REPEAT", rows.at(-1));
  writeFileSync(
    output + "/stability.json",
    JSON.stringify(
      {
        method:
          "24sequential authoritative operations,4mixed-loadout discrete-input pilots,6missions,4Seeds,explicitGC after world leaves scope; raw entities not retained; no gameplay state injection",
        gcAvailable: !!gc,
        initialHeapMiB,
        rows,
      },
      null,
      2,
    ),
  );
}
