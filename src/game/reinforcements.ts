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
export const MAX_ACTORS = 30;
const active = (w: World) =>
  w.enemies.filter((e) => e.hp > 0 && !e.reserve).length;
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
  for (const s of w.map.sources.filter((s) => s.kind !== "external")) {
    s.stock = 2;
    s.capacity = 2;
    door(w, s.doorId, false);
    for (let i = 0; i < 2; i++)
      spawnEnemy(
        w,
        { x: s.x - 18 + i * 36, y: s.y - 20 },
        i ? "rush" : "rifle",
        {
          squad: "reserve-" + s.id,
          reserve: true,
          sourceId: s.id,
          patrol: [{ x: s.x, y: s.y }],
        },
      );
  }
}
/** Idempotent dispatch; selection uses a known target, not hidden player coordinates. */
export function requestSupport(
  w: World,
  key: string,
  target: Vec,
  squad = "director",
  preferred?: string,
): Reinforcement | undefined {
  if (w.dispatchKeys[key])
    return w.reinforcements.find((r) => r.id === w.dispatchKeys[key]);
  if (Object.keys(w.dispatchKeys).length >= 2048) return;
  const old = w.reinforcements.find((r) => r.key === key);
  if (old) return old;
  if (w.reinforcements.filter((r) => r.state === "queued").length >= 8) return;
  const candidates = w.map.sources.filter(
    (s) =>
      !s.disabled &&
      !s.blocked &&
      s.cooldown <= 0 &&
      s.stock > 0 &&
      (preferred ? s.id === preferred : s.response <= w.alertState.level),
  );
  candidates.sort(
    (a, b) => distance(a.entry, target) - distance(b.entry, target),
  );
  for (const s of candidates) {
    const path = findPath(s.entry, target, w.map, 19);
    if (!path.length && distance(s.entry, target) > 70) continue;
    const r: Reinforcement = {
      id: "dispatch-" + ++w.dispatchId,
      key,
      squad,
      sourceId: s.id,
      members: [],
      target: { x: target.x, y: target.y },
      path: [{ ...s.entry }, ...path],
      requested: w.time,
      departed: -1,
      arrived: -1,
      eta: w.time + s.prepare + (path.length * 50) / 150,
      state: "queued",
      reason: "",
    };
    if (s.kind !== "external")
      r.members = w.enemies
        .filter(
          (e) => e.hp > 0 && e.reserve && e.sourceId === s.id && !e.requestId,
        )
        .slice(0, s.batch)
        .map((e) => {
          e.requestId = r.id;
          return e.id;
        });
    if (s.kind !== "external" && !r.members.length) {
      s.stock = 0;
      continue;
    }
    s.cooldown = s.interval;
    s.warning = w.time + s.prepare;
    w.reinforcements.push(r);
    w.dispatchKeys[key] = r.id;
    return r;
  }
}
export function cancelRequest(w: World, r: Reinforcement, reason: string) {
  if (r.state !== "queued") return;
  r.state = "cancelled";
  r.reason = reason;
  for (const e of w.enemies)
    if (e.requestId === r.id && e.reserve) e.requestId = "";
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
        event(w, { type: "alarm", x: s.entry.x, y: s.entry.y });
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
    const s = w.map.sources.find((s) => s.id === r.sourceId)!;
    if (r.state === "queued") {
      if (s.disabled || s.blocked) {
        cancelRequest(w, r, "출동지 무력화");
        continue;
      }
      const comms = w.map.installations.some(
        (d) => d.kind === "comms" && d.hp > 0,
      );
      const prep = s.prepare * (comms ? 1 : 1.8);
      if (
        w.time - r.requested < prep ||
        active(w) + (r.members.length || s.batch) >
          difficulty(w.difficulty, w.players.length).activeCap ||
        w.enemies.length + (s.kind === "external" ? s.batch : 0) > MAX_ACTORS
      )
        continue;
      const route = findPath(s.entry, r.target, w.map, 19);
      if (!route.length && distance(s.entry, r.target) > 70) {
        cancelRequest(w, r, "경로 차단");
        continue;
      }
      r.path = [{ ...s.entry }, ...route];
      door(w, s.doorId, true);
      if (s.kind === "external")
        for (let i = 0; i < s.batch; i++) {
          const e = spawnEnemy(
            w,
            { x: s.x, y: s.y + (i - 1) * 38 },
            s.supports[(i + Math.floor(w.time)) % s.supports.length],
            { squad: r.id, sourceId: s.id, requestId: r.id },
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
            ? [...r.path]
            : [...findPath(e, s.entry, w.map, 19), ...r.path];
        e.home = { ...r.target };
        e.memory = 0;
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
      r.departed = w.time;
      r.eta = w.time + (r.path.length * 50) / 150;
      event(w, { type: "alarm", x: s.entry.x, y: s.entry.y });
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
          (p) => p.connected && !p.down && lineOfSight(e, p, w.map, 620),
        );
        if (contact && distance(e, s) > 150) {
          e.traveling = false;
          r.arrived = w.time;
          trace(w, e, r);
          continue;
        }
        while (e.path.length && distance(e, e.path[0]) < 9) e.path.shift();
        const point = e.path[0];
        if (point) {
          const d = distance(e, point),
            speed = ENEMIES[e.kind].speed * 0.9;
          const before = { x: e.x, y: e.y };
          e.angle = Math.atan2(point.y - e.y, point.x - e.x);
          if (Math.floor((w.time - dt) / 1.2) !== Math.floor(w.time / 1.2))
            event(w, {
              type: "sound",
              cue: "steps",
              enemy: true,
              x: e.x,
              y: e.y,
            });
          move(
            e,
            ((point.x - e.x) / d) * speed * dt,
            ((point.y - e.y) / d) * speed * dt,
            w.map,
            19,
          );
          if (distance(e, before) < 0.05) e.stuck += dt;
          else e.stuck = 0;
          if (e.stuck > 1.5) {
            e.path = findPath(e, r.target, w.map, 19);
            e.stuck = 0;
            if (!e.path.length) {
              r.reason = "행군 경로 차단";
              e.traveling = false;
              e.state = "INVESTIGATE";
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
    } else if (r.state === "arriving" && w.time - r.arrived > 0.5)
      r.state = "deployed";
  }
  // Bounded history. IDs are monotonic and old idempotence keys are time-bucketed by callers.
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
