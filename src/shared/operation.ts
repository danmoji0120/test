import type { World, Player, Vec, Objective } from "./data";
/** Automatic machinery needs cover, not a held interaction key. Shared HUD/world prompt rule. */
export function objectiveNeedsInput(o: Objective) {
  return (
    !["locked", "complete", "failed"].includes(o.state) &&
    o.action !== "destroy" &&
    ![
      "데이터 수집",
      "방어 중",
      "데이터 전송",
      "분석 중",
      "발사 준비",
      "미사일 발사",
    ].includes(o.phase ?? "")
  );
}
export function operationInteractionHint(
  w: World,
  p: Player,
): string | undefined {
  if (!w.mission.id || p.down) return;
  const nearby = (v: Vec, range = 110) =>
    Math.hypot(v.x - p.x, v.y - p.y) < range;
  const c = w.mission.cargo;
  const o = w.mission.objectives
    .filter(
      (o) =>
        o.discovered &&
        !["complete", "failed"].includes(o.state) &&
        nearby(o.operatingPoint ?? o.position),
    )
    .sort(
      (a, b) =>
        Math.hypot(
          (a.operatingPoint ?? a.position).x - p.x,
          (a.operatingPoint ?? a.position).y - p.y,
        ) -
        Math.hypot(
          (b.operatingPoint ?? b.position).x - p.x,
          (b.operatingPoint ?? b.position).y - p.y,
        ),
    )[0];
  if (p.carrying)
    return o?.action === "upload" && o.state !== "locked"
      ? "E · 데이터 케이스 연결·전송 / 이후 자동 진행"
      : "데이터 운반 중 · 권총/소모품 사용 가능 · X 내려놓기";
  if (
    c &&
    !c.delivered &&
    !c.carrier &&
    nearby(c, 90) &&
    w.mission.objectives.some(
      (o) =>
        o.action === "collect" &&
        ["available", "active", "complete"].includes(o.state),
    )
  )
    return "E · 데이터 케이스 회수";
  if (!o) return;
  if (o.state === "locked")
    return `잠김 · ${(o.prerequisiteIds ?? []).map((id) => w.mission.objectives.find((n) => n.id === id)?.label ?? "선행 목표").join(o.prerequisiteMode === "any" ? " / " : " + ")}${o.activation === "breach" ? " 또는 장갑 돌파" : " 필요"}`;
  if (o.action === "destroy") return "시설 공략 · 실제 약점 / AP·AV";
  if (o.action === "upload" && !c?.delivered)
    return "데이터 케이스 운반자 도착 필요";
  return `${objectiveNeedsInput(o) ? "E" : "자동 진행"} · ${o.phase ?? o.label} · ${o.progress.toFixed(1)}/${o.total}`;
}
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
