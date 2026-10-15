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
/** Facing is the weapon/body heading; orange rear quarter is a readable weak point. */
export function armorMultiplier(
  e: Enemy,
  origin: Vec,
  penetration = 0.72,
  explosive = false,
) {
  if (!armored(e.kind)) return 1 - ENEMIES[e.kind].armor * (1 - penetration);
  const angle = Math.atan2(origin.y - e.y, origin.x - e.x),
    dot = Math.cos(angle - e.angle);
  const front = dot > 0.55,
    rear = dot < -0.4;
  if (explosive) return rear ? 1.25 : front ? 0.68 : 0.95;
  if (e.kind === "juggernaut") return rear ? 1.1 : front ? 0.11 : 0.48;
  if (e.kind === "walker") return rear ? 0.95 : front ? 0.045 : 0.24;
  return rear ? 1.05 : front ? 0.18 : 0.48;
}
