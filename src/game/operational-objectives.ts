import type {
  World,
  GameMap,
  Objective,
  Installation,
  Player,
} from "../shared/data";
import { MISSIONS } from "../shared/missions";
import { workPoint } from "./operation-world";
import { distance, movementBlocked, invalidateNavigation } from "./map";
import { squadSees, lineOfSight } from "./visibility";
import {
  updateGraph,
  prerequisitesMet,
  completeObjective,
  missionComplete,
  missionImpossible,
} from "./mission-graph";
import { event, finish } from "./simulation";
import { raiseAlert, audit } from "./alert";
import { noise } from "./perception";
import { requestSupport } from "./reinforcements";
import { ensureComponents } from "./armor";
import { equip } from "../shared/loadout";
export function operationObjectives(map: GameMap): Objective[] {
  const id = map.operation!.missionId;
  return map.missionNodes!.map((n) => {
    const d = map.installations.find((d) => d.objectiveId === n.id)!;
    return {
      id: `${id}:${n.id}`,
      missionId: id,
      facilityId: d.id,
      locationId: `site:${d.zoneId}`,
      kind: n.action,
      action: n.action,
      label: n.label,
      position: { x: d.x, y: d.y },
      operatingPoint: workPoint(d, map),
      optional: !n.required,
      state: n.prerequisiteIds.length ? "locked" : "available",
      progress: 0,
      total: n.work,
      reward: n.reward,
      discovered: false,
      known: n.public ? "region" : "unknown",
      prerequisiteIds: n.prerequisiteIds.map((p) => `${id}:${p}`),
      prerequisiteMode: n.prerequisiteMode,
      activation: n.activation,
      response: n.response,
      effect: n.effect,
      failure: n.failure,
    };
  });
}
export function initializeOperation(w: World) {
  const options = w.map.operation;
  if (!options) return;
  const spec = MISSIONS[options.missionId];
  w.mission.id = spec.id;
  w.mission.timeLimit = spec.minutes * 60;
  w.mission.completion = {
    ids: spec.completion.ids.map((id) => `${spec.id}:${id}`),
    count: spec.completion.count,
  };
  if (spec.id === "transfer") {
    const p = w.mission.objectives.find(
      (o) => o.action === "collect",
    )!.operatingPoint!;
    w.mission.cargo = {
      id: "data-case",
      x: p.x,
      y: p.y,
      carrier: null,
      delivered: false,
      droppedAt: -1,
    };
  }
}
export function tickCargo(w: World) {
  const c = w.mission.cargo;
  if (!c || c.delivered) return;
  if (c.carrier) {
    const p = w.players.find((p) => p.id === c.carrier);
    if (p) {
      c.x = p.x;
      c.y = p.y;
    }
    if (!p || p.down || !p.connected || p.input.drop) {
      if (p) p.carrying = undefined;
      c.carrier = null;
      c.droppedAt = w.time;
      audit(w, "cargo-drop", `${c.x.toFixed(1)},${c.y.toFixed(1)}`);
    }
  }
  const o = w.mission.objectives.find((o) => o.action === "collect")!;
  if (
    !c.carrier &&
    w.time - c.droppedAt > 0.3 &&
    ["available", "active", "complete"].includes(o.state)
  ) {
    const p = w.players.find(
      (p) =>
        p.connected &&
        !p.down &&
        p.input.interact &&
        !p.input.drop &&
        distance(p, c) < 80 &&
        lineOfSight(p, c, w.map),
    );
    if (p) {
      c.carrier = p.id;
      p.carrying = c.id;
      c.x = p.x;
      c.y = p.y;
      equip(p, 2);
      complete(w, o);
      audit(w, "cargo-pickup", p.id);
    }
  }
}
function response(w: World, o: Objective, stage: string) {
  noise(w, o.position, 1000, "destruction");
  raiseAlert(w, o.response ?? 12, o.label + " · " + stage, o.position, 2);
  for (const e of w.enemies)
    if (e.hp > 0 && !e.reserve && distance(e, o.position) < 1100) {
      e.lastSeen = { ...o.position };
      e.reportAt = w.time;
      e.reportKind = "heard";
      e.memory = Math.max(e.memory, 7);
      e.repath = 0;
    }
  const candidates = [...w.map.sources]
    .filter((s) => !s.disabled && !s.blocked && s.cooldown <= 0 && s.stock > 0)
    .sort(
      (a, b) => distance(a.entry, o.position) - distance(b.entry, o.position),
    );
  for (const s of candidates)
    if (
      requestSupport(
        w,
        `${o.id}:${stage}`,
        o.operatingPoint ?? o.position,
        "mission",
        s.id,
      )
    )
      break;
  audit(w, "objective-response", `${o.id}/${stage}`);
}
function complete(w: World, o: Objective) {
  if (!completeObjective(o)) return;
  w.metrics.objectiveOrder.push(o.id);
  event(w, { type: "supply", ...o.position });
  if (o.action === "destroy") response(w, o, "파괴");
  const d = w.map.installations.find((d) => d.id === o.facilityId)!;
  if (o.effect === "regional-comms") {
    for (const s of w.map.sources)
      if (distance(s.entry, d) < 2400) s.radioDelay = 1.8;
    for (const e of w.enemies)
      if (distance(e, d) < 2400) e.radioDisrupted = true;
    audit(w, "regional-comms", `${d.id}: 2400거리 지역 통신 지연`);
  } else if (o.effect === "disable-source") {
    for (const s of w.map.sources) if (s.facility === d.id) s.disabled = true;
  } else if (o.effect === "reveal") {
    for (const other of w.mission.objectives)
      if (distance(other.position, d) < 1800) {
        other.known = "exact";
        other.discovered = true;
      }
    w.mission.intel = true;
  } else if (o.effect === "resupply") {
    const p = o.operatingPoint!;
    w.map.supplies.push({ ...p, used: false });
  } else if (o.effect === "silence-artillery") {
    for (const e of w.enemies)
      if (e.kind === "artillery" && e.supportFacility === d.id) {
        ensureComponents(e);
        if (e.components?.weapon) {
          e.components.weapon.hp = 0;
          e.components.weapon.destroyed = true;
        }
      }
    for (const s of w.map.sources)
      if (s.supports.includes("artillery"))
        s.supports = s.supports.filter((k) => k !== "artillery");
    audit(w, "battery-disabled", d.id);
  }
}
function operator(w: World, o: Objective): Player | undefined {
  const p = o.operatingPoint ?? o.position;
  return w.players.find(
    (a) =>
      a.connected &&
      !a.down &&
      a.input.interact &&
      !a.input.fire &&
      distance(a, p) < 80 &&
      lineOfSight(a, p, w.map),
  );
}
function panel(o: Objective, d: Installation, w: World, index: number) {
  const a = d.angle ?? 0;
  const candidates = [0, (Math.PI * 2) / 3, (-Math.PI * 2) / 3].map(
    (offset) => ({
      x: d.x + Math.cos(a + offset) * 130,
      y: d.y + Math.sin(a + offset) * 130,
    }),
  );
  const p = candidates[index % 3];
  if (!movementBlocked(p, w.map, 20)) o.operatingPoint = p;
}
export function tickOperationalObjectives(w: World, dt: number) {
  tickCargo(w);
  updateGraph(w.mission.objectives);
  for (const o of w.mission.objectives) {
    const d = w.map.installations.find((d) => d.id === o.facilityId);
    if (!d) continue;
    if (squadSees(w, o.position)) {
      o.discovered = true;
      o.known = "exact";
    }
    if (o.state === "complete" || o.state === "failed") continue;
    if (o.action === "destroy") {
      if (
        o.activation === "breach" &&
        prerequisitesMet(o, w.mission.objectives) &&
        !d.protectionDisabled
      ) {
        d.protectionDisabled = true;
        ensureComponents(d);
        if (d.components?.shield) {
          d.components.shield.hp = 0;
          d.components.shield.destroyed = true;
        }
      }
      o.progress = d.maxHp - d.hp;
      if (d.hp <= 0 && (o.state !== "locked" || o.activation === "breach"))
        complete(w, o);
      else if (
        o.progress > 0 &&
        (o.state !== "locked" || o.activation === "breach")
      )
        o.state = "active";
      continue;
    }
    if (d.hp <= 0 && o.failure === "facility-destroyed") {
      o.state = "failed";
      if (o.action === "defend") {
        finish(w, false, "방어 시설 파괴");
        return;
      }
      continue;
    }
    if (o.state === "locked") continue;
    const p = operator(w, o);
    if (o.action === "collect") continue; // cargo is an already-existing physical object
    if (o.action === "launch") {
      o.phase ??= "장치 가동";
      if (o.phase === "장치 가동" && p) {
        o.state = "active";
        o.progress += dt;
        if (o.progress >= 1) {
          o.progress = 1;
          o.phase = "발사 준비";
          o.phaseAt = w.time;
          response(w, o, "준비");
        }
      } else if (o.phase === "발사 준비" && w.time - o.phaseAt! >= 9) {
        o.phase = "최종 승인";
        panel(o, d, w, 2);
      } else if (o.phase === "최종 승인" && p) {
        o.progress += dt;
        if (o.progress >= 2) {
          o.phase = "미사일 발사";
          o.phaseAt = w.time;
          w.mission.launch = { position: { ...o.position }, at: w.time };
          event(w, { type: "explode", ...o.position, heavy: true });
          raiseAlert(w, 35, "전략 미사일 발사", o.position, 3);
        }
      } else if (o.phase === "미사일 발사" && w.time - o.phaseAt! >= 3)
        complete(w, o);
    } else if (o.action === "drill") {
      o.phase ??= "장비 설치";
      if (["장비 설치", "초기화"].includes(o.phase) && p) {
        o.state = "active";
        o.progress += dt;
        if (o.phase === "장비 설치" && o.progress >= 0.8) {
          o.phase = "초기화";
          panel(o, d, w, 1);
        } else if (o.phase === "초기화" && o.progress >= 1.6) {
          o.progress = 0;
          o.phase = "데이터 수집";
          o.phaseAt = w.time;
          response(w, o, "시추");
        }
      } else if (o.phase === "데이터 수집") {
        const jammed = w.enemies.some(
          (e) =>
            e.hp > 0 &&
            !e.reserve &&
            distance(e, d) < 140 &&
            lineOfSight(e, d, w.map),
        );
        if (!jammed) o.progress += dt;
        if (Math.floor(w.time / 3) !== Math.floor((w.time - dt) / 3))
          noise(w, d, 1000, "destruction");
        if (o.progress >= o.total) complete(w, o);
      }
    } else if (o.action === "defend") {
      if (!o.phase) {
        if (p) {
          o.progress += dt;
          if (o.progress >= 2) {
            o.progress = 0;
            o.phase = "방어 중";
            o.phaseAt = w.time;
            o.state = "active";
            w.mission.defenseWaves = 0;
          }
        }
      } else {
        if (d.hp <= 0) {
          o.state = "failed";
          finish(w, false, "방어 시설 파괴");
          return;
        }
        o.progress = w.time - o.phaseAt!;
        const wave = w.mission.defenseWaves ?? 0;
        if (wave < 3 && o.progress >= wave * 20) {
          response(w, o, "공세" + wave);
          w.mission.defenseWaves = wave + 1;
        }
        if (o.progress >= o.total) complete(w, o);
      }
    } else if (o.action === "upload") {
      const c = w.mission.cargo!;
      if (!c.delivered && p && c.carrier === p.id) {
        c.carrier = null;
        c.delivered = true;
        c.x = p.x;
        c.y = p.y;
        p.carrying = undefined;
        o.phase = "데이터 전송";
        o.phaseAt = w.time;
        o.state = "active";
        response(w, o, "전송");
      }
      if (c.delivered) {
        const contest = w.enemies.some(
          (e) =>
            e.hp > 0 &&
            !e.reserve &&
            distance(e, d) < 140 &&
            lineOfSight(e, d, w.map),
        );
        if (!contest) o.progress += dt;
        if (o.progress >= o.total) complete(w, o);
      }
    } else if (o.action === "analyze") {
      if (!o.phase && p) {
        o.phase = "분석 중";
        o.phaseAt = w.time;
        o.state = "active";
        response(w, o, "분석");
      }
      if (o.phase) {
        o.progress += dt;
        if (o.progress >= o.total) complete(w, o);
      }
    } else if (p) {
      o.state = "active";
      o.progress += dt;
      if (d.role === "power") {
        o.phase = `스위치 ${Math.min(3, Math.floor(o.progress) + 1)}/3`;
        panel(o, d, w, Math.floor(o.progress));
      }
      if (o.progress >= o.total) complete(w, o);
    }
  }
  updateGraph(w.mission.objectives);
  if (missionImpossible(w.mission.objectives, w.mission.completion)) {
    finish(w, false, "필수 목표 수행 불가");
    return;
  }
  if (
    w.mission.stage === "recon" &&
    (w.alertState.level > 0 || w.mission.objectives.some((o) => o.progress > 0))
  )
    w.mission.stage = "operate";
  if (
    missionComplete(w.mission.objectives, w.mission.completion) &&
    w.mission.extraction.state === "locked"
  ) {
    w.metrics.primaryAt = w.time;
    w.mission.extraction.state = "available";
    w.mission.stage = "operate";
  }
}
