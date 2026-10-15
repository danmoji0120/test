import type { World, GameMap, Objective } from "../shared/data";
import { distance } from "./map";
import { lineOfSight, squadSees } from "./visibility";
import { raiseAlert } from "./alert";
import { event } from "./simulation";
export function objectives(map: GameMap): Objective[] {
  return [
    ...map.installations.map((d) => ({
      id: d.id,
      kind: d.kind as "generator" | "comms" | "outpost" | "barracks",
      label:
        d.kind === "generator"
          ? "핵심 발전기 " + (d.id.endsWith("0") ? "A" : "B")
          : d.kind === "comms"
            ? "통신탑 파괴"
            : d.kind === "barracks"
              ? "중장비 정비 병영 파괴"
              : "전초기지 무력화",
      position: { x: d.x, y: d.y },
      optional: d.kind !== "generator",
      state: "available" as const,
      progress: 0,
      total: d.maxHp,
      reward: d.kind === "generator" ? 100 : 120,
      discovered: d.kind === "generator",
    })),
    {
      id: "intel",
      kind: "intel",
      label: "기밀 자료 회수",
      position: { ...map.intel },
      optional: true,
      state: "available",
      progress: 0,
      total: 3,
      reward: 160,
      discovered: false,
    },
  ];
}
export function tickObjectives(w: World, dt: number) {
  for (const o of w.mission.objectives) {
    if (squadSees(w, o.position)) o.discovered = true;
    if (o.state === "complete") continue;
    if (o.kind === "intel") {
      const near = w.players.some(
        (p) =>
          p.connected &&
          !p.down &&
          p.input.interact &&
          distance(p, o.position) < 90 &&
          lineOfSight(p, o.position, w.map),
      );
      if (near) {
        o.state = "active";
        o.progress = Math.min(o.total, o.progress + dt);
      } else if (o.progress > 0)
        o.progress = Math.max(0, o.progress - dt * 0.25);
      if (o.progress >= o.total) {
        o.state = "complete";
        w.metrics.objectiveOrder.push(o.id);
        w.mission.intel = true;
        event(w, { type: "supply", x: o.position.x, y: o.position.y });
        for (const other of w.mission.objectives)
          if (other.kind === "outpost") other.discovered = true;
      }
    } else {
      const d = w.map.installations.find((d) => d.id === o.id)!;
      o.progress = d.maxHp - d.hp;
      if (d.hp <= 0) {
        o.state = "complete";
        w.metrics.objectiveOrder.push(o.id);
        raiseAlert(
          w,
          o.kind === "generator" ? 35 : 18,
          o.kind === "generator"
            ? "발전기 파괴"
            : o.kind === "comms"
              ? "통신 시설 파괴"
              : "전초기지 파괴",
          d,
          o.kind === "generator" ? 2 : 1,
        );
      } else if (o.progress > 0) o.state = "active";
    }
  }
  w.mission.intelProgress = w.mission.objectives.find(
    (o) => o.kind === "intel",
  )!.progress;
  if (
    w.mission.stage === "recon" &&
    (w.alertState.level > 0 || w.mission.objectives.some((o) => o.progress > 0))
  )
    w.mission.stage = "operate";
  if (
    w.mission.objectives
      .filter((o) => !o.optional)
      .every((o) => o.state === "complete") &&
    w.mission.extraction.state === "locked"
  ) {
    w.metrics.primaryAt = w.time;
    w.mission.extraction.state = "available";
    w.mission.stage = "operate";
  }
}
