import { ENEMIES, type World, type Enemy, type Player } from "../shared/data";
import { distance } from "./map";
import { lineOfSight } from "./visibility";
import { ballisticDistance } from "./ballistics";
import { rayHit } from "./armor";
import { applyHit } from "./combat";
import { turn } from "./aim-controller";
import { event, random } from "./simulation";
/** Infantry can attack a visible friendly defense structure; no timer-based structure damage. */
export function attackDefenseFacility(
  w: World,
  e: Enemy,
  live: Player[],
  dt: number,
) {
  const o = w.mission.objectives.find(
    (o) =>
      o.action === "defend" && o.phase === "방어 중" && o.state !== "complete",
  );
  if (!o || !["rifle", "rush", "heavy"].includes(e.kind)) return false;
  const d = w.map.installations.find((d) => d.id === o.facilityId)!;
  const spec = ENEMIES[e.kind],
    range = Math.min(650, spec.range);
  if (d.hp <= 0 || distance(e, d) > range || !lineOfSight(e, d, w.map, range))
    return false;
  if (
    live.some(
      (p) =>
        distance(e, p) < distance(e, d) * 0.75 &&
        lineOfSight(e, p, w.map, spec.range),
    )
  )
    return false;
  const wanted = Math.atan2(d.y - e.y, d.x - e.x);
  e.angle = turn(e.angle, wanted, dt * 1.8);
  if (
    Math.abs(
      Math.atan2(Math.sin(e.angle - wanted), Math.cos(e.angle - wanted)),
    ) > 0.12
  ) {
    e.facilityAimAt = w.time + 0.3;
    return true;
  }
  e.facilityAimAt ??= w.time + 0.35;
  if (w.time < e.facilityAimAt || e.cooldown > 0) return true;
  const a = e.angle + (random(w) - 0.5) * 0.06,
    len = ballisticDistance(w, e, a, spec.range, d.id),
    hit = rayHit(d, e, a, len);
  if (hit)
    applyHit(w, d, hit, {
      normal: spec.damage,
      durable: spec.damage * 0.5,
      ap: 2,
    });
  const length = hit?.distance ?? len;
  event(w, {
    type: "shot",
    x: e.x,
    y: e.y,
    toX: e.x + Math.cos(a) * length,
    toY: e.y + Math.sin(a) * length,
    enemy: true,
    impact: !!hit,
  });
  e.cooldown = e.kind === "heavy" ? 0.22 : e.kind === "rifle" ? 0.3 : 0.7;
  return true;
}
