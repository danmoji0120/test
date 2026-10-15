import { dispatchBlock } from "./budgets";
import { audit } from "./alert";
import { enemyRadius, armored } from "./armor";
import {
  ENEMIES,
  type World,
  type Vec,
  type Reinforcement,
  type Enemy,
} from "../shared/data";
import { distance, findPath, move, blocked, invalidateNavigation } from "./map";
import { spawnEnemy, event } from "./simulation";
import { lineOfSight } from "./visibility";
import { difficulty } from "../shared/difficulty";
export { MAX_ACTORS } from "./budgets";
function door(w: World, id: string, open: boolean) {
  const d = w.map.obstacles.find((o) => o.id === id);
  if (d && d.open !== open) {
    d.open = open;
    invalidateNavigation(w.map);
    w.terrainRevision++;
  }
}
export function initializeTheatre(w: World) {
  w.enemies = [];
  w.squads = {};
  const team = w.players.length;
  const config = difficulty(w.difficulty, team);
  for (const s of w.map.sources) {
    s.prepare *= config.prepare;
    s.interval = config.interval + (s.kind === "external" ? 12 : 0);
    s.batch = config.batch;
    if (s.kind === "external" || s.kind === "barracks") {
      if (w.difficulty >= 5) s.supports.push("juggernaut");
      if (w.difficulty >= 7) s.supports.push("drone");
      if (w.difficulty >= 8) s.supports.push("walker");
      if (w.difficulty >= 9 && s.kind === "external")
        s.supports.push("artillery");
    }
  }
  for (const z of w.map.zones.slice(0, 6))
    for (
      let i = 0;
      i <
      Math.floor(config.guardCount / 6) +
        (z.id < config.guardCount % 6 ? 1 : 0);
      i++
    ) {
      const p = z.pads[i % z.pads.length];
      if (!p) continue;
      spawnEnemy(
        w,
        p,
        i > 0 && z.id / 6 < config.heavy
          ? "heavy"
          : z.id === 4
            ? "rush"
            : "rifle",
        {
          squad: "guard-" + z.id,
          patrol: [{ ...p }, { ...z.entry }],
          sourceId: "garrison-" + z.id,
        },
      );
    }
  for (const [i, route] of w.map.patrols
    .filter((r) => r.some((p) => distance(p, w.map.spawn) > 900))
    .slice(0, config.patrolGroups)
    .entries()) {
    const ordered =
      distance(route[0], w.map.spawn) > distance(route.at(-1)!, w.map.spawn)
        ? route
        : [...route].reverse();
    const start = ordered[0],
      end = ordered.at(-1)!;
    const path = findPath(start, end, w.map);
    const patrol = [start, ...path.filter((_, i) => i % 5 === 0), end];
    for (let n = 0; n < 2; n++)
      spawnEnemy(w, { x: start.x + n * 36, y: start.y }, n ? "rush" : "rifle", {
        squad: "patrol-" + i,
        patrol,
        sourceId: "patrol-" + i,
      });
  }
  const specials: import("../shared/data").EnemyKind[] = [];
  if (w.difficulty >= 5) specials.push("juggernaut");
  if (w.difficulty >= 7) specials.push("drone");
  if (w.difficulty >= 8) specials.push("walker");
  if (w.difficulty >= 9) specials.push("artillery");
  if (w.difficulty === 10) specials.push("juggernaut", "drone");
  for (const [i, kind] of specials.entries()) {
    const site = w.map.zones[i % 2 === 0 ? 0 : 1],
      anchor =
        kind === "artillery"
          ? w.map.sources.find((s) => s.kind === "external")!.entry
          : site.entry;
    for (let n = 0; n < 24; n++) {
      const a = n * 2.399,
        r = kind === "artillery" ? 130 + n * 15 : 120 + n * 12,
        p = { x: anchor.x + Math.cos(a) * r, y: anchor.y + Math.sin(a) * r };
      if (
        !blocked(p, w.map.obstacles, enemyRadius(kind)) &&
        p.x > 100 &&
        p.y > 100 &&
        p.x < w.map.width - 100 &&
        p.y < w.map.height - 100
      ) {
        spawnEnemy(w, p, kind, {
          squad: "special-guard-" + i,
          sourceId: "garrison-" + site.id,
          role: "anchor",
          patrol: [{ ...p }, { ...site.entry }],
        });
        break;
      }
    }
  }

  for (const s of w.map.sources.filter((s) => s.kind !== "external")) {
    s.stock = 2;
    s.capacity = 2;
    door(w, s.doorId, false);
    for (let i = 0; i < 2; i++)
      spawnEnemy(
        w,
        { x: s.x - 55 + i * 110, y: s.y - 90 },
        i ? "rush" : "rifle",
        {
          squad: "reserve-" + s.id,
          reserve: true,
          sourceId: s.id,
          patrol: [{ x: s.x, y: s.y }],
        },
      );
    if (s.kind === "barracks" && w.difficulty >= 5) {
      const kind = w.difficulty >= 8 ? "walker" : "juggernaut";
      const e = spawnEnemy(w, { x: s.x, y: s.y + 35 }, kind, {
        squad: "motorpool-" + s.id,
        reserve: true,
        sourceId: s.id,
        patrol: [{ x: s.x, y: s.y }],
      });
      if (e) {
        s.stock++;
        s.capacity++;
      }
    }
  }
}
export interface DispatchPlan {
  heavy?: boolean;
  task?: Reinforcement["task"];
  roster?: import("../shared/data").EnemyKind[];
}
/** Every request reserves a real local soldier or an external roster and a width-valid physical route. */
export function requestSupport(
  w: World,
  key: string,
  target: Vec,
  squad = "director",
  preferred?: string,
  plan: DispatchPlan = {},
): Reinforcement | undefined {
  if (w.dispatchKeys[key])
    return w.reinforcements.find((r) => r.id === w.dispatchKeys[key]);
  if (
    Object.keys(w.dispatchKeys).length >= 2048 ||
    w.reinforcements.filter((r) => r.state === "queued").length >= 8
  )
    return;
  const candidates = w.map.sources.filter(
    (s) =>
      !s.disabled &&
      !s.blocked &&
      s.cooldown <= 0 &&
      s.stock > 0 &&
      (preferred ? s.id === preferred : s.response <= w.alertState.level) &&
      (!plan.heavy || s.supports.some(armored)),
  );
  candidates.sort(
    (a, b) => distance(a.entry, target) - distance(b.entry, target),
  );
  for (const s of candidates) {
    const members =
      s.kind === "external"
        ? []
        : w.enemies
            .filter(
              (e) =>
                e.hp > 0 &&
                e.reserve &&
                e.sourceId === s.id &&
                !e.requestId &&
                (!plan.heavy || armored(e.kind)) &&
                (plan.heavy || !armored(e.kind) || w.alertState.level >= 3),
            )
            .slice(0, plan.heavy ? 1 : s.batch);
    if (s.kind !== "external" && !members.length) continue;
    let roster: import("../shared/data").EnemyKind[];
    if (members.length) roster = members.map((e) => e.kind);
    else if (plan.roster)
      roster = plan.roster.filter((k) => s.supports.includes(k));
    else if (plan.heavy) {
      const kinds = s.supports.filter(armored);
      const kind =
        kinds[(w.dispatchId + (w.difficulty >= 8 ? 1 : 0)) % kinds.length];
      roster = [kind, ...(w.difficulty >= 7 ? ["drone" as const] : [])];
    } else
      roster = Array.from({ length: s.batch }, (_, i) =>
        i === 0 && w.difficulty >= 7 && w.alertState.level >= 3
          ? "drone"
          : i % 3 === 2
            ? "heavy"
            : i % 2
              ? "rush"
              : "rifle",
      );
    if (!roster.length) continue;
    const radius = Math.max(...roster.map(enemyRadius)),
      path = findPath(s.entry, target, w.map, radius);
    if (!path.length && distance(s.entry, target) > 70) continue;
    const r: Reinforcement = {
      id: "dispatch-" + ++w.dispatchId,
      key,
      squad,
      sourceId: s.id,
      members: members.map((e) => e.id),
      roster,
      task: plan.task ?? "assault",
      radius,
      target: { x: target.x, y: target.y },
      path: [{ ...s.entry }, ...path],
      requested: w.time,
      departed: -1,
      arrived: -1,
      eta:
        w.time +
        s.prepare +
        (path.length * 50) /
          (Math.min(...roster.map((k) => ENEMIES[k].speed)) * 0.9),
      state: "queued",
      reason: "",
    };
    for (const e of members) e.requestId = r.id;
    s.cooldown = s.interval;
    s.warning = w.time + s.prepare;
    w.reinforcements.push(r);
    w.dispatchKeys[key] = r.id;
    audit(w, "queued", `${r.id} ${s.id} ${roster.join("+")} ${r.task}`);
    const team = w.players.filter((p) => p.connected && !p.down),
      center = team.length
        ? {
            x: team.reduce((n, p) => n + p.x, 0) / team.length,
            y: team.reduce((n, p) => n + p.y, 0) / team.length,
          }
        : w.map.spawn;
    const sector = Math.round(
        Math.atan2(s.entry.y - center.y, s.entry.x - center.x) / (Math.PI / 4),
      ),
      direction = [
        "동쪽",
        "남동쪽",
        "남쪽",
        "남서쪽",
        "서쪽",
        "북서쪽",
        "북쪽",
        "북동쪽",
      ][(sector + 8) % 8];
    if (w.alertState.level >= 2) {
      w.notices.push({
        at: w.time,
        text: roster.some(armored)
          ? "중장갑 대응 전력 출동 준비"
          : w.alertState.level >= 3
            ? "정예 대응 분대 출동 준비"
            : "지원 병력 출동 준비",
        direction,
        eta: r.eta,
      });
      w.notices = w.notices.slice(-12);
    }
    return r;
  }
  audit(w, "declined", `${key}: 유효 출동지·재고·경로 없음`);
}
export function cancelRequest(w: World, r: Reinforcement, reason: string) {
  if (r.state !== "queued") return;
  r.state = "cancelled";
  r.reason = reason;
  audit(w, "cancelled", `${r.id}: ${reason}`);
  for (const e of w.enemies)
    if (e.requestId === r.id && e.reserve) e.requestId = "";
}
function doorState(w: World, s: World["map"]["sources"][number]) {
  door(w, s.doorId, true);
}
function trace(w: World, e: Enemy, r: Reinforcement) {
  let a = w.trajectories.find((t) => t.enemy === e.id && t.request === r.id);
  if (!a) {
    a = {
      enemy: e.id,
      source: r.sourceId,
      request: r.id,
      born: { x: e.x, y: e.y },
      points: [],
    };
    w.trajectories.push(a);
  }
  if (!a.points.length || w.time - a.points.at(-1)!.at >= 0.5) {
    a.points.push({ x: e.x, y: e.y, at: w.time });
    if (a.points.length > 400) a.points.splice(1, 1);
  }
}
export function tickReinforcements(w: World, dt: number) {
  for (const s of w.map.sources) {
    if (
      !s.blocked &&
      w.players.some(
        (p) =>
          p.connected &&
          !p.down &&
          p.input.interact &&
          distance(p, s.entry) < 85 &&
          lineOfSight(p, s.entry, w.map),
      )
    ) {
      s.blockProgress += dt;
      if (s.blockProgress >= 3) {
        s.blocked = true;
        s.warning = 0;
        door(w, s.doorId, false);
        audit(w, "source-blocked", s.id);
        event(w, { type: "alarm", ...s.entry });
      }
    } else if (!s.blocked) s.blockProgress = Math.max(0, s.blockProgress - dt);
    s.cooldown = Math.max(0, s.cooldown - dt);
    if (
      s.facility &&
      w.map.installations.find((d) => d.id === s.facility)?.hp === 0
    ) {
      s.disabled = true;
      s.warning = 0;
    }
  }
  for (const r of w.reinforcements) {
    const s = w.map.sources.find((s) => s.id === r.sourceId);
    if (!s) {
      cancelRequest(w, r, "출동지 소실");
      continue;
    }
    if (r.state === "queued") {
      if (s.disabled || s.blocked) {
        cancelRequest(w, r, "출동지 무력화");
        continue;
      }
      const comms = w.map.installations.some(
          (d) => d.kind === "comms" && d.hp > 0,
        ),
        motorpool = w.map.installations.some(
          (d) => d.kind === "barracks" && d.hp > 0,
        ),
        prep =
          s.prepare *
          (comms ? 1 : 1.8) *
          (w.alertState.level >= 3 ? 0.7 : 1) *
          (s.kind === "external" && r.roster?.some(armored) && !motorpool
            ? 2.3
            : 1);
      if (w.time - r.requested < Math.max(3, prep)) continue;
      const roster =
          r.roster ??
          r.members.map((id) => w.enemies.find((e) => e.id === id)!.kind),
        block = dispatchBlock(w, roster, s.kind === "external");
      if (block) {
        if (r.reason !== block) {
          r.reason = block;
          audit(w, "waiting", `${r.id}: ${block}`);
        }
        continue;
      }
      const radius = r.radius ?? 19,
        route = findPath(s.entry, r.target, w.map, radius);
      if (!route.length && distance(s.entry, r.target) > 70) {
        cancelRequest(w, r, "경로 차단");
        continue;
      }
      r.path = [{ ...s.entry }, ...route];
      doorState(w, s);
      if (s.kind === "external")
        for (let i = 0; i < roster.length; i++) {
          const e = spawnEnemy(
            w,
            {
              x: s.x + (s.y < 0 || s.y > w.map.height ? (i - 1) * 65 : 0),
              y: s.y + (s.x < 0 || s.x > w.map.width ? (i - 1) * 65 : 0),
            },
            roster[i],
            {
              squad: r.id,
              sourceId: s.id,
              requestId: r.id,
              elite: w.alertState.level >= 3 && w.difficulty >= 5,
              role: r.task === "block" ? "anchor" : i % 2 ? "flank" : "assault",
            },
          );
          if (e) r.members.push(e.id);
        }
      for (const id of r.members) {
        const e = w.enemies.find((e) => e.id === id && e.hp > 0);
        if (!e) continue;
        e.reserve = false;
        e.traveling = true;
        e.state = "PURSUE";
        e.path =
          s.kind === "external"
            ? r.path.map((p) => ({ ...p }))
            : [
                ...findPath(e, s.entry, w.map, enemyRadius(e.kind)),
                ...r.path.map((p) => ({ ...p })),
              ];
        e.home = { ...r.target };
        e.memory = 0;
        e.role = r.task === "block" ? "anchor" : e.role;
        trace(w, e, r);
      }
      if (
        !r.members.some((id) => w.enemies.some((e) => e.id === id && e.hp > 0))
      ) {
        cancelRequest(w, r, "대기 병력 손실");
        continue;
      }
      if (s.kind !== "external")
        s.stock = Math.max(0, s.stock - r.members.length);
      r.state = "traveling";
      r.reason = "";
      r.departed = w.time;
      r.eta =
        w.time +
        (r.path.length * 50) /
          (Math.min(...roster.map((k) => ENEMIES[k].speed)) * 0.9);
      audit(
        w,
        "departed",
        `${r.id} ${s.id} ${r.members.join(",")} ${roster.join("+")}`,
      );
      event(w, { type: "alarm", ...s.entry, heavy: roster.some(armored) });
      if (roster.some(armored))
        event(w, {
          type: "sound",
          cue: "engine",
          ...s.entry,
          enemy: true,
          heavy: true,
        });
    }
    if (r.state === "traveling") {
      for (const id of r.members) {
        const e = w.enemies.find((e) => e.id === id && e.hp > 0);
        if (!e) continue;
        if (!e.traveling) {
          trace(w, e, r);
          continue;
        }
        const contact = w.players.some(
          (p) =>
            p.connected &&
            !p.down &&
            lineOfSight(e, p, w.map, e.kind === "drone" ? 950 : 620),
        );
        if (contact && distance(e, s) > 150) {
          e.traveling = false;
          e.lastSeen = { ...r.target };
          e.memory = 5;
          r.arrived = w.time;
          trace(w, e, r);
          continue;
        }
        while (e.path.length && distance(e, e.path[0]) < 9) e.path.shift();
        const point = e.path[0];
        if (point) {
          const d = distance(e, point),
            speed = ENEMIES[e.kind].speed * 0.9,
            step = Math.min(d, speed * dt),
            before = { x: e.x, y: e.y };
          e.angle = Math.atan2(point.y - e.y, point.x - e.x);
          if (Math.floor((w.time - dt) / 1.2) !== Math.floor(w.time / 1.2))
            event(w, {
              type: "sound",
              cue: armored(e.kind) ? "engine" : "steps",
              x: e.x,
              y: e.y,
              enemy: true,
              heavy: armored(e.kind),
              kind: e.kind,
            });
          move(
            e,
            ((point.x - e.x) / d) * step,
            ((point.y - e.y) / d) * step,
            w.map,
            enemyRadius(e.kind),
          );
          if (distance(e, before) < 0.05) e.stuck += dt;
          else e.stuck = 0;
          if (e.stuck > 1.5) {
            e.path = findPath(e, r.target, w.map, enemyRadius(e.kind));
            e.stuck = 0;
            if (!e.path.length) {
              r.reason = "행군 경로 차단";
              e.traveling = false;
              e.state = "INVESTIGATE";
              audit(w, "interrupted", `${r.id} ${e.id}: 경로 차단`);
            }
          }
        } else {
          e.traveling = false;
          r.arrived = w.time;
          e.state = "INVESTIGATE";
          e.lastSeen = { ...r.target };
          e.memory = 5;
        }
        trace(w, e, r);
      }
      if (
        r.members.every((id) => !w.enemies.some((e) => e.id === id && e.hp > 0))
      ) {
        r.state = "cancelled";
        r.reason = "행군 병력 손실";
        audit(w, "cancelled", `${r.id}: ${r.reason}`);
        continue;
      }
      if (
        r.members.every(
          (id) =>
            !w.enemies.some((e) => e.id === id && e.hp > 0 && e.traveling),
        )
      ) {
        if (r.arrived < 0) {
          r.state = "cancelled";
          r.reason = "도착 전 경로 차단";
        } else {
          r.state = "arriving";
          r.arrived = w.time;
        }
      }
    } else if (r.state === "arriving" && w.time - r.arrived > 0.5) {
      r.state = "deployed";
      audit(w, "deployed", `${r.id}: ${r.task}`);
    }
  }
  if (w.reinforcements.length > 96)
    w.reinforcements = w.reinforcements
      .filter(
        (r) =>
          !["deployed", "cancelled"].includes(r.state) ||
          w.time - r.requested < 180,
      )
      .slice(-96);
  if (w.trajectories.length > 180)
    w.trajectories.splice(0, w.trajectories.length - 180);
}
