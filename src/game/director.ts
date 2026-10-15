import type { World, Vec, Reinforcement } from "../shared/data";
import { difficulty } from "../shared/difficulty";
import {
  requestSupport,
  tickReinforcements,
  cancelRequest,
} from "./reinforcements";
import { raiseAlert, audit } from "./alert";
import { distance, blocked } from "./map";
export function tickDirector(w: World, dt: number) {
  const comms = w.map.installations.some((d) => d.kind === "comms" && d.hp > 0),
    level = w.alertState.level,
    config = difficulty(w.difficulty, w.players.length);
  if (!comms && !w.director.commsDown) {
    w.director.commsDown = true;
    for (const r of w.reinforcements)
      if (w.map.sources.find((s) => s.id === r.sourceId)?.kind === "external")
        cancelRequest(w, r, "통신탑 파괴");
    audit(w, "communications", "광역 출동 준비 지연·현재 대기 요청 취소");
  }
  for (const call of w.supportSignals.splice(0))
    if (w.time - call.at < 20) {
      const r = requestSupport(w, call.id, call.target, call.squad);
      if (r) raiseAlert(w, 8, "지원 요청", call.target);
    }
  if (w.time >= w.director.next) {
    let target: Vec | undefined,
      patrol = false,
      task: Reinforcement["task"] = "assault";
    const intel = Object.values(w.squads)
        .filter((s) => s.lastSeen && w.time - s.observedAt < 25)
        .sort((a, b) => b.observedAt - a.observedAt)[0],
      turn = Math.floor(w.time / 12) % 3;
    if (w.mission.stage === "extract") {
      target = w.mission.extraction.site ?? undefined;
      task = turn === 1 ? "block" : "assault";
    } else if (intel && level >= 2) {
      target = { ...intel.lastSeen! };
      if (level >= 3 && turn === 1) {
        const road = w.map.roads
          .flatMap((r) => r.points)
          .filter(
            (p) => distance(p, target!) > 220 && distance(p, target!) < 900,
          )
          .sort((a, b) => distance(a, target!) - distance(b, target!))[0];
        if (road) {
          target = road;
          task = "block";
        }
      } else if (level >= 3 && turn === 2) {
        const site = w.map.zones
          .slice(0, 2)
          .filter(
            (z) =>
              w.map.installations.find((d) => d.id === "facility-" + z.id)
                ?.hp! > 0,
          )
          .sort(
            (a, b) => distance(a.center, target!) - distance(b.center, target!),
          )[0];
        if (site) {
          target = site.entry;
          task = "defend";
        }
      } else task = "search";
    } else if (level >= 3) {
      target = w.map.zones[Math.floor(w.time / 30) % 2].entry;
      task = "defend";
    } else if (w.time > config.patrolPeriod) {
      patrol = true;
      target =
        w.map.patrols[Math.floor(w.time / 90) % w.map.patrols.length]?.at(-1);
      task = "search";
    }
    if (target) {
      const heavy = level === 4 && w.difficulty >= 5;
      const r = requestSupport(
        w,
        "director-" + Math.floor(w.time / 8),
        target,
        "director",
        patrol
          ? w.map.sources.find(
              (s) =>
                s.kind === "external" &&
                !s.blocked &&
                !s.disabled &&
                s.cooldown <= 0,
            )?.id
          : undefined,
        { heavy, task },
      );
      if (heavy) {
        // A second road can carry a small infantry screen; it never appears at the destination.
        const other = requestSupport(
          w,
          "screen-" + Math.floor(w.time / 8),
          target,
          "director",
          undefined,
          { task: task === "defend" ? "block" : "search" },
        );
        if (!r && other)
          audit(
            w,
            "heavy-delayed",
            "중장비 출동지는 대기 중, 보병 대응은 계속",
          );
      }
    }
    const interval =
      w.mission.stage === "extract"
        ? Math.max(10, config.interval * 0.6)
        : config.interval * (level === 4 ? 0.55 : level === 3 ? 0.75 : 1);
    w.director.next = w.time + interval + (comms ? 0 : 25);
  }
  tickReinforcements(w, dt);
}
