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
  if (
    w.mission.id &&
    x.state === "available" &&
    !w.mission.objectives.some(
      (o) => o.id === tracked && o.state !== "complete" && o.state !== "failed",
    )
  ) {
    const site = [...w.map.extractions].sort(
      (a, b) =>
        Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
    )[0];
    return { position: site, label: "E · 탈출 요청" };
  }
  if (w.mission.id) {
    const cargo = w.mission.cargo;
    const collection = w.mission.objectives.find((o) => o.action === "collect");
    if (
      cargo &&
      !cargo.delivered &&
      !cargo.carrier &&
      collection &&
      ["available", "active", "complete"].includes(collection.state)
    )
      return { position: cargo, label: "E · 데이터 케이스 회수" };
    if (cargo?.carrier && cargo.carrier !== p.id) {
      const carrier = w.players.find((a) => a.id === cargo.carrier);
      if (carrier) return { position: carrier, label: "데이터 운반자 엄호" };
    }
    const pending = w.mission.objectives.filter(
      (o) => o.state !== "complete" && o.state !== "failed",
    );
    const visible = pending.filter(
      (o) => o.discovered || o.known === "region" || o.known === "exact",
    );
    const needed = new Set(
      pending
        .filter((o) => !o.optional)
        .flatMap((o) => o.prerequisiteIds ?? []),
    );
    const selected =
      visible.find((o) => o.id === tracked) ??
      visible
        .filter(
          (o) =>
            ["available", "active"].includes(o.state) &&
            (!o.optional || needed.has(o.id)),
        )
        .sort(
          (a, b) =>
            Number(b.state === "active") - Number(a.state === "active") ||
            Math.hypot(a.position.x - p.x, a.position.y - p.y) -
              Math.hypot(b.position.x - p.x, b.position.y - p.y),
        )[0];
    if (selected)
      return {
        position: selected.operatingPoint ?? selected.position,
        label:
          selected.label +
          (selected.state === "locked"
            ? " · 선행 조건 필요"
            : selected.discovered
              ? ""
              : " · 추정 구역"),
      };
    if (x.state !== "available") return;
  }
  const pending = w.mission.id
    ? []
    : w.mission.objectives.filter((o) => o.state !== "complete");
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
