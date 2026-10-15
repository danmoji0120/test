import type { World, EnemyKind } from "../shared/data";
import { distance } from "./map";
import { armored, forceWeight } from "./armor";
import { difficulty } from "../shared/difficulty";
/** A safety ceiling, not an encounter quota: distant/reserve actors never consume local combat slots. */
export const MAX_ACTORS = 64;
export function forceBudget(w: World) {
  const live = w.players.filter((p) => p.connected && !p.down),
    alive = w.enemies.filter((e) => e.hp > 0),
    near = (e: World["enemies"][number]) =>
      live.some((p) => distance(p, e) < 1250);
  return {
    regional: alive.length,
    reserve: alive.filter((e) => e.reserve).length,
    near: alive
      .filter((e) => !e.reserve && !e.traveling && near(e))
      .reduce((n, e) => n + forceWeight(e.kind), 0),
    strategic: alive.filter((e) => !e.reserve && !e.traveling && !near(e))
      .length,
    traveling: alive
      .filter((e) => e.traveling)
      .reduce((n, e) => n + forceWeight(e.kind), 0),
    travelingInfantry: alive.filter((e) => e.traveling && !armored(e.kind))
      .length,
    heavy: alive.filter(
      (e) =>
        !e.reserve &&
        armored(e.kind) &&
        !!e.requestId &&
        (near(e) || e.traveling),
    ).length,
    queued: w.reinforcements.filter((r) => r.state === "queued").length,
  };
}
export function dispatchBlock(
  w: World,
  roster: EnemyKind[],
  external: boolean,
) {
  const b = forceBudget(w),
    special = roster.some(armored),
    weight = roster.reduce((n, k) => n + forceWeight(k), 0),
    c = difficulty(w.difficulty, w.players.length);
  if (b.regional + (external ? roster.length : 0) > MAX_ACTORS)
    return "지역 안전 상한";
  if (
    !special &&
    b.travelingInfantry + roster.length > 14 + w.players.length * 2
  )
    return "행군 통로 예산 대기";
  // Heavy response has independent admission, so idle rifle patrols cannot suppress it.
  if (
    special &&
    b.heavy + roster.filter(armored).length >
      3 + (w.players.length >= 3 ? 1 : 0)
  )
    return "중장비 출동 슬롯 대기";
  if (!special && b.near > c.activeCap + 6) return "근거리 교전 예산 대기";
  return "";
}
