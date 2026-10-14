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
/** Observes authoritative state and emits normal input only; no teleport/damage/timer shortcuts. */
export class Pilot {
  path: Vec[] = [];
  navMap: World["map"] | null = null;
  navRun = "";
  goal: Vec | null = null;
  repath = 0;
  input(w: World, p: Player, index = 0): Input {
    if (this.navRun !== w.id) {
      this.navMap = w.map;
      this.navRun = w.id;
      this.path = [];
      this.goal = null;
    }
    const input = emptyInput();
    if (p.down) return input;
    const m = w.mission,
      encounter = m.encounters[m.checkpoint];
    let goal: Vec =
      m.stage === "extract"
        ? w.map.extract
        : encounter
          ? w.map.zones[encounter.zone].center
          : w.map.core;
    const guards = encounter
      ? w.enemies.filter((e) => e.zone === encounter.zone && e.hp > 0)
      : [];
    if (guards.length)
      goal = guards.sort((a, b) => distance(p, a) - distance(p, b))[
        index % Math.min(2, guards.length)
      ];
    const fallen = w.players.find((v) => v.down && v.connected);
    const medic = fallen
      ? w.players
          .filter((v) => v.connected && !v.down)
          .sort((a, b) => distance(a, fallen) - distance(b, fallen))[0]
      : undefined;
    const down = medic?.id === p.id ? fallen : undefined;
    const supply = w.map.supplies
      .filter((s) => !s.used)
      .sort((a, b) => distance(p, a) - distance(p, b))[0];
    if (
      supply &&
      (p.hp < 58 || p.reserve < WEAPONS[p.weapon].reserve * 0.15) &&
      distance(p, supply) < 1000 &&
      (m.stage !== "extract" || distance(p, supply) < 220)
    )
      goal = supply;
    if (
      m.checkpoint >= 7 &&
      m.checkpoint <= 8 &&
      guards.length < 3 &&
      !m.intel &&
      distance(p, w.map.intel) < 700
    )
      goal = w.map.intel;
    if (down) goal = down;
    else if (fallen) {
      const threat = w.enemies
        .filter((e) => e.hp > 0 && distance(e, fallen) < 650)
        .sort((a, b) => distance(p, a) - distance(p, b))[0];
      goal = threat ?? {
        x: fallen.x + (index % 2 ? 130 : -130),
        y: fallen.y + 100,
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
    const device =
      m.stage === "destroy" &&
      !fallen &&
      w.players
        .filter((v) => v.connected)
        .every((v) => !v.down && distance(v, w.map.core) < 550)
        ? w.map.devices
            .filter((d) => d.hp > 0)
            .sort((a, b) => distance(p, a) - distance(p, b))[0]
        : undefined;
    if (device && !target && !down && goal !== supply) goal = device;
    const shot =
      target ??
      (device &&
      visible(p, device, w.map) &&
      distance(p, device) < WEAPONS[p.weapon].range * 0.7
        ? device
        : undefined);
    input.fire = !!shot && p.recoil < (p.weapon === "sg" ? 0.12 : 0.075);
    input.aim = !!shot && p.weapon !== "smg";
    input.angle = shot ? Math.atan2(shot.y - p.y, shot.x - p.x) : p.angle;
    input.reload = p.ammo < (shot ? 1 : WEAPONS[p.weapon].mag * 0.45);
    if (goal === supply && distance(p, goal) < 85) input.interact = true;
    if (goal === w.map.intel && distance(p, goal) < 85) input.interact = true;
    if (down && distance(p, down) < 75 && visible(p, down, w.map)) {
      input.revive = true;
      input.fire = false;
      return input;
    }
    const stop =
      goal === device
        ? 130
        : goal === target
          ? WEAPONS[p.weapon].range * 0.42
          : m.stage === "extract"
            ? 50
            : goal === supply || goal === w.map.intel
              ? 65
              : 35;
    if (distance(p, goal) > stop) {
      if (
        !this.goal ||
        distance(this.goal, goal) > 50 ||
        --this.repath <= 0 ||
        !this.path.length
      ) {
        this.path = findPath(p, goal, this.navMap!);
        this.repath = 16;
        this.goal = { ...goal };
      }
      while (this.path.length && distance(p, this.path[0]) < 42)
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
        !blocked(goal, w.map.obstacles, 20)
          ? goal
          : this.path[0];
      if (point) {
        const d = distance(p, point);
        input.dx = (point.x - p.x) / Math.max(1, d);
        input.dy = (point.y - p.y) / Math.max(1, d);
        input.sprint = !shot;
      }
    }
    const danger = w.enemies
      .filter((e) => e.hp > 0 && visible(p, e, w.map))
      .find(
        (e) =>
          e.windup > 0 &&
          distance(p, e) < ENEMIES[e.kind].range &&
          Math.abs(
            (p.x - e.x) * Math.sin(e.angle) - (p.y - e.y) * Math.cos(e.angle),
          ) < 48,
      );
    if (danger && !input.interact && !input.revive) {
      const side = { x: -Math.sin(danger.angle), y: Math.cos(danger.angle) };
      const intent =
        Math.hypot(input.dx, input.dy) > 0
          ? { x: input.dx, y: input.dy }
          : { x: goal.x - p.x, y: goal.y - p.y };
      const dot = side.x * intent.x + side.y * intent.y;
      const sign = Math.abs(dot) > 0.001 ? Math.sign(dot) : index % 2 ? 1 : -1;
      const dx = side.x * sign,
        dy = side.y * sign;
      if (
        !blocked({ x: p.x + dx * 50, y: p.y + dy * 50 }, w.map.obstacles, 20)
      ) {
        input.dx = dx;
        input.dy = dy;
        input.sprint = false;
      }
    }
    if (m.stage === "extract" && !fallen && distance(p, w.map.extract) > 170) {
      input.sprint = true;
      input.aim = false;
      input.fire = false;
    }
    return input;
  }
}
