import {
  ENEMIES,
  type World,
  type Enemy,
  type Player,
  type Vec,
} from "../shared/data";
import { distance, wallDistance, move, findPath, blocked } from "./map";
import { event, damagePlayer, random } from "./simulation";
import { enemyRadius } from "./armor";
import { launch } from "./projectiles";
import { difficulty } from "../shared/difficulty";
/** Special weapons commit to a heading/dated point; cover and movement remain server-authoritative. */
export function heavyAI(
  w: World,
  e: Enemy,
  target: Player | undefined,
  dt: number,
) {
  const spec = ENEMIES[e.kind],
    radius = enemyRadius(e.kind),
    r = target ? distance(e, target) : Infinity;
  if (e.windup > 0) {
    e.windup -= dt;
    if (e.windup <= 0) {
      e.phase = "firing";
      if (e.kind === "walker") {
        const point = {
          x: e.x + Math.cos(e.angle) * spec.range,
          y: e.y + Math.sin(e.angle) * spec.range,
        };
        launch(w, e, point, "cannon", e.id, true);
      } else if (e.kind === "artillery" && e.attackPoint) {
        launch(w, e, e.attackPoint, "mortar", e.id, true);
        e.attackPoint = null;
      } else {
        let len = wallDistance(e, e.angle, spec.range, w.map),
          victim: Player | undefined;
        for (const p of w.players.filter((p) => p.connected && !p.down)) {
          const dx = p.x - e.x,
            dy = p.y - e.y,
            along = dx * Math.cos(e.angle) + dy * Math.sin(e.angle),
            perp = Math.abs(dx * Math.sin(e.angle) - dy * Math.cos(e.angle));
          if (along > 0 && along < len && perp < 17) {
            len = along;
            victim = p;
          }
        }
        if (victim) damagePlayer(w, victim, spec.damage);
        event(w, {
          type: "shot",
          x: e.x,
          y: e.y,
          toX: e.x + Math.cos(e.angle) * len,
          toY: e.y + Math.sin(e.angle) * len,
          enemy: true,
          kind: e.kind,
          heavy: e.kind === "juggernaut",
          angle: e.angle,
        });
      }
      const shots =
        e.kind === "juggernaut"
          ? 14
          : e.kind === "walker"
            ? 5
            : e.kind === "drone"
              ? 2
              : 1;
      if (++e.burst < shots)
        e.windup =
          e.kind === "walker" ? 0.17 : e.kind === "juggernaut" ? 0.085 : 0.16;
      else {
        e.burst = 0;
        e.cooldown = spec.delay;
        e.phase = "overheat";
      }
    }
    if (e.kind !== "drone") return;
  }
  const observation = e.lastSeen && e.memory > 0 ? e.lastSeen : null;
  const canFire =
    e.kind === "artillery"
      ? e.reportKind === "seen" &&
        w.time - (e.reportAt ?? -100) < 10 &&
        observation &&
        distance(e, observation) > 380 &&
        distance(e, observation) < spec.range
      : target && r < spec.range;
  if (canFire && e.cooldown <= 0 && e.windup <= 0) {
    const point = e.kind === "artillery" ? observation! : target!;
    e.angle =
      Math.atan2(point.y - e.y, point.x - e.x) +
      (random(w) - 0.5) * (e.kind === "juggernaut" ? 0.08 : 0.035);
    e.attackPoint = { x: point.x, y: point.y };
    e.windup =
      spec.windup *
      (e.kind === "drone" ? difficulty(w.difficulty).reaction : 1);
    e.phase = "spinup";
    event(w, {
      type: "sound",
      cue: e.kind === "drone" ? "radio" : "engine",
      x: e.x,
      y: e.y,
      enemy: true,
      heavy: true,
      kind: e.kind,
    });
    if (e.kind !== "drone") return;
  }
  if (e.cooldown <= 0 && e.windup <= 0) e.phase = "ready";
  let goal: Vec | undefined;
  if (observation) {
    const range = distance(e, observation),
      desired =
        e.kind === "drone"
          ? 520
          : e.kind === "artillery"
            ? 1050
            : e.kind === "walker"
              ? 600
              : 500;
    if (
      (!target && e.kind !== "artillery" && range > 90) ||
      range > desired + 100
    )
      goal = observation;
    else if (range < desired * 0.5) {
      const a = Math.atan2(observation.y - e.y, observation.x - e.x);
      goal = { x: e.x - Math.cos(a) * 180, y: e.y - Math.sin(a) * 180 };
    } else if (e.kind === "drone") {
      const a = Math.atan2(e.y - observation.y, e.x - observation.x) + 0.4;
      goal = {
        x: observation.x + Math.cos(a) * desired,
        y: observation.y + Math.sin(a) * desired,
      };
    }
  } else {
    const route = e.patrol.length ? e.patrol : [e.home];
    goal = route[e.patrolIndex % route.length];
    if (distance(e, goal) < 45)
      e.patrolIndex = (e.patrolIndex + 1) % route.length;
  }
  if (goal && !blocked(goal, w.map.obstacles, radius) && e.repath <= 0) {
    e.path = findPath(e, goal, w.map, radius);
    e.repath = 1.1 + random(w) * 0.4;
  }
  if (!goal) e.path = [];
  while (e.path.length && distance(e, e.path[0]) < 8) e.path.shift();
  const point = e.path[0];
  if (!point) return;
  const d = distance(e, point),
    step = Math.min(d, spec.speed * dt * (observation ? 1 : 0.55));
  if (!target) e.angle = Math.atan2(point.y - e.y, point.x - e.x);
  move(
    e,
    ((point.x - e.x) / d) * step,
    ((point.y - e.y) / d) * step,
    w.map,
    radius,
  );
  if (Math.floor((w.time - dt) / 1.1) !== Math.floor(w.time / 1.1))
    event(w, {
      type: "sound",
      cue: e.kind === "walker" ? "steps" : "engine",
      x: e.x,
      y: e.y,
      enemy: true,
      heavy: true,
      kind: e.kind,
    });
}
