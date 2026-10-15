import { it, expect } from "vitest";
import {
  createWorld,
  makePlayer,
  fire,
  finish,
  tick,
} from "../src/game/simulation";
import { tickObjectives } from "../src/game/objectives";
import { tickExtraction } from "../src/game/extraction";
import { requestSupport } from "../src/game/reinforcements";
import { tickDirector } from "../src/game/director";
import { emptyInput } from "../src/shared/data";
it("completes generators in reverse order, skips all auxiliaries and extracts with the original army alive", () => {
  const w = createWorld("no-kill", 7, [makePlayer("p", "P")]),
    p = w.players[0];
  w.map.obstacles = [];
  const ids = w.enemies.map((e) => e.id);
  for (const d of w.map.installations
    .filter((d) => d.kind === "generator")
    .reverse()) {
    const angle=d.angle??0;
    Object.assign(p,{x:d.x-Math.cos(angle)*100,y:d.y-Math.sin(angle)*100,angle,ammo:30});p.input.aim=true;
    w.enemies.forEach((e) => Object.assign(e, { x: 50, y: 50 }));
    for(let i=0;i<30&&d.hp>0;i++){p.recoil=0;fire(w,p);}
    tickObjectives(w, 0.03);
    expect(w.mission.objectives.find((o) => o.id === d.id)!.state).toBe(
      "complete",
    );
  }
  expect(w.mission.extraction.state).toBe("available");
  expect(p.kills).toBe(0);
  expect(
    w.mission.objectives
      .filter((o) => o.optional)
      .every((o) => o.state !== "complete"),
  ).toBe(true);
  Object.assign(p, w.map.extractions[0]);
  p.input = { ...emptyInput(), interact: true };
  tickExtraction(w, 0.03);
  expect(w.mission.extraction.state).toBe("inbound");
  w.time = w.mission.extraction.eta - 1;
  tickExtraction(w, 3);
  expect(w.mission.stage).not.toBe("success");
  w.time = w.mission.extraction.eta;
  tickExtraction(w, 0);
  expect(w.mission.extraction.state).toBe("landed");
  tickExtraction(w, 3.1);
  expect(w.mission.stage).toBe("success");
  expect(w.enemies.map((e) => e.id)).toEqual(ids);
  expect(w.enemies.every((e) => e.hp > 0)).toBe(true);
});
it("destroyed communications cancels queued external support and the outpost removes its dispatch capacity", () => {
  const w = createWorld("counter", 42, [makePlayer("p", "P")]);
  w.alertState.level = 4;
  const source = w.map.sources.find((s) => s.kind === "external")!,
    r = requestSupport(w, "comms", w.map.installations[0], "s", source.id)!;
  w.map.installations.find((d) => d.kind === "comms")!.hp = 0;
  tickDirector(w, 0.03);
  expect(r.state).toBe("cancelled");
  const post = w.map.installations.find((d) => d.kind === "outpost")!;
  post.hp = 0;
  tickDirector(w, 0.03);
  expect(w.map.sources.find((s) => s.id === post.sourceId)!.disabled).toBe(
    true,
  );
});
it("all optional objectives complete independently and intel interaction never stacks with four operators", () => {
  const w = createWorld(
    "aux",
    42,
    Array.from({ length: 4 }, (_, i) => makePlayer("p" + i, "P")),
  );
  w.map.obstacles = [];
  w.players.forEach((p) => {
    Object.assign(p, w.map.intel);
    p.input = { ...emptyInput(), interact: true };
  });
  w.map.installations
    .filter((d) => d.kind !== "generator")
    .forEach((d) => (d.hp = 0));
  tickObjectives(w, 1);
  expect(w.mission.intelProgress).toBe(1);
  tickObjectives(w, 2);
  expect(
    w.mission.objectives
      .filter((o) => o.optional)
      .every((o) => o.state === "complete"),
  ).toBe(true);
  expect(w.mission.extraction.state).toBe("locked");
});
it("caps kill farming and bases rewards on objectives; repeated finish never settles twice", () => {
  const a = createWorld("a", 7, [makePlayer("p", "P")]),
    b = createWorld("b", 7, [makePlayer("q", "Q")]);
  a.players[0].kills = 40;
  b.players[0].kills = 10000;
  finish(a, false, "fail");
  finish(b, false, "fail");
  expect(a.mission.reward).toBe(b.mission.reward);
  const reward = a.mission.reward;
  finish(a, true, "again");
  expect(a.mission.reward).toBe(reward);
});
it("continues patrol and director activity after the main goals are complete and before requesting extraction", () => {
  const w = createWorld("ongoing", 42, [makePlayer("p", "P")]);
  w.map.installations
    .filter((d) => d.kind === "generator")
    .forEach((d) => (d.hp = 0));
  w.players[0].connected = false;
  const start = w.enemies.find((e) => !e.reserve)!;
  const before = { x: start.x, y: start.y };
  for (let i = 0; i < 30; i++) tick(w, 1 / 30);
  expect(w.mission.extraction.state).toBe("available");
  expect(Math.hypot(start.x - before.x, start.y - before.y)).toBeGreaterThan(1);
  expect(w.mission.stage).not.toBe("success");
});
