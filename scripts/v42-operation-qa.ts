import { createWorld, makePlayer, tick } from "../src/game/simulation";
import {
  MISSIONS,
  operationOptions,
  type MissionId,
} from "../src/shared/missions";
import { visibleWorld } from "../src/server/visibility";
import {
  ENEMIES,
  type World,
  type PrimaryId,
  type ConsumableId,
} from "../src/shared/data";
import { distance } from "../src/game/map";
import { Pilot } from "./bot";
import { mkdirSync, writeFileSync } from "node:fs";
const output = process.env.QA_OUTPUT ?? "docs/v4.2/operations";
mkdirSync(output, { recursive: true });
const missions = (
    process.env.QA_MISSIONS ?? "launch,reactor,transfer,survey,blitz,defense"
  ).split(",") as MissionId[],
  counts = (process.env.QA_COUNTS ?? "1,2,4").split(",").map(Number),
  seeds = (process.env.QA_SEEDS ?? "7,42,103").split(",").map(Number),
  level = Number(process.env.QA_DIFFICULTY ?? 1),
  budget = Number(process.env.QA_MAX_SECONDS ?? 600);
const report: any[] = [];
for (const mission of missions)
  for (const count of counts)
    for (const seed of seeds) {
      const players = Array.from({ length: count }, (_, i) => {
        const p = makePlayer("p" + i, "Pilot" + i);
        p.character = i % 2 ? "luna" : "aria";
        p.weapon = (["ar", "smg", "sg", "at"] as PrimaryId[])[i];
        p.consumable = (
          ["antiarmor", "smoke", "medical", "frag"] as ConsumableId[]
        )[i];
        return p;
      });
      const w = createWorld(
        "operation-" + mission + "-" + seed,
        seed,
        players,
        level,
        "blackout",
        operationOptions(mission),
      );
      const pilots = players.map(() => {
        const p = new Pilot();
        p.strategy =
          process.env.QA_STRATEGY === "all"
            ? "all"
            : process.env.QA_STRATEGY === "evade"
              ? "evade"
              : "primary";
        p.avoidArmor = process.env.QA_STRATEGY === "evade";
        p.reverse = process.env.QA_REVERSE === "1";
        p.reckless = process.env.QA_RECKLESS === "1";
        p.splitTargets = process.env.QA_SPLIT === "1";
        p.protectTarget = process.env.QA_PROTECT === "1";
        return p;
      });
      const phases: any[] = [],
        ticks: number[] = [];
      let signature = "",
        lastCargo = w.mission.cargo ? { ...w.mission.cargo } : undefined,
        cargoViolations = 0;
      for (
        let step = 0;
        step < budget * 30 && !["success", "failed"].includes(w.mission.stage);
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
        const t = performance.now();
        tick(w, 1 / 30);
        ticks.push(performance.now() - t);
        const c = w.mission.cargo;
        if (
          c &&
          lastCargo &&
          Math.hypot(c.x - lastCargo.x, c.y - lastCargo.y) >
            (c.carrier !== lastCargo.carrier ? 90 : 17)
        )
          cargoViolations++;
        if (c) lastCargo = { ...c };
        const sig = JSON.stringify(
          w.mission.objectives.map((o) => [o.id, o.state, o.phase]),
        );
        if (sig !== signature) {
          signature = sig;
          phases.push({
            at: w.time,
            nodes: w.mission.objectives.map((o) => ({
              id: o.id,
              state: o.state,
              phase: o.phase,
              progress: o.progress,
            })),
            cargo: w.mission.cargo ? { ...w.mission.cargo } : undefined,
          });
        }
      }
      ticks.sort((a, b) => a - b);
      const provenance = w.trajectories.map((t) => {
        const source = w.map.sources.find((s) => s.id === t.source);
        const req = w.reinforcements.find((r) => r.id === t.request);
        const kind = req?.roster?.[req.members.indexOf(t.enemy)] ?? "rifle";
        return {
          enemy: t.enemy,
          source: t.source,
          request: t.request,
          validOrigin:
            !!source &&
            (source.kind === "external"
              ? t.born.x < 0 ||
                t.born.x > w.map.width ||
                t.born.y < 0 ||
                t.born.y > w.map.height
              : distance(t.born, source) < 130),
          route: !!req?.path.length,
          continuous: t.points.every(
            (p, i) =>
              i === 0 ||
              distance(p, t.points[i - 1]) <=
                Math.max(270, ENEMIES[kind].speed) *
                  (p.at - t.points[i - 1].at) +
                  2,
          ),
          samples: t.points.length,
        };
      });
      if (
        cargoViolations ||
        provenance.some((t) => !t.validOrigin || !t.route || !t.continuous)
      )
        throw Error(
          "Physical continuity violation: " +
            JSON.stringify({
              mission,
              count,
              seed,
              provenance,
              cargoViolations,
            }),
        );
      const row = {
        mission,
        count,
        seed,
        level,
        strategy: pilots[0].strategy,
        reverse: pilots[0].reverse,
        budget,
        result: w.mission.stage,
        reason: w.mission.reason,
        outcome: w.mission.outcome,
        seconds: w.time,
        firstContact: w.metrics.firstContact,
        combatSeconds: w.metrics.combatSeconds,
        objectiveOrder: w.metrics.objectiveOrder,
        phases,
        cargoViolations,
        provenance,
        remainingEnemies: w.enemies.length,
        requests: w.reinforcements,
        trajectories: w.trajectories,
        finalPlayers: players.map((p, i) => ({
          id: p.id,
          hp: p.hp,
          x: p.x,
          y: p.y,
          carrying: p.carrying,
          ammo: p.guns,
          goal: pilots[i].goal,
          path: pilots[i].path.slice(0, 4),
        })),
        tickMs: {
          p50: ticks[Math.floor(ticks.length * 0.5)],
          p95: ticks[Math.floor(ticks.length * 0.95)],
          max: Math.max(...ticks),
        },
      };
      report.push(row);
      console.log(
        JSON.stringify({
          mission,
          count,
          seed,
          result: row.result,
          seconds: Math.round(w.time),
          order: row.objectiveOrder,
          reason: row.reason,
          cargoViolations,
        }),
      );
      writeFileSync(
        output + "/operations.json",
        JSON.stringify(
          {
            method:
              "Actual authoritative30Hz, ordinary discrete10Hz WASD inputs, public fog-filtered state; full public terrain known to navigation; no teleport/scripted damage/forced defeat; rule fixtures are separate",
            report,
          },
          null,
          2,
        ),
      );
    }
