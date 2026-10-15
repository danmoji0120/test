import { createWorld, makePlayer } from "../src/game/simulation";
import { raiseAlert } from "../src/game/alert";
import { requestSupport, tickReinforcements } from "../src/game/reinforcements";
import { writeFileSync, mkdirSync } from "node:fs";
const output = "docs/v4";
mkdirSync(output, { recursive: true });
const report = [];
for (const level of [1, 2, 3, 4]) {
  const w = createWorld(
    "alert-fixture-" + level,
    42,
    [makePlayer("p", "SAME LOADOUT")],
    10,
  );
  w.players[0].connected = false;
  raiseAlert(w, [0, 18, 48, 80, 120][level], "controlled-event-fixture");
  const target = w.map.zones[0].entry;
  if (level === 2)
    requestSupport(
      w,
      "local",
      target,
      "fixture",
      w.map.sources.find((s) => s.kind === "outpost")!.id,
    );
  if (level === 3)
    requestSupport(
      w,
      "elite",
      target,
      "fixture",
      w.map.sources.find((s) => s.kind === "external")!.id,
    );
  if (level === 4) {
    requestSupport(
      w,
      "heavy",
      target,
      "fixture",
      w.map.sources.find((s) => s.kind === "external")!.id,
      { heavy: true, task: "assault" },
    );
    requestSupport(
      w,
      "screen",
      w.map.zones[1].entry,
      "fixture",
      w.map.sources.filter((s) => s.kind === "external")[1].id,
      { task: "block" },
    );
  }
  for (let i = 0; i < 1800; i++) {
    w.time += 1 / 30;
    tickReinforcements(w, 1 / 30);
  }
  report.push({
    alert: level,
    requests: w.reinforcements,
    dispatchUnits: w.enemies
      .filter((e) => e.requestId)
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        elite: e.elite,
        role: e.role,
        source: e.sourceId,
      })),
    notices: w.notices,
    eventCounts: w.events.reduce(
      (a, e) => (
        (a[e.type + ":" + (e.cue || "")] =
          (a[e.type + ":" + (e.cue || "")] || 0) + 1),
        a
      ),
      {} as Record<string, number>,
    ),
    trajectories: w.trajectories,
  });
}
writeFileSync(
  output + "/alert-comparison.json",
  JSON.stringify(
    {
      method:
        "Controlled server-rules comparison: same seed42,difficulty10,loadout; alert set by explicit event fixtures,60seconds physical marching; not a natural-input gameplay recording. Independent actual maximum-alert browser and input-pilot evidence accompanies this.",
      report,
    },
    null,
    2,
  ),
);
console.log(
  report.map((r) => ({
    level: r.alert,
    rosters: r.requests.map((r) => r.roster),
    departures: r.requests.filter((r) => r.departed >= 0).length,
    arrived: r.requests.filter((r) => r.arrived >= 0).length,
  })),
);
