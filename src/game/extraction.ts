import type { World } from "../shared/data";
import { distance } from "./map";
import { lineOfSight } from "./visibility";
import { event, finish } from "./simulation";
import { raiseAlert } from "./alert";
export function tickExtraction(w: World, dt: number) {
  const x = w.mission.extraction,
    live = w.players.filter((p) => p.connected && !p.down);
  if (x.state === "available") {
    const site = w.map.extractions.find((s) =>
      live.some(
        (p) =>
          p.input.interact && distance(p, s) < 100 && lineOfSight(p, s, w.map),
      ),
    );
    if (site) {
      x.site = { ...site };
      x.state = "inbound";
      x.requested = w.time;
      x.eta = w.time + 24;
      x.departure = x.eta + 65;
      w.mission.stage = "extract";
      w.director.next = w.time;
      raiseAlert(w, 30, "탈출 신호 송신", site, 2);
      event(w, { type: "alarm", x: site.x, y: site.y });
    }
  }
  if (x.state === "inbound" && w.time >= x.eta) {
    x.state = "landed";
    event(w, { type: "sound", cue: "engine", x: x.site!.x, y: x.site!.y });
  }
  if (
    x.state === "inbound" &&
    Math.floor(w.time / 3) !== Math.floor((w.time - dt) / 3)
  )
    event(w, { type: "sound", cue: "engine", x: x.site!.x, y: x.site!.y });
  if (x.state === "landed") {
    const connected = w.players.filter((p) => p.connected);
    x.boarding =
      connected.length &&
      connected.every((p) => !p.down && distance(p, x.site!) < 140)
        ? x.boarding + dt
        : 0;
    if (x.boarding >= 3) {
      x.state = "departing";
      finish(
        w,
        true,
        w.mission.id
          ? "작전 목표 달성 · 수송기 탑승 및 분대 귀환"
          : "발전기 파괴 · 수송기 탑승 및 분대 귀환",
      );
    } else if (w.time >= x.departure)
      finish(w, false, "수송기 철수 · 탑승 기한 초과");
  }
}
