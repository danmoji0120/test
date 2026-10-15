import type { GameEvent, World } from "../shared/data";
import { distance } from "../game/map";
import { squadSees } from "../game/visibility";
/** One sanitized team view; never transmit hidden enemy paths, beliefs or exact sound origins. */
export function visibleWorld(w: World) {
  const events: GameEvent[] = [];
  for (const e of w.events) {
    const own = w.players.some((p) => p.id === e.actor);
    if (own || squadSees(w, e)) events.push(e);
    else if ((e.type === "shot" || e.type === "alarm") && !e.pellet) {
      const hear = w.players
        .filter((p) => p.connected && !p.down)
        .some((p) => distance(p, e) < 1100);
      if (hear)
        events.push({
          id: e.id,
          type: "sound",
          x: Math.floor(e.x / 400) * 400 + 200,
          y: Math.floor(e.y / 400) * 400 + 200,
          enemy: true,
          cue: e.type === "shot" ? "gunfire" : "radio",
        });
    }
  }
  return {
    id: w.id,
    map: w.map,
    mission: w.mission,
    time: w.time,
    eventId: w.eventId,
    visibility: w.visibility,
    alertState: { level: w.alertState.level, reason: w.alertState.reason },
    players: w.players.map(({ input, inputAt, ...p }) => p),
    enemies: w.enemies
      .filter((e) => e.hp > 0 && squadSees(w, e))
      .map(
        ({
          path,
          home,
          lastSeen,
          target,
          tactical,
          patrol,
          heardNoise,
          radio,
          ...e
        }) => e,
      ),
    events,
    random: 0,
  };
}
