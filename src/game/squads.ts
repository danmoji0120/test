import { attackDefenseFacility } from "./facility-defense";
import { clearShot, peekPosition } from "./cover";
import { ballisticDistance } from "./ballistics";
import { updateAim, firingAngle } from "./aim-controller";
import { strategicAI } from "./strategic";
import { special } from "./armor";
import { heavyAI } from "./heavy-ai";
import { lineOfSight } from "./visibility";
import { ENEMIES, type World, type Vec, type Player } from "../shared/data";
import {
  distance,
  wallDistance,
  move,
  blocked,
  findPath,
  visible,
} from "./map";
import { event, random, damagePlayer } from "./simulation";
import { perceive, transition } from "./perception";
import { difficulty } from "../shared/difficulty";
import { raiseAlert } from "./alert";
export function enemyAI(w: World, dt: number) {
  const config = difficulty(w.difficulty, w.players.length);
  const live = w.players.filter((p) => p.connected && !p.down);
  const livingSquads = new Set(
    w.enemies.filter((e) => e.hp > 0).map((e) => e.squad),
  );
  for (const id of Object.keys(w.squads))
    if (!livingSquads.has(id)) delete w.squads[id];
  for (const squad of Object.values(w.squads))
    if (!w.enemies.some((e) => e.id === squad.leader && e.hp > 0))
      squad.leader =
        w.enemies.find((e) => e.squad === squad.id && e.hp > 0)?.id ?? "";
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    const spec = ENEMIES[e.kind];
    e.cooldown -= dt;
    e.repath -= dt;
    e.hurt = Math.max(0, e.hurt - dt);
    e.memory = Math.max(0, e.memory - dt);
    e.alert = Math.max(0, e.alert - dt);
    e.stagger = Math.max(0, e.stagger - dt);
    if (e.stagger > 0) continue;
    e.radio = Math.max(0, e.radio - dt);
    if (e.reserve) {
      if (live.some((p) => lineOfSight(e, p, w.map, 450)) || e.hurt > 0)
        e.reserve = false;
      else continue;
    }
    if (e.traveling) continue;
    if (attackDefenseFacility(w, e, live, dt)) continue;
    if (strategicAI(w, e, dt)) continue;
    const target = perceive(w, e, live, dt);
    const acquired = special(e.kind) ? false : updateAim(w, e, target, dt);
    const squad = w.squads[e.squad];
    if (
      target &&
      squad?.leader === e.id &&
      w.time - squad.callAt > config.interval * 0.65 &&
      e.stateTime > 1.5
    ) {
      transition(e, "REQUEST_SUPPORT");

      squad.callAt = w.time;
      w.supportSignals = w.supportSignals.slice(-31);
      w.supportSignals.push({
        id: "call-" + e.id + "-" + Math.floor(w.time),
        squad: e.squad,
        target: { ...e.lastSeen! },
        at: w.time,
      });
    }
    if (special(e.kind)) {
      heavyAI(w, e, target, dt);
      continue;
    }
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0 && target && !acquired) e.windup = dt;
      if (e.windup <= 0) {
        const shotAngle = firingAngle(w, e);
        let len = ballisticDistance(w, e, shotAngle, spec.range);
        let victim: Player | undefined;
        for (const p of live) {
          const dx = p.x - e.x,
            dy = p.y - e.y,
            along = dx * Math.cos(shotAngle) + dy * Math.sin(shotAngle),
            perp = Math.abs(
              dx * Math.sin(shotAngle) - dy * Math.cos(shotAngle),
            );
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
          toX: e.x + Math.cos(shotAngle) * len,
          toY: e.y + Math.sin(shotAngle) * len,
          enemy: true,
        });
        if ((e.kind === "heavy" || e.kind === "rifle") && e.burst < 2) {
          e.burst++;
          e.windup = e.kind === "rifle" ? 0.16 : 0.14;
        } else {
          e.burst = 0;
          e.cooldown = spec.delay * (e.elite ? 0.72 : 1);
        }
      }
      if (e.windup > 0 && e.kind === "heavy") continue;
    }
    const shotOpen = target && clearShot(w, e, target);
    const inRange = target && distance(e, target) < spec.range;
    if (inRange && shotOpen && e.cooldown <= 0 && e.windup <= 0) {
      e.windup = spec.windup * config.reaction * (e.elite ? 0.8 : 1);
      // Lock the firing direction before locomotion can turn the sprite.
      if (e.kind === "heavy") continue;
    }
    e.assignment ??=
      e.kind === "heavy"
        ? "suppress"
        : e.role === "flank"
          ? Number(e.id.slice(1)) % 2
            ? "flank"
            : "intercept"
          : w.map.installations.some(
                (d) => d.hp > 0 && distance(e.home, d) < 420,
              ) && Number(e.id.slice(1)) % 3 === 0
            ? "guard"
            : "assault";
    let goal: Vec | undefined;
    if (e.memory > 0 && e.lastSeen) {
      goal = { ...e.lastSeen };
      if (!target && e.state === "PURSUE" && squad) {
        const lead = Math.min(150, Math.max(0, w.time - e.seenAt) * 80),
          anticipated = {
            x: goal.x + squad.direction.x * lead,
            y: goal.y + squad.direction.y * lead,
          };
        if (!blocked(anticipated, w.map.obstacles, 22)) goal = anticipated;
      }
      if (e.repath <= 0) {
        const angle = Math.atan2(goal.y - e.y, goal.x - e.x);
        if (e.role === "flank" && distance(e, goal) > 160) {
          const side = Number(e.id.slice(1)) % 2 ? 1 : -1;
          // A* chooses an actual bypass; candidates on walls are discarded.
          for (const offset of e.elite ? [360, 260, 180] : [260, 180, 100]) {
            const candidate = {
              x: goal.x - Math.sin(angle) * offset * side,
              y: goal.y + Math.cos(angle) * offset * side,
            };
            if (
              !blocked(candidate, w.map.obstacles, 22) &&
              candidate.x > 40 &&
              candidate.y > 40 &&
              candidate.x < w.map.width - 40 &&
              candidate.y < w.map.height - 40
            ) {
              goal = candidate;
              break;
            }
          }
        } else if (e.kind !== "rush" && target && distance(e, target) > 180) {
          // Peekable corners beside nearby solid cover give rifle/anchor roles firing positions.
          const candidates: Vec[] = [];
          for (const o of w.map.obstacles) {
            if (distance(e, { x: o.x + o.w / 2, y: o.y + o.h / 2 }) > 430)
              continue;
            candidates.push(
              ...[
                { x: o.x - 35, y: o.y - 35 },
                { x: o.x + o.w + 35, y: o.y - 35 },
                { x: o.x - 35, y: o.y + o.h + 35 },
                { x: o.x + o.w + 35, y: o.y + o.h + 35 },
              ].filter(
                (v) =>
                  distance(v, target) > 190 &&
                  distance(v, target) < spec.range * 0.9 &&
                  !blocked(v, w.map.obstacles, 22) &&
                  visible(v, target, w.map),
              ),
            );
          }
          candidates.sort((a, b) => distance(e, a) - distance(e, b));
          if (candidates[0]) goal = candidates[0];
          else if (e.role === "anchor" && inRange) goal = { x: e.x, y: e.y };
        }
        if (e.kind !== "rush" && target && distance(e, target) < 160) {
          const candidate = {
            x: e.x - Math.cos(angle) * 130,
            y: e.y - Math.sin(angle) * 130,
          };
          if (!blocked(candidate, w.map.obstacles, 22)) goal = candidate;
        }
        e.tactical = goal;
      } else goal = e.tactical ?? goal;
    } else {
      e.target = null;
      e.tactical = null;
      if (e.state === "RETURN") goal = e.home;
      else {
        if (!e.patrol.length)
          e.patrol = [{ ...e.home }, { x: e.home.x + 80, y: e.home.y + 70 }];
        goal = e.patrol[e.patrolIndex % e.patrol.length];
        if (distance(e, goal) < 45) {
          e.patrolIndex = (e.patrolIndex + 1) % e.patrol.length;
          goal = e.patrol[e.patrolIndex];
        }
      }
    }
    if (e.hp < spec.hp * 0.35 && !target && e.memory > 0) {
      const buddy = w.enemies
        .filter(
          (o) => o.id !== e.id && o.squad === e.squad && o.hp > spec.hp * 0.35,
        )
        .sort((a, b) => distance(e, a) - distance(e, b))[0];
      if (buddy) {
        transition(e, "REGROUP");
        goal = { x: buddy.x, y: buddy.y };
      }
    }
    if (target && !shotOpen && e.repath <= 0)
      goal = peekPosition(w, e, target) ?? goal;
    if (goal && e.lastSeen && e.memory > 0) {
      if (
        e.assignment === "guard" &&
        distance(goal, e.home) > config.guardLeash
      )
        goal = { ...e.home };
      else if (
        e.assignment === "intercept" &&
        squad?.confidence === "seen" &&
        w.time - squad.observedAt < 3
      ) {
        const v = squad.direction,
          speed = Math.hypot(v.x, v.y),
          scale = Math.min(1, 240 / Math.max(1, speed));
        const intercept = {
          x: e.lastSeen.x + v.x * scale * config.interceptLead,
          y: e.lastSeen.y + v.y * scale * config.interceptLead,
        };
        if (!blocked(intercept, w.map.obstacles, 22)) goal = intercept;
      } else if (
        e.assignment === "suppress" &&
        shotOpen &&
        target &&
        distance(e, target) > 250 &&
        distance(e, target) < spec.range * 0.9 &&
        !w.map.obstacles.some(
          (o) => distance(e, { x: o.x + o.w / 2, y: o.y + o.h / 2 }) < 430,
        )
      )
        goal = { x: e.x, y: e.y };
    }
    if (goal && e.repath <= 0) {
      e.path = distance(e, goal) < 30 ? [] : findPath(e, goal, w.map, 19);
      e.repath = 0.65 + random(w) * 0.45;
    }
    if (e.path.length) {
      const point = e.path[0],
        d = distance(e, point);
      if (d < 8) e.path.shift();
      else {
        const speed =
          spec.speed *
          (e.state === "SUSPICIOUS" ? 0.35 : e.memory > 0 ? 1 : 0.5);
        if (!target && e.windup <= 0)
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
      }
    }
  }
  w.enemies = w.enemies.filter((e) => e.hp > 0);
}
