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
  strategy: "primary" | "all" | "evade" = "primary";
  reverse = false;
  navRevision = -1;
  destination: Vec | null = null;
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
    if (this.navRevision !== w.terrainRevision) {
      this.navMap = w.map;
      this.navRevision = w.terrainRevision;
      this.path = [];
      this.repath = 0;
    }
    const input = emptyInput();
    if (p.down) return input;
    const m = w.mission,
      x = m.extraction;
    const anchor = w.players.find((v) => v.connected && !v.down) ?? p;
    const pending = m.objectives.filter(
      (o) => o.state !== "complete" && (this.strategy === "all" || !o.optional),
    );
    pending.sort((a, b) => {
      if (this.strategy === "all" && a.optional !== b.optional)
        return a.optional ? -1 : 1;
      if (this.strategy === "all" && a.kind === "comms") return -1;
      if (this.strategy === "all" && b.kind === "comms") return 1;
      return this.reverse
        ? b.id.localeCompare(a.id)
        : distance(anchor, a.position) - distance(anchor, b.position);
    });
    const objective = pending[0];
    const extract =
      x.site ??
      [...w.map.extractions].sort(
        (a, b) => distance(anchor, a) - distance(anchor, b),
      )[0];
    let goal: Vec = objective ? objective.position : extract;
    if (objective && !objective.discovered) {
      const zone = [...w.map.zones].sort(
        (a, b) =>
          distance(a.center, objective.position) -
          distance(b.center, objective.position),
      )[0];
      goal = distance(p, zone.entry) > 75 ? zone.entry : zone.center;
    }
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
    if (down) goal = down;
    else if (fallen) {
      const threat = w.enemies
        .filter((e) => e.hp > 0 && distance(e, fallen) < 350)
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
      objective && objective.kind !== "intel"
        ? w.map.installations.find((d) => d.id === objective.id && d.hp > 0)
        : undefined;
    const shot =
      target ??
      (device &&
      visible(p, device, w.map) &&
      distance(p, device) < WEAPONS[p.weapon].range * 0.8
        ? device
        : undefined);
    const atIntel =
      objective?.kind === "intel" &&
      distance(p, objective.position) < 85 &&
      visible(p, objective.position, w.map);
    const atExtract =
      !objective && x.state === "available" && distance(p, extract) < 95;
    input.fire = !!shot && p.recoil < (p.weapon === "sg" ? 0.12 : 0.075);
    input.aim = !!shot && p.weapon !== "smg";
    input.angle = shot ? Math.atan2(shot.y - p.y, shot.x - p.x) : p.angle;
    input.reload = p.ammo < (shot ? 1 : WEAPONS[p.weapon].mag * 0.45);
    if (goal === supply && distance(p, goal) < 85) input.interact = true;
    if (atIntel || atExtract) input.interact = true;
    if (
      down &&
      distance(p, down) < 75 &&
      visible(p, down, w.map) &&
      (w.players.filter((v) => v.connected && !v.down).length > 1 ||
        !target ||
        distance(target, down) > 350)
    ) {
      input.revive = true;
      input.fire = false;
      return input;
    }
    if (
      m.stage !== "extract" &&
      index > 0 &&
      !down &&
      distance(p, anchor) > 360
    )
      goal = { x: anchor.x, y: anchor.y };
    if (this.destination && !fallen) goal = this.destination;
    const stop =
      goal === supply || objective?.kind === "intel"
        ? 65
        : !objective || m.stage === "extract"
          ? 90
          : device && visible(p, device, w.map)
            ? Math.min(230, WEAPONS[p.weapon].range * 0.42)
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
        // DOM input is sampled more slowly than simulation pilots. Approach boarding zones at a walk.
        if (m.stage === "extract" && distance(p, goal) < 300)
          input.sprint = false;
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
    if (
      danger &&
      !input.interact &&
      !input.revive &&
      !(m.stage === "extract" && distance(p, extract) < 100)
    ) {
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
    if (
      (m.stage === "extract" || this.strategy === "evade") &&
      !fallen &&
      distance(p, extract) > 170
    ) {
      input.sprint = true;
      input.aim = false;
      input.fire = false;
    }
    return input;
  }
}
