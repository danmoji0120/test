import { beforeAll, afterAll, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { WebSocket } from "ws";
import { unpackRoom } from "../src/shared/snapshot";
import { MISSIONS, operationOptions } from "../src/shared/missions";
const port = 3118,
  dir = mkdtempSync(join(process.cwd(), ".qa-private-v42-network-"));
const pause = (n: number) => new Promise((r) => setTimeout(r, n));
let server: ChildProcess;
const sockets: WebSocket[] = [];
class Peer {
  ws: WebSocket;
  room: any;
  messages: any[] = [];
  id = "";
  token = "";
  constructor(token?: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(this.ws);
    this.ws.on("open", () => this.send({ type: "hello", token }));
    this.ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "hello") {
        this.id = m.id;
        this.token = m.profile.token;
      }
      if (m.type === "state") {
        this.room = unpackRoom(m.room, this.room);
        m.room = this.room;
      }
      this.messages.push(m);
    });
  }
  send(m: any) {
    this.ws.send(JSON.stringify(m));
  }
  async wait(fn: (m: any) => boolean) {
    const end = Date.now() + 6000;
    while (Date.now() < end) {
      const m = this.messages.find(fn);
      if (m) return m;
      await pause(20);
    }
    throw Error("Operational WebSocket timeout");
  }
}
beforeAll(async () => {
  server = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      ROOM_GRACE_MS: "300",
    },
    stdio: "pipe",
  });
  await new Promise<void>((resolve, reject) => {
    server.stdout!.on("data", (s) => {
      if (String(s).includes("ready:")) resolve();
    });
    server.on("exit", (c) => reject(Error("V4.2 network server exited " + c)));
    server.on("error", reject);
  });
}, 15000);
afterAll(async () => {
  for (const s of sockets) s.close();
  server?.kill("SIGTERM");
  await pause(300);
  rmSync(dir, { recursive: true, force: true });
});
it("shares a validated four-player insertion/graph, rejects forged progress and restores equipment on reconnect", async () => {
  const peers = Array.from({ length: 4 }, () => new Peer());
  await Promise.all(peers.map((p) => p.wait((m) => m.type === "hello")));
  peers[0].send({
    type: "create",
    operation: operationOptions("launch", "large", 2),
  });
  await peers[0].wait((m) => m.type === "state");
  const code = peers[0].room.code;
  for (let i = 1; i < 4; i++) {
    peers[i].send({
      type: "join",
      code,
      loadout: {
        primary: i === 3 ? "at" : "ar",
        secondary: "pistol",
        consumable: "smoke",
      },
    });
    await peers[i].wait((m) => m.type === "state");
  }
  peers[0].send({
    type: "settings",
    seed: 42,
    difficulty: 1,
    operation: operationOptions("launch", "large", 2),
  });
  await peers[0].wait(
    (m) =>
      m.type === "state" &&
      m.room.players.length === 4 &&
      m.room.seed === 42 &&
      m.room.difficulty === 1,
  );
  const brief = peers[0].room.brief;
  expect(brief.error).toBeUndefined();
  expect(brief.estimates).toHaveLength(2);
  peers[1].send({ type: "settings", operation: operationOptions("defense") });
  await pause(100);
  expect(peers[0].room.operation.missionId).toBe("launch");
  peers.forEach((p) => p.send({ type: "ready" }));
  await peers[0].wait(
    (m) =>
      m.type === "state" &&
      m.room.players.length === 4 &&
      m.room.players.every((p: any) => p.ready),
  );
  peers[0].send({ type: "start" });
  await Promise.all(
    peers.map((p) =>
      p.wait((m) => m.type === "state" && m.room.phase === "playing"),
    ),
  );
  const w = peers[0].room.world,
    id = w.id;
  expect(w.map.generation.signature).toBe(brief.signature);
  expect(w.map.spawn).toEqual(brief.deployments[2]);
  expect(w.mission.id).toBe("launch");
  expect(w.map.missionNodes).toBeUndefined();
  expect(w.reinforcements).toBeUndefined();
  expect(
    w.mission.objectives.find((o: any) => o.id === "launch:launch").state,
  ).toBe("locked");
  for (const o of w.mission.objectives.filter(
    (o: any) => !o.discovered && o.known === "unknown",
  )) {
    expect(o.position).toEqual({ x: 0, y: 0 });
    expect(o.facilityId).toBeUndefined();
  }
  for (const p of w.players)
    expect(Math.hypot(p.x - w.map.spawn.x, p.y - w.map.spawn.y)).toBeLessThan(
      90,
    );
  peers[0].send({
    type: "input",
    dx: 0,
    dy: 0,
    mission: { objectives: "complete" },
    reward: 999999,
    progress: 999999,
  });
  await peers[0].wait((m) => m.type === "state" && m.room.world?.time > 0.3);
  expect(peers[0].room.world.mission.extraction.state).toBe("locked");
  const token = peers[3].token,
    old = peers[3].id;
  peers[3].ws.close();
  await pause(200);
  const restored = new Peer(token);
  await restored.wait((m) => m.type === "state" && m.room.phase === "playing");
  expect(restored.id).toBe(old);
  expect(restored.room.world.id).toBe(id);
  expect(restored.room.operation.missionId).toBe("launch");
  expect(
    restored.room.world.players.find((p: any) => p.id === old).guns.primary.id,
  ).toBe("at");
  expect(restored.room.world.visibility.explored.length).toBe(
    Math.ceil(w.map.width / 50) * Math.ceil(w.map.height / 50),
  );
  peers.slice(0, 3).forEach((p) => p.ws.close());
  restored.ws.close();
}, 15000);
it("validates mission/profile/version on the server and can deploy each of the six archetypes", async () => {
  for (const mission of Object.values(MISSIONS)) {
    const p = new Peer();
    await p.wait((m) => m.type === "hello");
    p.send({ type: "create", operation: operationOptions(mission.id) });
    await p.wait((m) => m.type === "state");
    const selected = p.room.operation;
    expect(p.room.brief.width).toBeGreaterThan(0);
    p.send({
      type: "settings",
      operation: { ...selected, generatorVersion: 999 },
    });
    await p.wait((m) => m.type === "error");
    expect(p.room.operation).toEqual(selected);
    p.send({ type: "ready" });
    await p.wait((m) => m.type === "state" && m.room.players[0].ready);
    p.send({ type: "start" });
    await p.wait((m) => m.type === "state" && m.room.phase === "playing");
    expect(p.room.world.mission.id).toBe(mission.id);
    expect(
      new Set(p.room.world.mission.objectives.map((o: any) => o.id)).size,
    ).toBe(p.room.world.mission.objectives.length);
    p.ws.close();
    await pause(50);
  }
  expect((await fetch(`http://127.0.0.1:${port}/health`)).ok).toBe(true);
}, 20000);
