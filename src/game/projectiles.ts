import {
  type World,
  type Player,
  type Enemy,
  type Vec,
  ENEMIES,
} from "../shared/data";
import { event, damagePlayer } from "./simulation";
import { distance, wallDistance, visible } from "./map";
import { armorMultiplier, enemyRadius, armored } from "./armor";
import { noise } from "./perception";
import { raiseAlert } from "./alert";
export function hurtEnemy(w: World, e: Enemy, amount: number, owner?: Player) {
  if (e.hp <= 0) return;
  e.hp -= amount;
  e.hurt = 0.18;
  if (e.hp <= 0) {
    if (owner) owner.kills++;
    event(w, {
      type: "kill",
      x: e.x,
      y: e.y,
      actor: owner?.id,
      kind: e.kind,
      heavy: armored(e.kind),
      angle: e.angle,
    });
    if (armored(e.kind)) {
      w.wrecks.push({
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        angle: e.angle,
        at: w.time,
      });
      w.wrecks = w.wrecks.slice(-32);
      event(w, { type: "explode", x: e.x, y: e.y, heavy: true });
    }
  }
}
export function launch(
  w: World,
  origin: Vec,
  target: Vec,
  kind: "rocket" | "cannon" | "mortar",
  owner: string,
  enemy: boolean,
) {
  if (w.projectiles.length >= 96) return;
  const d = distance(origin, target),
    angle = Math.atan2(target.y - origin.y, target.x - origin.x);
  w.projectiles.push({
    id: "projectile-" + ++w.projectileId,
    kind,
    owner,
    enemy,
    x: origin.x,
    y: origin.y,
    origin: { x: origin.x, y: origin.y },
    target: { x: target.x, y: target.y },
    angle,
    speed: kind === "rocket" ? 850 : kind === "cannon" ? 600 : 0,
    traveled: 0,
    range: kind === "rocket" ? 1050 : d,
    at: w.time,
    impactAt:
      w.time + (kind === "mortar" ? 2.6 : d / (kind === "rocket" ? 850 : 600)),
    damage: kind === "rocket" ? 460 : kind === "cannon" ? 24 : 48,
    radius: kind === "rocket" ? 105 : kind === "cannon" ? 52 : 125,
  });
  event(w, {
    type: "sound",
    cue: kind === "mortar" ? "radio" : "gunfire",
    x: origin.x,
    y: origin.y,
    enemy,
    actor: enemy ? undefined : owner,
    heavy: true,
  });
  noise(w, origin, 1100, "gunfire");
}
export function fireLauncher(w: World, p: Player) {
  if (
    !p.input.tactical ||
    p.rockets <= 0 ||
    p.tacticalCooldown > 0 ||
    p.down ||
    p.input.sprint ||
    p.reload > 0
  )
    return;
  p.rockets--;
  p.tacticalCooldown = 2.4;
  p.cooldown = Math.max(p.cooldown, 0.45);
  launch(
    w,
    p,
    { x: p.x + Math.cos(p.angle) * 1000, y: p.y + Math.sin(p.angle) * 1000 },
    "rocket",
    p.id,
    false,
  );
  raiseAlert(w, 5, "대장갑 발사음", p);
}
function explode(w: World, q: World["projectiles"][number]) {
  const owner = w.players.find((p) => p.id === q.owner);
  if (q.enemy) {
    for (const p of w.players)
      if (
        p.connected &&
        !p.down &&
        distance(p, q) < q.radius &&
        visible(q, p, w.map)
      )
        damagePlayer(
          w,
          p,
          q.damage * Math.max(0.3, 1 - distance(p, q) / q.radius),
        );
  } else {
    for (const e of w.enemies)
      if (
        e.hp > 0 &&
        distance(e, q) < q.radius + enemyRadius(e.kind) &&
        visible(q, e, w.map)
      ) {
        const amount =
          q.damage *
          (armored(e.kind) ? 1 : 0.22) *
          Math.max(
            0.3,
            1 - Math.max(0, distance(e, q) - enemyRadius(e.kind)) / q.radius,
          ) *
          armorMultiplier(e, q.origin, 1, true);
        hurtEnemy(w, e, amount, owner);
        event(w, {
          type: "hit",
          x: e.x,
          y: e.y,
          actor: owner?.id,
          damage: amount,
          heavy: true,
        });
      }
    for (const d of w.map.installations)
      if (d.hp > 0 && distance(d, q) < q.radius && visible(q, d, w.map))
        d.hp = Math.max(0, d.hp - q.damage * 0.65);
  }
  event(w, { type: "explode", x: q.x, y: q.y, heavy: true });
  noise(w, q, 1300, "destruction");
}
export function tickProjectiles(w: World, dt: number) {
  const keep: World["projectiles"] = [];
  for (const q of w.projectiles) {
    if (q.kind === "mortar") {
      // Fixed observed coordinate. It never follows a player after launch.
      if (w.time >= q.impactAt) {
        q.x = q.target.x;
        q.y = q.target.y;
        explode(w, q);
      } else keep.push(q);
      continue;
    }
    const step = Math.min(q.speed * dt, q.range - q.traveled),
      wall = wallDistance(q, q.angle, step, w.map),
      dir = { x: Math.cos(q.angle), y: Math.sin(q.angle) };
    let travel = wall,
      contact = false;
    const actors = q.enemy
      ? w.players.filter((p) => p.connected && !p.down)
      : w.enemies.filter((e) => e.hp > 0);
    for (const a of actors) {
      const dx = a.x - q.x,
        dy = a.y - q.y,
        along = dx * dir.x + dy * dir.y,
        perp = Math.abs(dx * dir.y - dy * dir.x),
        r = "kind" in a ? enemyRadius(a.kind) : 16;
      if (along >= 0 && perp < r) {
        const hit = Math.max(0, along - Math.sqrt(r * r - perp * perp));
        if (hit <= travel) {
          travel = hit;
          contact = true;
        }
      }
    }
    q.x += dir.x * travel;
    q.y += dir.y * travel;
    q.traveled += travel;
    if (contact || wall < step - 0.01 || q.traveled >= q.range - 0.01)
      explode(w, q);
    else keep.push(q);
  }
  w.projectiles = keep;
  w.wrecks = w.wrecks.filter((r) => w.time - r.at < 180);
}
