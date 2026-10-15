import { ENEMIES, type Enemy, type Vec } from "../shared/data";
export const enemyRadius = (kind: Enemy["kind"]) =>
  kind === "walker"
    ? 54
    : kind === "artillery"
      ? 50
      : kind === "juggernaut"
        ? 26
        : kind === "drone"
          ? 14
          : 19;
export const enemyHeight = (kind: Enemy["kind"]) =>
  kind === "walker"
    ? 146
    : kind === "artillery"
      ? 126
      : kind === "juggernaut"
        ? 88
        : kind === "drone"
          ? 47
          : kind === "heavy"
            ? 66
            : 60;
export const special = (kind: Enemy["kind"]) =>
  ["juggernaut", "drone", "walker", "artillery"].includes(kind);
export const armored = (kind: Enemy["kind"]) =>
  ["juggernaut", "walker", "artillery"].includes(kind);
export const forceWeight = (kind: Enemy["kind"]) =>
  kind === "walker"
    ? 5
    : kind === "artillery"
      ? 4
      : kind === "juggernaut"
        ? 2
        : 1;

import type { Installation, PartId, ComponentState } from "../shared/data";
export interface HitRegion {
  id: PartId;
  x: number;
  y: number;
  radius: number;
  av: number;
  durability: number;
  hp: number;
  contribution: number;
  weak: number;
  effect?: "mobility" | "weapon" | "burst" | "shield";
}
export type ArmoredTarget = Enemy | Installation;
export const penetrationMultiplier = (ap: number, av: number) =>
  ap < av ? 0 : ap === av ? 0.65 : 1;
export function localPoint(t: ArmoredTarget, p: Vec): Vec {
  const a = t.angle ?? 0,
    c = Math.cos(a),
    s = Math.sin(a),
    x = p.x - t.x,
    y = p.y - t.y;
  return { x: x * c + y * s, y: -x * s + y * c };
}
export function worldPoint(t: ArmoredTarget, p: Vec): Vec {
  const a = t.angle ?? 0,
    c = Math.cos(a),
    s = Math.sin(a);
  return { x: t.x + p.x * c - p.y * s, y: t.y + p.x * s + p.y * c };
}
const region = (
  id: PartId,
  x: number,
  y: number,
  radius: number,
  av: number,
  durability: number,
  hp = 0,
  contribution = 1,
  weak = 1,
  effect?: HitRegion["effect"],
): HitRegion => ({
  id,
  x,
  y,
  radius,
  av,
  durability,
  hp,
  contribution,
  weak,
  effect,
});
/** Exposed components protrude from the hull. Nearest ray intersection wins; a frontal ray cannot pick a rear component through the hull. */
export function hitRegions(t: ArmoredTarget): HitRegion[] {
  if ("maxHp" in t) {
    if (t.kind !== "generator") return [region("body", 0, 0, 32, 1, 0.45)];
    return [
      region("body", 0, 0, 30, 3, 0.8),
      region("shield", 24, 0, 19, 3, 0.85, 190, 0, 1, "shield"),
      region("core", -26, 0, 16, 0, 0.35, 0, 1, 1.1),
    ];
  }
  const r = enemyRadius(t.kind);
  if (t.kind === "walker")
    return [
      region("body", 0, 0, r * 0.8, 4, 0.95),
      region("core", -r * 0.82, 0, r * 0.33, 2, 0.9, 420, 0.95, 1, "mobility"),
      region(
        "weapon",
        r * 0.55,
        -r * 0.6,
        r * 0.28,
        2,
        0.75,
        190,
        0.45,
        1,
        "weapon",
      ),
    ];
  if (t.kind === "artillery")
    return [
      region("body", 0, 0, r * 0.82, 4, 0.95),
      region("core", -r * 0.84, 0, r * 0.32, 2, 0.9, 260, 0.85, 1, "mobility"),
      region(
        "weapon",
        r * 0.3,
        -r * 0.65,
        r * 0.3,
        2,
        0.8,
        190,
        0.65,
        1,
        "weapon",
      ),
    ];
  if (t.kind === "juggernaut")
    return [
      region("body", 0, 0, r * 0.85, 2, 0.35),
      region("front", r * 0.5, 0, r * 0.65, 3, 0.6),
      region("core", -r * 0.8, 0, r * 0.42, 1, 0.5, 110, 0.9, 1.15, "burst"),
    ];
  if (t.kind === "drone") return [region("body", 0, 0, r, 1, 0.6)];
  return [
    region(
      "body",
      0,
      0,
      20,
      t.kind === "heavy" ? 2 : 1,
      t.kind === "heavy" ? 0.18 : 0.05,
    ),
    region("head", 4, -17, 9, 0, 0, 0, 1, 1.65),
  ];
}
export function ensureComponents(t: ArmoredTarget) {
  t.components ??= {};
  for (const r of hitRegions(t))
    if (r.hp > 0 && !t.components[r.id])
      t.components[r.id] = { hp: r.hp, maxHp: r.hp, destroyed: false };
  return t.components;
}
/** Hull armor varies by the actual contact normal, never the shooter's distant position. */
export function armorAt(
  t: ArmoredTarget,
  part: HitRegion,
  point: Vec,
): HitRegion {
  const p = localPoint(t, point),
    r = { ...part };
  if (part.id === "body" && "kind" in t && !("maxHp" in t) && armored(t.kind)) {
    const front = p.x > Math.abs(p.y) * 0.7;
    const rear = p.x < -Math.abs(p.y) * 0.7;
    r.av =
      t.kind === "juggernaut"
        ? front
          ? 3
          : rear
            ? 1
            : 2
        : front
          ? 5
          : rear
            ? 3
            : 4;
  }
  const c = t.components?.[part.id];
  if (c?.destroyed) {
    r.durability = 1;
    r.contribution = part.id === "shield" ? 0 : 0.65;
    r.weak = 1;
  }
  // Destroyed shielding exposes its sector; side/rear approaches were always possible.
  if (
    "maxHp" in t &&
    t.kind === "generator" &&
    t.components?.shield?.destroyed &&
    part.id !== "core"
  ) {
    r.av = 1;
    r.durability = 0.4;
    r.contribution = 1;
  }
  return r;
}
export interface RayHit {
  distance: number;
  point: Vec;
  region: HitRegion;
}
export function rayHit(
  t: ArmoredTarget,
  origin: Vec,
  angle: number,
  max: number,
): RayHit | null {
  const rmax = "maxHp" in t ? 48 : enemyRadius(t.kind) * 1.25 + 8;
  const ex = t.x - origin.x,
    ey = t.y - origin.y,
    along = ex * Math.cos(angle) + ey * Math.sin(angle),
    perp = Math.abs(ex * Math.sin(angle) - ey * Math.cos(angle));
  if (along < -rmax || along > max + rmax || perp > rmax) return null;
  const p = localPoint(t, origin),
    a = angle - (t.angle ?? 0),
    dx = Math.cos(a),
    dy = Math.sin(a);
  let best: RayHit | null = null;
  for (const r of hitRegions(t)) {
    const x = r.x - p.x,
      y = r.y - p.y,
      along = x * dx + y * dy,
      perp = Math.abs(x * dy - y * dx);
    if (perp > r.radius) continue;
    const exit = along + Math.sqrt(r.radius * r.radius - perp * perp);
    if (exit < 0) continue;
    const d = Math.max(0, along - Math.sqrt(r.radius * r.radius - perp * perp));
    if (d <= max && (!best || d < best.distance)) {
      const point = {
        x: origin.x + Math.cos(angle) * d,
        y: origin.y + Math.sin(angle) * d,
      };
      best = { distance: d, point, region: armorAt(t, r, point) };
    }
  }
  return best;
}
export const destroyed = (e: ArmoredTarget, id: PartId) =>
  !!e.components?.[id]?.destroyed;
/** Compatibility for old QA pilots only. Combat never uses this direction-only estimate. */
export function armorMultiplier(
  e: Enemy,
  origin: Vec,
  ap = 2,
  explosive = false,
) {
  const h = rayHit(e, origin, Math.atan2(e.y - origin.y, e.x - origin.x), 1e5);
  return h ? penetrationMultiplier(explosive ? 5 : ap, h.region.av) : 0;
}

export const mobilityMultiplier = (e: Enemy) =>
  (e.kind === "walker" || e.kind === "artillery") && destroyed(e, "core")
    ? 0.4
    : 1;
