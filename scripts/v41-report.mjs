// Aggregates recorded results; never changes simulation outcomes or raw evidence.
import { readFileSync, writeFileSync } from "node:fs";
const root = "docs/v4.1/";
const read = (path) => JSON.parse(readFileSync(root + path, "utf8"));
const groups = {};
const rows = [];
for (const [folder, expected] of Object.entries({
  acceptance: 69,
  loadouts: 30,
  random: 18,
  "tactical-final": 6,
})) {
  const report = read(folder + "/matrix.json").report;
  if (report.length !== expected)
    throw Error(`${folder}: ${report.length}/${expected} rows`);
  const tally = {};
  for (const row of report) {
    tally[row.result] = (tally[row.result] || 0) + 1;
    for (const trajectory of row.provenance)
      if (
        !trajectory.validOrigin ||
        !trajectory.continuous ||
        !trajectory.route
      )
        throw Error(`Invalid dispatch in ${folder}: ${trajectory.enemy}`);
    rows.push({ group: folder, ...row });
  }
  groups[folder] = { count: report.length, results: tally };
}
const byLevel = {};
for (const row of rows.filter(
  (r) => r.group === "acceptance" && r.mode === "primary",
)) {
  const result = (byLevel[row.level] ||= {});
  result[row.result] = (result[row.result] || 0) + 1;
}
const browser = [];
for (const name of ["release-1", "release-2", "release-4", "release-level10"]) {
  const d = read(`browser/${name}/browser-qa.json`);
  const trace = read(`browser/${name}/server-trace.json`);
  if (d.errors.length) throw Error(`${name}: browser errors`);
  browser.push({
    name,
    players: d.players,
    difficulty: d.difficulty,
    seed: d.seed,
    result: d.result,
    seconds: d.elapsed,
    firstContact: d.metrics.firstContact,
    primaryAt: d.metrics.primaryAt,
    revives: d.metrics.revives,
    frameMs: d.frameMs,
    credits: d.credits,
    reconnect: d.reconnect,
    repeatDeployment: d.repeatDeployment,
    shots: d.feedback,
    errors: d.errors,
    server: trace.measurements,
    authoritativePrimary: trace.equipment.map((p) => p.primary),
  });
}
const render = [];
for (const version of ["v4", "v41"])
  for (const width of [1280, 1920])
    for (const windows of [1, 2, 4]) {
      const d = read(
        `performance/${version}-${width}-${windows}/render-qa.json`,
      );
      if (d.errors.length) throw Error("Render fixture page errors");
      render.push({
        version,
        viewport: d.viewport,
        windows,
        measurements: d.measurements.map((m) => ({
          averageMs: m.averageMs,
          approximateFPS: 1000 / m.averageMs,
          p95Ms: m.p95Ms,
          heapMiB: m.heapMiB,
          drawMs: m.drawMs,
        })),
        chromiumAllProcessesRSSMiB: d.chromiumAllProcessesRSSMiB,
      });
    }
const trajectories = rows.flatMap((r) => r.provenance);
const summary = {
  method:
    "Recorded input automation, controlled fixtures and actual WebSocket browsers are distinct. No human play/listening approval. This script only aggregates existing evidence.",
  groups,
  byLevel,
  scenarioCount: rows.length,
  unfinished: rows
    .filter((r) => !["success", "failed"].includes(r.result))
    .map((r) => ({
      group: r.group,
      level: r.level,
      count: r.count,
      seed: r.seed,
      mode: r.mode,
      loadout: r.loadout,
      stage: r.result,
      elapsed: r.elapsed,
    })),
  dispatch: {
    trajectories: trajectories.length,
    invalid: 0,
    samples: trajectories.reduce((n, t) => n + t.samples, 0),
    kinds: [...new Set(trajectories.map((t) => t.kind))],
  },
  // The old row.rockets field referenced the removed G inventory. Use actual shot events.
  atShots: rows.reduce((n, r) => n + (r.shotsByWeapon.at || 0), 0),
  consumableUses: rows.reduce(
    (n, r) => n + r.uses.reduce((a, b) => a + b, 0),
    0,
  ),
  browser,
  render,
  stability: read("stability/stability-qa.json"),
  audio: read("final-visual-audio/audio-qa.json"),
};
writeFileSync(
  root + "final/summary.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      groups,
      byLevel,
      scenarios: rows.length,
      unfinished: summary.unfinished,
      dispatch: summary.dispatch,
      atShots: summary.atShots,
      consumableUses: summary.consumableUses,
    },
    null,
    2,
  ),
);
