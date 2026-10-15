import type { World, Player, Vec } from "./data";
export function operationGoal(
  w: World,
  p: Player,
  tracked = "",
): { position: Vec; label: string } | undefined {
  const x = w.mission.extraction;
  if (w.mission.stage === "extract" && x.site)
    return {
      position: x.site,
      label: x.state === "inbound" ? "수송기 접근" : "탑승 지점",
    };
  const pending = w.mission.objectives.filter((o) => o.state !== "complete");
  const chosen =
    pending.find((o) => o.id === tracked) ??
    pending
      .filter((o) => !o.optional)
      .sort(
        (a, b) =>
          Math.hypot(a.position.x - p.x, a.position.y - p.y) -
          Math.hypot(b.position.x - p.x, b.position.y - p.y),
      )[0];
  if (chosen)
    return {
      position: chosen.position,
      label: chosen.label + (chosen.discovered ? "" : " · 추정 구역"),
    };
  if (x.state === "available") {
    const site = [...w.map.extractions].sort(
      (a, b) =>
        Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
    )[0];
    return { position: site, label: "E · 탈출 요청" };
  }
}
