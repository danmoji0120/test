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
    cargo?: boolean;
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
    cargo: false,
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
    if ((!w.mission.id && d.kind === "generator") || squadSees(w, d)) {
      if (w.mission.id && !k.fac.has(d.id)) k.revision++;
      k.fac.set(d.id, {
        ...d,
        components: d.components ? structuredClone(d.components) : undefined,
        discovered: true,
      });
    }
  if (w.mission.id)
    for (const d of w.map.installations) {
      const o = w.mission.objectives.find((o) => o.facilityId === d.id);
      if (o?.discovered && !k.fac.has(d.id)) {
        k.revision++;
        k.fac.set(d.id, {
          ...d,
          hp: d.maxHp,
          components: undefined,
          discovered: true,
        });
      }
    }
  if (
    w.mission.cargo &&
    (w.mission.cargo.carrier || squadSees(w, w.mission.cargo))
  )
    k.cargo = true;
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
          distance(p, e) < (e.cue === "steps" ? (e.heavy ? 800 : 450) : 1100),
      );
      if (hear)
        events.push({
          id: e.id,
          type: "sound",
          x: Math.floor(e.x / 400) * 400 + 200,
          y: Math.floor(e.y / 400) * 400 + 200,
          enemy: true,
          heavy: e.heavy,
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
      missionNodes: undefined,
      generation: w.map.generation
        ? {
            version: w.map.generation.version,
            signature: w.map.generation.signature,
            attempts: w.map.generation.attempts,
            diagnostics: [],
          }
        : undefined,
      intel: w.mission.id ? { x: 0, y: 0 } : w.map.intel,
      obstacles: w.map.obstacles.map((o) =>
        o.kind === "door" ? (k.doors.get(o.id!) ?? { ...o, open: false }) : o,
      ),
      supplies: w.map.supplies.flatMap((s, i) =>
        w.mission.id && !k.supplies.has(i)
          ? []
          : [{ ...s, used: k.supplies.get(i) ?? false }],
      ),
      zones: w.map.zones.map(({ pads, ...z }) =>
        w.mission.id && ![...k.fac.values()].some((d) => d.zoneId === z.id)
          ? {
              ...z,
              label: "미확인 구역",
              role: undefined,
              kind: "yard",
              pads: [],
            }
          : { ...z, pads: [] },
      ),
      patrols: [],
      installations: [...k.fac.values()],
      sources: [...k.sources.values()],
    },
    mission: {
      ...w.mission,
      cargo: !w.mission.id || k.cargo ? w.mission.cargo : undefined,
      objectives: w.mission.objectives.map((o) =>
        w.mission.id
          ? o.discovered || o.known === "exact" || o.state === "complete"
            ? o
            : {
                ...o,
                label: o.optional ? "미확인 신호" : o.label,
                kind: o.optional ? "intel" : o.kind,
                action: o.optional ? undefined : o.action,
                effect: undefined,
                facilityId: undefined,
                locationId: undefined,
                operatingPoint: undefined,
                position:
                  o.known === "region"
                    ? {
                        x: Math.round(o.position.x / 750) * 750,
                        y: Math.round(o.position.y / 750) * 750,
                      }
                    : { x: 0, y: 0 },
                progress: 0,
              }
          : o.discovered || !o.optional || o.state === "complete"
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
              range: 0,
              traveled: 0,
              speed: 0,
              shell: squadSees(w, q)
                ? {
                    x: q.x,
                    y: q.y,
                    height:
                      Math.sin(
                        Math.PI *
                          Math.max(
                            0,
                            Math.min(1, (w.time - q.at) / (q.impactAt - q.at)),
                          ),
                      ) *
                        260 +
                      (1 -
                        Math.max(
                          0,
                          Math.min(1, (w.time - q.at) / (q.impactAt - q.at)),
                        )) *
                        40,
                  }
                : undefined,
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
        ({
          id,
          kind,
          x,
          y,
          hp,
          angle,
          turretAngle,
          components,
          windup,
          hurt,
          state,
          elite,
          phase,
        }) => ({
          id,
          kind,
          elite,
          phase,
          x,
          y,
          hp,
          angle,
          turretAngle,
          components,
          windup,
          hurt,
          state,
        }),
      ),
    events,
    random: 0,
  };
}
