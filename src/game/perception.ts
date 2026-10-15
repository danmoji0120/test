import type { World, Enemy, Player, Vec } from "../shared/data";
import { distance } from "./map";
import { lineOfSight } from "./visibility";
import { raiseAlert } from "./alert";
import { difficulty } from "../shared/difficulty";
export function noise(
  w: World,
  p: Vec,
  radius: number,
  kind: World["noises"][number]["kind"],
) {
  w.noises.push({ id: ++w.noiseId, x: p.x, y: p.y, radius, kind, at: w.time });
  w.noises = w.noises.filter((n) => w.time - n.at < 3).slice(-48);
}
export function perceive(w: World, e: Enemy, live: Player[], dt: number) {
  const seen = live
    .filter((p) => lineOfSight(e, p, w.map, 760))
    .sort((a, b) => distance(e, a) - distance(e, b));
  const target = seen[0];
  e.stateTime += dt;
  if (e.state === "REQUEST_SUPPORT" && e.stateTime > 0.8)
    transition(e, "ENGAGE");
  if (target) {
    if (w.metrics.firstContact < 0) w.metrics.firstContact = w.time;
    e.target = target.id;
    e.lastSeen = { x: target.x, y: target.y };
    e.memory = 9;
    e.seenAt = w.time;
    const squad = w.squads[e.squad];
    if (squad) {
      squad.lastSeen = { ...e.lastSeen };
      squad.direction = { x: target.input.dx, y: target.input.dy };
      squad.observedAt = w.time;
      squad.confidence = "seen";
    }
    if (e.state !== "REQUEST_SUPPORT") transition(e, "ENGAGE");
    if (e.alert <= 0) {
      raiseAlert(w, 12, "병력 접촉", e);
      e.alert = 4;
    }
  } else {
    const heard = w.noises
      .filter(
        (n) =>
          n.id > e.heardNoise &&
          w.time - n.at < 2 &&
          distance(e, n) < n.radius * (lineOfSight(e, n, w.map) ? 1 : 0.5),
      )
      .sort((a, b) => b.id - a.id)[0];
    if (heard) {
      e.heardNoise = heard.id;
      if (e.memory <= 0) {
        e.lastSeen = {
          x: Math.round(heard.x / 160) * 160,
          y: Math.round(heard.y / 160) * 160,
        };
        e.memory = 6;
        transition(e, "SUSPICIOUS");
        raiseAlert(w, 7, "불명음 수색", e);
      }
    } else if (e.state === "SUSPICIOUS" && e.stateTime > 0.6)
      transition(e, "INVESTIGATE");
    else if (e.memory > 0 && e.lastSeen && e.state !== "SUSPICIOUS")
      transition(e, w.time - e.seenAt < 3 ? "PURSUE" : "INVESTIGATE");
    else if (e.memory <= 0) {
      e.target = null;
      transition(e, distance(e, e.home) > 100 ? "RETURN" : "PATROL");
    }
  }
  // Radio transmits a dated coordinate, with decay on each hop. No live player lookup for unseen units.
  if (e.lastSeen && e.memory > 0 && e.radio <= 0) {
    const radius = w.map.installations.some(
      (d) => d.kind === "comms" && d.hp > 0,
    )
      ? difficulty(w.difficulty).radio
      : 320;
    for (const ally of w.enemies) {
      if (
        ally === e ||
        ally.hp <= 0 ||
        ally.reserve ||
        distance(e, ally) > radius
      )
        continue;
      if (ally.memory < e.memory - 0.1) {
        ally.lastSeen = { ...e.lastSeen };
        ally.memory = Math.max(0, e.memory - 0.4);
        ally.repath = 0;
        if (!target) transition(ally, "INVESTIGATE");
      }
    }
    e.radio = 1.6;
  }
  return target;
}
export function transition(e: Enemy, state: Enemy["state"]) {
  if (e.state !== state) {
    e.state = state;
    e.stateTime = 0;
    e.repath = 0;
  }
}
