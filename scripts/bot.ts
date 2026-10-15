import {
  hitRegions,
  worldPoint,
  rayHit,
  armored,
  armorMultiplier,
} from "../src/game/armor";
import {
  WEAPONS,
  ENEMIES,
  emptyInput,
  type World,
  type Player,
  type Vec,
  type Input,
} from "../src/shared/data";
import {
  distance,
  visible,
  findPath,
  blocked,
  movementClear,
  movementBlocked,
} from "../src/game/map";
/** Observes authoritative state and emits normal input only; no teleport/damage/timer shortcuts. */
export class Pilot {
  strategy: "primary" | "all" | "evade" = "primary";
  reverse = false;
  reckless = false;
  avoidArmor = false;
  rearApproach = false;
  rearEntries = new Map<string, Vec>();
  rearReached = new Set<string>();
  navRevision = -1;
  destination: Vec | null = null;
  path: Vec[] = [];
  navMap: World["map"] | null = null;
  navRun = "";
  goal: Vec | null = null;
  repath = 0;
  lastObservation = 0;
  approached = new Set<string>();
  input(w: World, p: Player, index = 0): Input {
    if (this.navRun !== w.id) {
      this.navMap = w.map;
      this.navRun = w.id;
      this.path = [];
      this.goal = null;
      this.approached.clear();
      this.rearEntries.clear();
      this.rearReached.clear();
    }
    if (this.navRevision !== w.terrainRevision) {
      this.navMap = w.map;
      this.navRevision = w.terrainRevision;
      this.path = [];
      this.repath = 0;
    }
    const sample = Math.min(0.6, Math.max(0.1, w.time - this.lastObservation));
    this.lastObservation = w.time;
    const input = emptyInput();
    input.slot = 1;
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
      if (distance(p, zone.entry) < 95) this.approached.add(objective.id);
      goal = this.approached.has(objective.id) ? zone.center : zone.entry;
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
      (p.hp < 58 ||
        p.guns.primary.reserve < WEAPONS[p.primary].reserve * 0.15) &&
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
          distance(p, e) <
            (p.guns.primary.ammo + p.guns.primary.reserve === 0
              ? WEAPONS.pistol.range * 0.95
              : p.primary === "at"
                ? armored(e.kind)
                  ? 950
                  : WEAPONS.pistol.range * 0.95
                : WEAPONS[p.primary ?? p.weapon].range * 0.95) &&
          (!this.avoidArmor || !armored(e.kind) || distance(p, e) < 240) &&
          visible(p, e, w.map),
      )
      .sort((a, b) => distance(p, a) - distance(p, b));
    const target = enemies[0];
    const device =
      objective && objective.kind !== "intel"
        ? w.map.installations.find((d) => d.id === objective.id && d.hp > 0)
        : undefined;
    if (
      this.rearApproach &&
      device &&
      goal !== supply &&
      !fallen &&
      !down &&
      !this.rearReached.has(device.id)
    ) {
      let entry = this.rearEntries.get(device.id);
      if (!entry) {
        for (const turn of [0, 0.4, -0.4, 0.8, -0.8]) {
          const a = (device.angle ?? 0) + Math.PI + turn,
            q = {
              x: device.x + Math.cos(a) * 195,
              y: device.y + Math.sin(a) * 195,
            };
          if (!movementBlocked(q, w.map, 20) && findPath(p, q, w.map).length) {
            entry = q;
            this.rearEntries.set(device.id, q);
            break;
          }
        }
      }
      if (entry) {
        if (distance(p, entry) < 80) this.rearReached.add(device.id);
        else goal = entry;
      }
    }
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
    if (
      target &&
      armored(target.kind) &&
      (p.rockets ?? 0) > 0 &&
      (p.tacticalCooldown ?? 0) <= 0 &&
      distance(p, target) > 140
    ) {
      input.tactical = true;
      input.fire = false;
      input.aim = true;
    }
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
    if (
      target &&
      armored(target.kind) &&
      !this.reckless &&
      (p.rockets ?? 0) <= 0 &&
      armorMultiplier(target, p) < 0.3 &&
      distance(p, target) < 650 &&
      !down
    ) {
      const side = index % 2 ? 1 : -1,
        a = target.angle + Math.PI + side * 0.5;
      const flank = {
        x: target.x + Math.cos(a) * 290,
        y: target.y + Math.sin(a) * 290,
      };
      if (!blocked(flank, w.map.obstacles, 20)) goal = flank;
    }
    if (
      this.destination &&
      !fallen &&
      (index === 0 || distance(p, anchor) < 360)
    )
      goal = this.destination;
    const stop = this.destination
      ? 35
      : goal === supply || objective?.kind === "intel"
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
      while (
        this.path.length &&
        distance(p, this.path[0]) < Math.max(42, 280 * sample * 0.6)
      )
        this.path.shift();
      // String-pull along already validated corridors so slow browser sampling cannot oscillate at50px nodes.
      let forward = this.path[0];
      for (const candidate of this.path.slice(0, 8)) {
        if (distance(p, candidate) > 420) break;
        if (
          movementClear(p, candidate, w.map, 20) &&
          visible(p, candidate, w.map) &&
          visible(
            { x: p.x - 23, y: p.y - 23 },
            { x: candidate.x - 23, y: candidate.y - 23 },
            w.map,
          ) &&
          visible(
            { x: p.x + 23, y: p.y + 23 },
            { x: candidate.x + 23, y: candidate.y + 23 },
            w.map,
          )
        )
          forward = candidate;
        else break;
      }
      const point =
        movementClear(p, goal, w.map, 20) &&
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
          : forward;
      if (point) {
        const d = distance(p, point);
        if (sample > 0.2 && d < 280 * sample * 1.5)
          (input as Input & { holdMs?: number }).holdMs = Math.max(
            45,
            Math.min(220, ((d - 12) / 280) * 1000),
          );
        input.dx = (point.x - p.x) / Math.max(1, d);
        input.dy = (point.y - p.y) / Math.max(1, d);
        input.sprint = !shot && (sample < 0.2 || distance(p, point) > 160);
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
      !this.reckless &&
      !input.interact &&
      !input.revive &&
      !(m.stage === "extract" && distance(p, extract) < 220)
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
      if (movementClear(p, { x: p.x + dx * 50, y: p.y + dy * 50 }, w.map, 20)) {
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
    const shell = (w.projectiles || []).find(
      (q) => q.kind === "mortar" && distance(p, q.target) < q.radius + 45,
    );
    if (shell && !this.reckless && !input.revive) {
      const a =
        Math.atan2(p.y - shell.target.y, p.x - shell.target.x) +
        (index % 2 ? 0.2 : -0.2);
      input.dx = Math.cos(a);
      input.dy = Math.sin(a);
      input.sprint = true;
      input.fire = false;
      input.tactical = false;
    }
    // V4.1 pilot chooses legal slot actions using only public visible targets.
    input.tactical = false;
    if (
      (p.primary === "at" && target && !armored(target.kind)) ||
      p.guns.primary.ammo + p.guns.primary.reserve === 0
    )
      input.slot = 2;
    if (device && !target && !this.reckless) {
      const core = hitRegions(device).find((r) => r.id === "core");
      if (core) {
        const weak = worldPoint(device, core),
          a = device.angle ?? 0;
        const contact = rayHit(
          device,
          p,
          Math.atan2(weak.y - p.y, weak.x - p.x),
          distance(p, weak) + 60,
        );
        input.angle = Math.atan2(weak.y - p.y, weak.x - p.x);
        if (contact && contact.region.av > WEAPONS[p.weapon].penetration) {
          // Next observation routes toward an exposed rear approach, not through armored frontal fire.
          const rear = {
            x: device.x - Math.cos(a) * 135,
            y: device.y - Math.sin(a) * 135,
          };
          if (!blocked(rear, w.map.obstacles, 20)) {
            this.destination = rear;
            input.fire = false;
          }
        } else {
          this.destination = null;
          input.fire = distance(p, device) < WEAPONS[p.weapon].range * 0.8;
        }
      }
    } else if (!this.avoidArmor) this.destination = null;
    if (
      target &&
      armored(target.kind) &&
      p.primary !== "at" &&
      p.consumable === "antiarmor" &&
      p.consumableCount > 0 &&
      distance(p, target) < 230 &&
      !this.reckless
    ) {
      const core = hitRegions(target).find((r) => r.id === "core"),
        point = core ? worldPoint(target, core) : target;
      input.slot = 3;
      input.targetX = point.x;
      input.targetY = point.y;
      input.sprint = false;
      input.fire =
        p.activeSlot === 3 &&
        p.switching <= 0 &&
        (!p.fireHeld || p.useTime > 0);
    } else if (
      target &&
      p.consumable === "smoke" &&
      p.consumableCount > 0 &&
      p.hp < 65 &&
      !this.reckless
    ) {
      input.slot = 3;
      input.targetX = (target.x + p.x) / 2;
      input.targetY = (target.y + p.y) / 2;
      input.sprint = false;
      input.fire =
        p.activeSlot === 3 &&
        p.switching <= 0 &&
        (!p.fireHeld || p.useTime > 0);
    } else if (
      target &&
      p.consumable === "frag" &&
      p.consumableCount > 0 &&
      distance(p, target) < 400 &&
      w.enemies.filter((e) => distance(e, target) < 150).length >= 2 &&
      !this.reckless
    ) {
      input.slot = 3;
      input.targetX = target.x;
      input.targetY = target.y;
      input.sprint = false;
      input.fire =
        p.activeSlot === 3 &&
        p.switching <= 0 &&
        (!p.fireHeld || p.useTime > 0);
    } else if (
      p.hp < 48 &&
      p.consumable === "medical" &&
      p.consumableCount > 0 &&
      !this.reckless
    ) {
      input.slot = 3;
      input.fire =
        p.activeSlot === 3 &&
        p.switching <= 0 &&
        (!p.fireHeld || p.useTime > 0);
      input.sprint = false;
    }
    if (input.slot !== p.activeSlot || p.switching > 0) input.fire = false;
    if (p.useTime > 0) {
      input.slot = 3;
      input.fire = true;
      input.sprint = false;
    }

    return input;
  }
}
