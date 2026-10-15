import type {
  GameEvent,
  World,
  Installation,
  DispatchSource,
} from "../shared/data";
import { distance } from "../game/map";
import { squadSees, SIGHT_RANGE } from "../game/visibility";
const knowledge = new WeakMap<
  World,
  { fac: Map<string, Installation>; sources: Map<string, DispatchSource> }
>();
/** Team-shared remembered facilities; hidden military state and precise sound origins never cross the wire. */
export function visibleWorld(w: World) {
  const k = knowledge.get(w) ?? { fac: new Map(), sources: new Map() };
  knowledge.set(w, k);
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
      events.push({ ...e, x: own.x, y: own.y, angle: undefined });
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
    map: {
      ...w.map,
      zones: w.map.zones.map(({ pads, ...z }) => ({ ...z, pads: [] })),
      patrols: [],
      installations: [...k.fac.values()],
      sources: [...k.sources.values()],
    },
    mission: w.mission,
    time: w.time,
    eventId: w.eventId,
    visibility: w.visibility,
    terrainRevision: w.terrainRevision,
    alertState: { level: w.alertState.level, reason: w.alertState.reason },
    players: w.players.map(({ input, inputAt, ...p }) => p),
    enemies: w.enemies
      .filter((e) => e.hp > 0 && squadSees(w, e))
      .map(({ id, kind, x, y, hp, angle, windup, hurt, state }) => ({
        id,
        kind,
        x,
        y,
        hp,
        angle,
        windup,
        hurt,
        state,
      })),
    events,
    random: 0,
  };
}
