import type {
  GameEvent,
  World,
  Installation,
  DispatchSource,
  Rect,
} from "../shared/data";
import { distance } from "../game/map";
import { squadSees, SIGHT_RANGE } from "../game/visibility";
const knowledge = new WeakMap<
  World,
  {
    fac: Map<string, Installation>;
    sources: Map<string, DispatchSource>;
    doors: Map<string, Rect>;
    supplies: Map<number, boolean>;
    revision: number;
  }
>();
/** Team-shared remembered facilities; hidden military state and precise sound origins never cross the wire. */
export function visibleWorld(w: World) {
  const k = knowledge.get(w) ?? {
    fac: new Map(),
    sources: new Map(),
    doors: new Map(),
    supplies: new Map(),
    revision: 0,
  };
  knowledge.set(w, k);
  for (const d of w.map.obstacles.filter((o) => o.kind === "door"))
    if (
      [
        { x: d.x - 1, y: d.y + d.h / 2 },
        { x: d.x + d.w + 1, y: d.y + d.h / 2 },
        { x: d.x + d.w / 2, y: d.y - 1 },
        { x: d.x + d.w / 2, y: d.y + d.h + 1 },
      ].some((p) => squadSees(w, p))
    ) {
      if ((k.doors.get(d.id!)?.open ?? false) !== d.open) k.revision++;
      k.doors.set(d.id!, { ...d });
    }
  w.map.supplies.forEach((s, i) => {
    if (squadSees(w, s)) k.supplies.set(i, s.used);
  });
  for (const d of w.map.installations)
    if (d.kind === "generator" || squadSees(w, d))
      k.fac.set(d.id, { ...d, discovered: true });
  for (const s of w.map.sources)
    if (squadSees(w, s.entry))
      k.sources.set(s.id, {
        ...s,
        x: s.entry.x,
        y: s.entry.y,
        route: [],
        stock: 0,
        capacity: 0,
        supports: [],
      });
  const events: GameEvent[] = [];
  for (const e of w.events) {
    if (e.at !== undefined && w.time - e.at > 0.6) continue;
    const own = w.players.find((p) => p.id === e.actor),
      seen = squadSees(w, e);
    if (seen) {
      if (
        e.type === "shot" &&
        own &&
        e.toX !== undefined &&
        e.toY !== undefined &&
        !squadSees(w, { x: e.toX, y: e.toY })
      ) {
        const angle = Math.atan2(e.toY - e.y, e.toX - e.x),
          length = Math.min(
            SIGHT_RANGE - 5,
            Math.hypot(e.toX - e.x, e.toY - e.y),
          );
        events.push({
          ...e,
          toX: e.x + Math.cos(angle) * length,
          toY: e.y + Math.sin(angle) * length,
          impact: false,
        });
      } else events.push(e);
    } else if (own && (e.type === "hit" || e.type === "kill"))
      events.push({
        ...e,
        x: own.x,
        y: own.y,
        angle: undefined,
        obscured: true,
      });
    else if (
      (e.type === "shot" || e.type === "alarm" || e.type === "sound") &&
      !e.pellet
    ) {
      const hear = w.players.some(
        (p) =>
          p.connected &&
          !p.down &&
          distance(p, e) < (e.cue === "steps" ? 450 : 1100),
      );
      if (hear)
        events.push({
          id: e.id,
          type: "sound",
          x: Math.floor(e.x / 400) * 400 + 200,
          y: Math.floor(e.y / 400) * 400 + 200,
          enemy: true,
          uncertainty: 283,
          cue: e.cue ?? (e.type === "shot" ? "gunfire" : "radio"),
          at: e.at,
        });
    }
  }
  return {
    id: w.id,
    ...(["success", "failed"].includes(w.mission.stage)
      ? { metrics: w.metrics }
      : {}),
    map: {
      ...w.map,
      obstacles: w.map.obstacles.map((o) =>
        o.kind === "door" ? (k.doors.get(o.id!) ?? { ...o, open: false }) : o,
      ),
      supplies: w.map.supplies.map((s, i) => ({
        ...s,
        used: k.supplies.get(i) ?? false,
      })),
      zones: w.map.zones.map(({ pads, ...z }) => ({ ...z, pads: [] })),
      patrols: [],
      installations: [...k.fac.values()],
      sources: [...k.sources.values()],
    },
    mission: {
      ...w.mission,
      objectives: w.mission.objectives.map((o) =>
        o.discovered || !o.optional || o.state === "complete"
          ? o
          : {
              ...o,
              position: {
                x: Math.round(o.position.x / 400) * 400,
                y: Math.round(o.position.y / 400) * 400,
              },
              progress: 0,
            },
      ),
    },
    difficulty: w.difficulty,
    contract: w.contract,
    time: w.time,
    eventId: w.eventId,
    visibility: w.visibility,
    terrainRevision: w.terrainRevision + k.revision,
    alertState: { level: w.alertState.level, reason: w.alertState.reason },
    projectiles: w.projectiles
      .filter((q) =>
        q.kind === "mortar"
          ? w.players.some(
              (p) => p.connected && !p.down && distance(p, q.target) < 1000,
            )
          : squadSees(w, q),
      )
      .map((q) =>
        q.kind === "mortar"
          ? {
              ...q,
              x: q.target.x,
              y: q.target.y,
              origin: { ...q.target },
              owner: "",
              angle: 0,
            }
          : squadSees(w, q.origin)
            ? q
            : {
                id: q.id,
                kind: q.kind,
                x: q.x,
                y: q.y,
                angle: q.angle,
                enemy: q.enemy,
                origin: { x: q.x, y: q.y },
                target: { x: q.x, y: q.y },
                owner: "",
                at: w.time,
                impactAt: w.time + 0.1,
                speed: 0,
                traveled: 0,
                range: 0,
                radius: q.radius,
                damage: 0,
              },
      ),
    wrecks: w.wrecks.filter((q) => squadSees(w, q)),
    notices: w.notices.filter((n) => w.time - n.at < 18),
    players: w.players.map(({ input, inputAt, ...p }) => p),
    enemies: w.enemies
      .filter((e) => e.hp > 0 && squadSees(w, e))
      .map(
        ({ id, kind, x, y, hp, angle, windup, hurt, state, elite, phase }) => ({
          id,
          kind,
          elite,
          phase,
          x,
          y,
          hp,
          angle,
          windup,
          hurt,
          state,
        }),
      ),
    events,
    random: 0,
  };
}
