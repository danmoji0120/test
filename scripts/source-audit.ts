import { readFileSync, writeFileSync } from "node:fs";
import { distance } from "../src/game/map";
const dir = process.env.QA_OUTPUT || "docs/v3/final-source";
const server = JSON.parse(readFileSync(dir + "/server-trace.json", "utf8"));
const observer = JSON.parse(readFileSync(dir + "/observer.json", "utf8"));
const checks = server.trajectories.map((t: any) => {
  const s = server.sources.find((s: any) => s.id === t.source),
    r = server.requests.find((r: any) => r.id === t.request);
  return {
    enemy: t.enemy,
    source: t.source,
    request: t.request,
    samples: t.points.length,
    validOrigin:
      !!s &&
      (s.kind === "external"
        ? t.born.x < 0 || t.born.x > 5000
        : distance(t.born, s) < 100),
    validRoute: !!r?.path.length,
    continuous: t.points.every(
      (p: any, i: number) =>
        i === 0 ||
        distance(p, t.points[i - 1]) <= 240 * (p.at - t.points[i - 1].at) + 12,
    ),
    observedByBrowser: observer.observed.some((o: any) =>
      o.enemies.some((e: any) => e.id === t.enemy),
    ),
    observedTravel: observer.observed
      .flatMap((o: any) => o.enemies.filter((e: any) => e.id === t.enemy))
      .some((e: any) => distance(e, t.born) > 100),
  };
});
writeFileSync(
  dir + "/continuity.json",
  JSON.stringify(
    {
      method:
        "private source/path/trajectory audit plus independent two-browser public observations and actual video; ordinary inputs only",
      checks,
      requests: server.requests.map((r: any) => ({
        id: r.id,
        source: r.sourceId,
        state: r.state,
        requested: r.requested,
        departed: r.departed,
        arrived: r.arrived,
      })),
    },
    null,
    2,
  ),
);
console.log(checks);
if (
  !checks.length ||
  checks.some((c: any) => !c.validOrigin || !c.validRoute || !c.continuous)
)
  throw Error("Dispatch continuity audit failed");
if (!checks.some((c: any) => c.observedByBrowser && c.observedTravel))
  throw Error("No marching reinforcement was observed by a real browser");
