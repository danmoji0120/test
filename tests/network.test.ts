import { beforeAll, afterAll, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";

import { basename, join } from "node:path";
import { WebSocket } from "ws";
const port = 3107,
  dir = mkdtempSync(join(process.cwd(), ".qa-private-"));
let server: ChildProcess;
const sockets: WebSocket[] = [];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
class Peer {
  ws: WebSocket;
  messages: any[] = [];
  id = "";
  token = "";
  constructor(token?: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(this.ws);
    this.ws.on("open", () => this.send({ type: "hello", token }));
    this.ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      this.messages.push(m);
      if (m.type === "hello") {
        this.id = m.id;
        this.token = m.profile.token;
      }
    });
  }
  send(m: any) {
    this.ws.send(JSON.stringify(m));
  }
  async wait(predicate: (m: any) => boolean, timeout = 5000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const m = this.messages.find(predicate);
      if (m) return m;
      await pause(20);
    }
    throw Error("Network message timeout");
  }
  clear() {
    this.messages = [];
  }
}
beforeAll(async () => {
  server = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      ROOM_GRACE_MS: "1500",
    },
    stdio: "pipe",
  });
  await new Promise<void>((resolve, reject) => {
    server.stdout!.on("data", (s) => {
      if (String(s).includes("ready:")) resolve();
    });
    server.on("error", reject);
    server.on("exit", (code) => reject(Error("server exited " + code)));
  });
}, 15000);
afterAll(async () => {
  for (const ws of sockets) ws.close();
  server?.kill("SIGTERM");
  await pause(300);
  rmSync(dir, { recursive: true, force: true });
});
it("enforces 4-player capacity, ready/start authority, validated input, synchronized shots and reconnect", async () => {
  const peers = Array.from({ length: 5 }, () => new Peer());
  await Promise.all(peers.map((p) => p.wait((m) => m.type === "hello")));
  peers[0].send({
    type: "create",
    name: "Lead",
    character: "luna",
    weapon: "smg",
  });
  const first = await peers[0].wait((m) => m.type === "state");
  const code = first.room.code;
  expect(first.room.players[0].character).toBe("luna");
  for (let i = 1; i < 4; i++) {
    peers[i].send({ type: "join", code, name: "P" + i });
    await peers[i].wait((m) => m.type === "state");
  }
  peers[4].send({ type: "join", code, name: "Fifth" });
  expect((await peers[4].wait((m) => m.type === "error")).message).toContain(
    "정원",
  );
  peers[0].send({ type: "start" });
  expect((await peers[0].wait((m) => m.type === "error")).message).toContain(
    "준비",
  );
  for (const p of peers.slice(0, 4)) {
    p.send({ type: "ready" });
  }
  await peers[0].wait(
    (m) =>
      m.type === "state" &&
      m.room.players.length === 4 &&
      m.room.players.every((p: any) => p.ready),
  );
  peers[1].clear();
  peers[1].send({ type: "start" });
  await pause(100);
  expect(peers[1].messages.at(-1)?.room.phase).toBe("lobby");
  peers.slice(0, 4).forEach((p) => p.clear());
  peers[0].send({ type: "start" });
  const starts = await Promise.all(
    peers
      .slice(0, 4)
      .map((p) =>
        p.wait((m) => m.type === "state" && m.room.phase === "playing"),
      ),
  );
  expect(new Set(starts.map((m) => m.room.world.id)).size).toBe(1);
  expect(
    starts.every((m) => !JSON.stringify(m.room).includes(peers[0].token)),
  ).toBe(true);
  for (const p of peers.slice(0, 4))
    p.send({ type: "input", dx: 99999, dy: 0, angle: 0, fire: true });
  await pause(220);
  for (const p of peers.slice(0, 4)) p.clear();
  const shots = await Promise.all(
    peers
      .slice(0, 4)
      .map((p) =>
        p.wait(
          (m) =>
            m.type === "state" &&
            m.room.world.events.some((e: any) => e.type === "shot"),
        ),
      ),
  );
  for (const m of shots) {
    expect(m.room.players.every((p: any) => p.ammo < 40)).toBe(true);
    expect(m.room.players[0].x - starts[0].room.players[0].x).toBeLessThan(100);
  }
  const token = peers[2].token,
    oldId = peers[2].id;
  peers[2].ws.close();
  peers[0].clear();
  await peers[0].wait(
    (m) =>
      m.type === "state" &&
      m.room.players.find((p: any) => p.id === oldId)?.connected === false,
  );
  const restored = new Peer(token);
  await restored.wait((m) => m.type === "hello");
  const resumed = await restored.wait(
    (m) => m.type === "state" && m.room.phase === "playing",
  );
  expect(restored.id).toBe(oldId);
  expect(resumed.room.players).toHaveLength(4);
  expect(resumed.room.world.id).toBe(starts[0].room.world.id);
  restored.send({ type: "leave" });
  await restored.wait((m) => m.type === "left");
  restored.clear();
  restored.send({ type: "create", name: "New room" });
  expect((await restored.wait((m) => m.type === "state")).room.code).not.toBe(
    code,
  );
  for (const p of peers) p.ws.close();
  restored.ws.close();
  await pause(1900);
  const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) =>
    r.json(),
  );
  expect(health.rooms).toBe(0);
}, 15000);
it("rejects locked equipment and invalid character identifiers; persists purchases after reconnect", async () => {
  const p = new Peer();
  await p.wait((m) => m.type === "hello");
  p.send({ type: "create", name: "Shop" });
  await p.wait((m) => m.type === "state");
  p.clear();
  p.send({
    type: "loadout",
    character: "__proto__",
    weapon: "sg",
    mod: "loader",
  });
  const state = await p.wait((m) => m.type === "state");
  expect(state.room.players[0].character).toBe("aria");
  expect(state.room.players[0].weapon).toBe("ar");
  p.send({ type: "buy", item: "sg" });
  const purchase = await p.wait((m) => m.type === "profile");
  expect(purchase.profile.credits).toBe(80);
  expect(purchase.profile.unlocks).toContain("sg");
  p.send({ type: "buy", item: "loader" });
  expect((await p.wait((m) => m.type === "error")).message).toContain("부족");
  p.ws.close();
  const restored = new Peer(p.token);
  const hello = await restored.wait((m) => m.type === "hello");
  expect(hello.profile.unlocks).toContain("sg");
  expect(hello.profile.credits).toBe(80);
  restored.ws.close();
});

it("assigns leadership to a new joiner when every previous member is disconnected", async () => {
  const first = new Peer();
  await first.wait((m) => m.type === "hello");
  first.send({ type: "create", name: "First" });
  const initial = await first.wait((m) => m.type === "state");
  first.ws.close();
  await pause(100);
  const second = new Peer();
  await second.wait((m) => m.type === "hello");
  second.send({ type: "join", code: initial.room.code, name: "Second" });
  const joined = await second.wait((m) => m.type === "state");
  expect(joined.room.host).toBe(second.id);
  second.send({ type: "ready" });
  await second.wait(
    (m) =>
      m.type === "state" &&
      m.room.players.find((p: any) => p.id === second.id)?.ready,
  );
  second.send({ type: "start" });
  await second.wait((m) => m.type === "state" && m.room.phase === "playing");
  second.ws.close();
});

it("heartbeat messages do not trigger redundant room broadcasts", async () => {
  const p = new Peer();
  await p.wait((m) => m.type === "hello");
  p.send({ type: "create", name: "Heartbeat" });
  await p.wait((m) => m.type === "state");
  p.clear();
  for (let i = 0; i < 20; i++) p.send({ type: "ping" });
  await pause(150);
  expect(
    p.messages.filter((m) => m.type === "state").length,
  ).toBeLessThanOrEqual(5);
  p.ws.close();
});

it("does not serve profile tokens through the development HTTP server", async () => {
  const p = new Peer();
  await p.wait((m) => m.type === "hello");
  for (const path of [
    "/" + basename(dir) + "/profiles.json",
    "/@fs/" + dir.replaceAll("\\", "/") + "/profiles.json",
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = await response.text();
    expect(response.status).toBe(403);
    expect(body.includes(p.token)).toBe(false);
  }
  p.ws.close();
});
