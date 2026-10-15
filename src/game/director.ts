import type { World, Vec } from "../shared/data";
import {
  requestSupport,
  tickReinforcements,
  cancelRequest,
} from "./reinforcements";
export function tickDirector(w: World, dt: number) {
  const comms = w.map.installations.some((d) => d.kind === "comms" && d.hp > 0);
  if (!comms && !w.director.commsDown) {
    w.director.commsDown = true;
    for (const r of w.reinforcements)
      if (w.map.sources.find((s) => s.id === r.sourceId)?.kind === "external")
        cancelRequest(w, r, "통신탑 파괴");
  }
  for (const call of w.supportSignals.splice(0))
    if (w.time - call.at < 20)
      requestSupport(w, call.id, call.target, call.squad);
  if (w.time >= w.director.next) {
    let target: Vec | undefined;
    if (w.mission.stage === "extract")
      target = w.mission.extraction.site ?? undefined; // Explicit broadcast extraction beacon, not hidden player tracking.
    else {
      const intel = Object.values(w.squads)
        .filter((s) => s.lastSeen && w.time - s.observedAt < 25)
        .sort((a, b) => b.observedAt - a.observedAt)[0];
      if (intel && w.alertState.level >= 2) target = intel.lastSeen!;
      else if (w.time > 90)
        target =
          w.map.patrols[Math.floor(w.time / 90) % w.map.patrols.length]?.at(-1);
    }
    if (target)
      requestSupport(w, "director-" + Math.floor(w.time / 12), target);
    w.director.next =
      w.time + (w.mission.stage === "extract" ? 18 : 40) + (comms ? 0 : 25);
  }
  tickReinforcements(w, dt);
}
