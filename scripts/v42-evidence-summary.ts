import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { ENEMIES } from "../src/shared/data";
import { distance } from "../src/game/map";
const root = process.env.QA_OUTPUT || "docs/v4.2/browser-release";
const runs: any[] = [];
for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) =>
  d.isDirectory(),
)) {
  let q: any, t: any;
  try {
    q = JSON.parse(readFileSync(`${root}/${dir.name}/browser-qa.json`, "utf8"));
    t = JSON.parse(
      readFileSync(`${root}/${dir.name}/server-trace.json`, "utf8"),
    );
  } catch {
    continue;
  }
  const provenance = t.trajectories.map((p: any) => {
    const s = t.sources.find((s: any) => s.id === p.source),
      r = t.requests.find((r: any) => r.id === p.request);
    const kind = (r?.roster?.[r.members.indexOf(p.enemy)] ??
      "rifle") as keyof typeof ENEMIES;
    return {
      enemy: p.enemy,
      source: p.source,
      request: p.request,
      validOrigin:
        !!s &&
        (s.kind === "external"
          ? p.born.x < 0 ||
            p.born.y < 0 ||
            p.born.x > t.width ||
            p.born.y > t.height
          : distance(p.born, s) < 130),
      route: !!r?.path.length,
      continuous: p.points.every(
        (v: any, i: number) =>
          !i ||
          distance(v, p.points[i - 1]) <=
            Math.max(270, ENEMIES[kind].speed) * (v.at - p.points[i - 1].at) +
              2,
      ),
      samples: p.points.length,
    };
  });
  if (
    provenance.some((p: any) => !p.validOrigin || !p.route || !p.continuous) ||
    new Set(provenance.map((p: any) => p.enemy)).size !== provenance.length
  )
    throw Error("Invalid physical native dispatch " + dir.name);
  if (q.errors.length || !q.credits.persisted || !q.repeatDeployment)
    throw Error("Incomplete browser verification " + dir.name);
  runs.push({
    directory: dir.name,
    mission: q.missionId,
    players: q.players,
    seed: q.seed,
    operation: q.operation,
    automation: q.automation,
    result: q.result,
    gameSeconds: q.elapsed,
    outcome: q.outcome,
    reconnect: q.reconnect,
    revives: q.metrics.revives,
    order: q.metrics.objectiveOrder,
    errors: q.errors,
    provenance,
    firstContact: q.metrics.firstContact,
    combatSeconds: q.metrics.combatSeconds,
    frameMs: q.frameMs,
    measurements: t.measurements,
  });
}
const wins = runs.filter((r) => r.result === "success");
if (
  runs.length !== 10 ||
  new Set(wins.map((r) => r.mission)).size !== 6 ||
  ![1, 2, 4].every((n) => wins.some((r) => r.players === n))
)
  throw Error("Incomplete six-archetype/co-op native success coverage");
const summary = {
  method:
    "Audit of10actual production DOM/WebSocket operation records,including genuine failures and a stronger public-information defense pilot; no gameplay state injection; gameSeconds is simulation clock, not human playtime",
  successes: wins.length,
  failures: runs.length - wins.length,
  trajectories: runs.reduce((n, r) => n + r.provenance.length, 0),
  points: runs.reduce(
    (n, r) => n + r.provenance.reduce((s: number, p: any) => s + p.samples, 0),
    0,
  ),
  violations: 0,
  runs,
};
writeFileSync(
  root + "/verified-summary.json",
  JSON.stringify(summary, null, 2),
);
console.log({
  successes: summary.successes,
  failures: summary.failures,
  trajectories: summary.trajectories,
  points: summary.points,
  violations: summary.violations,
});
