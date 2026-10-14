import {
  WEAPONS,
  ENEMIES,
  emptyInput,
  type World,
  type Player,
  type Vec,
  type Input,
} from "../src/shared/data";
import { distance, visible, findPath, blocked } from "../src/game/map";
/** Test driver: reads public state and produces exactly the same input fields as a human client. */
export class Pilot {
  path: Vec[] = [];
  goal: Vec | null = null;
  repath = 0;
  input(w: World, p: Player, index = 0): Input {
    const input = emptyInput();
    if (p.down) return input;
    const m = w.mission;
    let goal: Vec =
      m.stage === "infiltrate"
        ? (w.map.relays[m.relays.findIndex((v) => v < 6)] ?? w.map.core)
        : m.stage === "extract"
          ? w.map.extract
          : w.map.core;
    const down = w.players.find((v) => v.down && v.connected);
    if (down) goal = down;
    const supply = w.map.supplies
      .filter((s) => !s.used)
      .sort((a, b) => distance(p, a) - distance(p, b))[0];
    if (
      !down &&
      supply &&
      (p.hp < 65 || p.reserve < 40) &&
      distance(p, supply) < 650
    )
      goal = supply;
    if (!down && !m.intel && m.stage === "plant") goal = w.map.intel;
    if (
      m.stage === "defend" &&
      !down &&
      !(supply && (p.hp < 65 || p.reserve < 40) && distance(p, supply) < 650)
    ) {
      goal = {
        x: w.map.core.x - 100 + index * 65,
        y: w.map.core.y + 100 + (index % 2) * 60,
      };
    }
    const enemies = w.enemies
      .filter(
        (e) =>
          e.hp > 0 &&
          distance(p, e) < WEAPONS[p.weapon].range * 0.95 &&
          visible(p, e, w.map),
      )
      .sort((a, b) => distance(p, a) - distance(p, b));
    const target = enemies[0];
    input.fire = !!target && p.recoil < 0.085;
    input.aim = !!target;
    if (target) input.angle = Math.atan2(target.y - p.y, target.x - p.x);
    else input.angle = p.angle;
    input.reload = p.ammo < (target ? 1 : WEAPONS[p.weapon].mag * 0.6);
    input.interact = distance(p, goal) < 75 && m.stage !== "defend";
    if (goal === supply && distance(p, goal) < 85) input.interact = true;
    if (down && distance(p, down) < 75) {
      input.revive = true;
      input.fire = false;
      input.interact = false;
      return input;
    }
    const stop = m.stage === "extract" ? 55 : m.stage === "defend" ? 35 : 65;
    if (distance(p, goal) > stop) {
      this.repath--;
      if (
        !this.goal ||
        distance(this.goal, goal) > 40 ||
        this.repath <= 0 ||
        !this.path.length
      ) {
        this.path = findPath(p, goal, w.map);
        this.repath = 12;
        this.goal = { ...goal };
      }
      while (this.path.length && distance(p, this.path[0]) < 10)
        this.path.shift();
      const point =
        visible(p, goal, w.map) &&
        visible(
          { x: p.x - 20, y: p.y - 20 },
          { x: goal.x - 20, y: goal.y - 20 },
          w.map,
        ) &&
        visible(
          { x: p.x + 20, y: p.y + 20 },
          { x: goal.x + 20, y: goal.y + 20 },
          w.map,
        ) &&
        !blocked(goal, w.map.obstacles, 19)
          ? goal
          : this.path[0];
      if (point) {
        const d = distance(p, point);
        input.dx = (point.x - p.x) / Math.max(1, d);
        input.dy = (point.y - p.y) / Math.max(1, d);
        input.sprint = !target;
      }
    }
    const danger = enemies.find(
      (e) =>
        e.windup > 0 &&
        distance(p, e) < ENEMIES[e.kind].range &&
        Math.abs(
          (p.x - e.x) * Math.sin(e.angle) - (p.y - e.y) * Math.cos(e.angle),
        ) < 42,
    );
    if (danger && !input.interact) {
      const sign = index % 2 ? 1 : -1;
      const dx = -Math.sin(danger.angle) * sign,
        dy = Math.cos(danger.angle) * sign;
      if (
        !blocked({ x: p.x + dx * 45, y: p.y + dy * 45 }, w.map.obstacles, 18)
      ) {
        input.dx = dx;
        input.dy = dy;
      }
    }
    return input;
  }
}
