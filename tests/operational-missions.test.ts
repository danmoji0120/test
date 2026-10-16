import { it, expect, describe } from "vitest";
import {
  createWorld,
  makePlayer,
  fire,
  spawnEnemy,
} from "../src/game/simulation";
import {
  MISSIONS,
  operationOptions,
  type MissionId,
} from "../src/shared/missions";
import {
  tickOperationalObjectives,
  tickCargo,
} from "../src/game/operational-objectives";
import { missionComplete } from "../src/game/mission-graph";
import { visibleWorld } from "../src/server/visibility";
import { packRoom, unpackRoom } from "../src/shared/snapshot";
import { operationGoal } from "../src/shared/operation";
import type { World, Objective } from "../src/shared/data";
// Rule fixtures reposition operators to isolate task semantics. They are NOT input-only gameplay QA.
function setup(id: MissionId) {
  const w = createWorld(
    "fixture-" + id,
    42,
    [makePlayer("p", "Fixture"), makePlayer("q", "Other")],
    1,
    "blackout",
    operationOptions(id),
  );
  w.enemies.forEach((e) => (e.reserve = true));
  return w;
}
function step(w: World, n = 1) {
  for (let i = 0; i < n; i++) {
    w.time += 0.1;
    tickOperationalObjectives(w, 0.1);
  }
}
function work(w: World, o: Objective, limit = 1200) {
  const p = w.players[0];
  for (let i = 0; i < limit && o.state !== "complete"; i++) {
    const pos = o.operatingPoint ?? o.position;
    p.x = pos.x;
    p.y = pos.y;
    p.input.interact = true;
    step(w);
  }
  p.input.interact = false;
}
function node(w: World, id: string) {
  return w.mission.objectives.find((o) => o.id.endsWith(":" + id))!;
}
describe("operational mission rule fixtures", () => {
  it("guides authorization before an already-discovered but locked data case", () => {
    const w = setup("transfer"),
      collection = node(w, "case");
    collection.discovered = true;
    collection.known = "exact";
    expect(operationGoal(w, w.players[0])?.label).toContain("보안 인증");
    expect(collection.state).toBe("locked");
  });
  it("launch accepts both code/power orders, never creates a late target and launches once", () => {
    for (const order of [
      ["code", "power"],
      ["power", "code"],
    ]) {
      const w = setup("launch"),
        size = w.map.installations.length,
        launch = node(w, "launch");
      work(w, launch, 10);
      expect(launch.progress).toBe(0);
      work(w, node(w, order[0]));
      expect(launch.state).toBe("locked");
      work(w, node(w, order[1]));
      expect(launch.state).toBe("available");
      work(w, launch);
      expect(w.mission.launch).toBeDefined();
      expect(w.map.installations.length).toBe(size);
      expect(w.mission.extraction.state).toBe("available");
      const count = w.metrics.objectiveOrder.length;
      step(w, 20);
      expect(w.metrics.objectiveOrder.length).toBe(count);
    }
  });
  it("reactor has a real armor bypass and an independently useful power route", () => {
    for (const bypass of [true, false]) {
      const w = setup("reactor"),
        o = node(w, "reactor"),
        d = w.map.installations.find((d) => d.id === o.facilityId)!;
      if (!bypass) {
        work(w, node(w, "security"));
        expect(d.protectionDisabled).toBe(true);
      }
      d.hp = 0;
      step(w);
      expect(missionComplete(w.mission.objectives, w.mission.completion)).toBe(
        true,
      );
      expect(node(w, "cooling").state).not.toBe("complete");
    }
  });
  it("cargo is present while locked; down/disconnect drops at its carrier and another operator can recover it", () => {
    const w = setup("transfer"),
      c = w.mission.cargo!,
      p = w.players[0],
      q = w.players[1];
    p.x = c.x;
    p.y = c.y;
    p.input.interact = true;
    step(w);
    expect(c.carrier).toBeNull();
    work(w, node(w, "auth"));
    p.x = c.x;
    p.y = c.y;
    p.input.interact = true;
    step(w);
    expect(c.carrier).toBe(p.id);
    expect(p.activeSlot).toBe(2);
    p.x += 37;
    p.y += 21;
    tickCargo(w);
    p.down = true;
    tickCargo(w);
    expect(c.carrier).toBeNull();
    expect(c.x).toBe(p.x);
    expect(c.y).toBe(p.y);
    q.x = c.x;
    q.y = c.y;
    q.input.interact = true;
    step(w, 5);
    expect(c.carrier).toBe(q.id);
    q.connected = false;
    tickCargo(w);
    expect(c.carrier).toBeNull();
    expect(c.x).toBe(q.x);
    q.connected = true;
    step(w, 5);
    expect(c.carrier).toBe(q.id);
    q.input.drop = true;
    tickCargo(w);
    expect(c.carrier).toBeNull();
  });
  it("carrier cannot use a primary and transfer requires delivery at the actual transmitter", () => {
    const w = setup("transfer"),
      p = w.players[0],
      c = w.mission.cargo!;
    work(w, node(w, "auth"));
    p.x = c.x;
    p.y = c.y;
    p.input.interact = true;
    step(w);
    const ammo = p.ammo;
    p.activeSlot = 1;
    fire(w, p);
    expect(p.ammo).toBe(ammo);
    p.activeSlot = 2;
    work(w, node(w, "upload"));
    expect(c.delivered).toBe(true);
    expect(p.carrying).toBeUndefined();
    expect(w.mission.extraction.state).toBe("available");
  });
  it("survey accepts parallel sites and real nearby contest pauses collection", () => {
    const w = setup("survey"),
      a = node(w, "survey-a"),
      b = node(w, "survey-b");
    work(w, b);
    expect(node(w, "analysis").state).toBe("locked");
    const p = w.players[0];
    for (let i = 0; i < 30 && a.phase !== "데이터 수집"; i++) {
      Object.assign(p, a.operatingPoint);
      p.input.interact = true;
      step(w);
    }
    expect(a.phase).toBe("데이터 수집");
    const enemy = spawnEnemy(
      w,
      { x: a.position.x + 100, y: a.position.y },
      "rifle",
    )!;
    expect(enemy).toBeDefined();
    const before = a.progress;
    step(w, 10);
    expect(a.progress).toBe(before);
    enemy.hp = 0;
    work(w, a);
    work(w, node(w, "analysis"));
    expect(w.mission.extraction.state).toBe("available");
    expect(w.responseLog.some((e) => e.event === "objective-response")).toBe(
      true,
    );
  });
  it("blitz completes three of five, leaving enemy factories and the army alive", () => {
    const w = setup("blitz"),
      targets = w.mission.objectives.filter((o) => !o.optional);
    for (const o of targets.slice(0, 3))
      w.map.installations.find((d) => d.id === o.facilityId)!.hp = 0;
    step(w);
    expect(w.mission.extraction.state).toBe("available");
    expect(targets.filter((o) => o.state === "complete")).toHaveLength(3);
    expect(w.enemies.some((e) => e.hp > 0)).toBe(true);
  });
  it("defense has a finite three-call assault and explicit destruction failure", () => {
    const good = setup("defense"),
      o = node(good, "defense");
    work(good, o);
    expect(good.mission.defenseWaves).toBe(3);
    expect(good.mission.extraction.state).toBe("available");
    const bad = setup("defense"),
      target = node(bad, "defense");
    bad.map.installations.find((d) => d.id === target.facilityId)!.hp = 0;
    step(bad);
    expect(bad.mission.stage).toBe("failed");
    expect(bad.mission.reason).toContain("시설");
  });
  it("failed required equipment stops progression rather than silently unlocking the final node", () => {
    const w = setup("launch"),
      o = node(w, "code");
    w.map.installations.find((d) => d.id === o.facilityId)!.hp = 0;
    step(w);
    expect(w.mission.stage).toBe("failed");
    expect(w.mission.extraction.state).toBe("locked");
  });
  it("regional radio destruction changes only nearby physical sources; radar never grants enemy vision", () => {
    const w = setup("survey"),
      o = node(w, "radio"),
      d = w.map.installations.find((d) => d.id === o.facilityId)!;
    d.hp = 0;
    step(w);
    for (const source of w.map.sources)
      expect(source.radioDelay === 1.8).toBe(
        Math.hypot(source.entry.x - d.x, source.entry.y - d.y) < 2400,
      );
    const radar = node(w, "radar");
    work(w, radar);
    const v = visibleWorld(w);
    expect(v.enemies.length).toBeLessThan(w.enemies.length);
    const count = w.map.supplies.length;
    work(w, node(w, "depot"));
    expect(w.map.supplies.length).toBe(count + 1);
    work(w, node(w, "depot"));
    expect(w.map.supplies.length).toBe(count + 1);
  });
  it("filters unknown task/cargo/facility coordinates and streams explored-cell deltas with reconnect recovery", () => {
    const w = setup("transfer"),
      publicWorld = visibleWorld(w);
    expect(publicWorld.map.missionNodes).toBeUndefined();
    expect(publicWorld.mission.cargo).toBeUndefined();
    const hidden = w.mission.objectives.find((o) => o.known === "unknown")!,
      sent = publicWorld.mission.objectives.find((o) => o.id === hidden.id)!;
    expect(sent.position).toEqual({ x: 0, y: 0 });
    expect(sent.operatingPoint).toBeUndefined();
    expect(sent.facilityId).toBeUndefined();
    const first = packRoom({ world: publicWorld }),
      client = unpackRoom(JSON.parse(JSON.stringify(first.room)), null);
    expect(client.world.visibility.explored).toEqual(w.visibility.explored);
    w.visibility.explored[1234] = 1;
    w.visibility.revision++;
    const delta = packRoom({ world: visibleWorld(w) }, first.cursor);
    expect(delta.room.world.map).toBeUndefined();
    expect(delta.room.world.visibility.explored).toBeUndefined();
    expect(delta.room.world.visibility.exploredRuns).toContain(1234);
    expect(
      unpackRoom(JSON.parse(JSON.stringify(delta.room)), client).world
        .visibility.explored,
    ).toEqual(w.visibility.explored);
    expect(
      unpackRoom(
        JSON.parse(JSON.stringify(packRoom({ world: visibleWorld(w) }).room)),
        null,
      ).world.visibility.explored,
    ).toEqual(w.visibility.explored);
  });
});
