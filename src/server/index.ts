import { validateLoadout, isPrimary, migrateLoadout } from "../shared/loadout";
import {
  timerSample,
  tickSample,
  packetSample,
  measurements,
} from "./measurements";
import { forceBudget } from "../game/budgets";
import { visibleWorld } from "./visibility";
import { RULES } from "../shared/rules";
import { difficulty } from "../shared/difficulty";
import { packRoom, type StreamCursor } from "../shared/snapshot";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Store } from "./store";
import {
  CHARACTERS,
  WEAPONS,
  MODS,
  emptyInput,
  type Profile,
  type Player,
  type RoomView,
  type Input,
} from "../shared/data";
import { makePlayer, createWorld, tick } from "../game/simulation";
const port = Number(process.env.PORT || 3000),
  production = process.env.NODE_ENV === "production";
const saveDirectory = resolve(process.env.DATA_DIR || "data");
const store = new Store(saveDirectory);
const vite = production
  ? null
  : await (
      await import("vite")
    ).createServer({
      server: {
        middlewareMode: true,
        fs: {
          deny: [
            ".env",
            ".env.*",
            "*.{crt,pem}",
            "**/.git/**",
            "**/data/**",
            `${saveDirectory.replaceAll("\\", "/")}/**`,
          ],
        },
      },
      appType: "spa",
    });
const server = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (vite) {
    vite.middlewares(req, res);
    return;
  }
  try {
    const path = decodeURIComponent((req.url || "/").split("?")[0]),
      base = resolve("dist"),
      file = resolve(base, "." + (path === "/" ? "/index.html" : path));
    if (!file.startsWith(base + sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    res.setHeader(
      "Content-Type",
      (
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".png": "image/png",
        } as Record<string, string>
      )[extname(file)] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
});
interface Room extends RoomView {
  emptyAt: number;
  run: number;
}
interface Client {
  ws: WebSocket;
  profile: Profile;
  id: string;
  room?: Room;
  last: number;
  messages: number;
  window: number;
  cursor?: StreamCursor;
}
const rooms = new Map<string, Room>(),
  clients = new Map<string, Client>();
const disconnectedAt = new Map<string, number>();
const graceMs = Number(process.env.ROOM_GRACE_MS || 60000);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
const send = (ws: WebSocket, data: unknown) => {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1e6) {
    ws.send(JSON.stringify(data));
    return true;
  }
  return false;
};
function error(c: Client, message: string) {
  send(c.ws, { type: "error", message });
}
function view(room: Room) {
  return {
    code: room.code,
    host: room.host,
    phase: room.phase,
    seed: room.seed,
    difficulty: room.difficulty,
    contract: room.contract,
    players: room.players.map(({ input, inputAt, ...p }) => p),
    world: room.world ? visibleWorld(room.world) : null,
  };
}
function broadcast(r: Room) {
  const publicRoom = view(r);
  for (const p of r.players) {
    const c = clients.get(p.id);
    if (c && c.room === r) {
      const next = packRoom(publicRoom, c.cursor);
      const packet = { type: "state", room: next.room };
      if (send(c.ws, packet)) {
        c.cursor = next.cursor;
        if (r.world) packetSample(r.world, packet);
      }
    }
  }
}
function leave(c: Client) {
  if (!c.room) return;
  const r = c.room,
    p = r.players.find((p) => p.id === c.id);
  if (p) {
    p.connected = false;
    p.input = emptyInput();
    p.ready = false;
  }
  const index = r.players.findIndex((p) => p.id === c.id);
  if (index >= 0) r.players.splice(index, 1);
  disconnectedAt.delete(c.id);
  if (r.host === c.id) r.host = r.players.find((p) => p.connected)?.id || c.id;
  if (!r.players.some((p) => p.connected)) r.emptyAt = Date.now();
  c.room = undefined;
  broadcast(r);
}
function cleanInput(data: Record<string, unknown>): Input {
  const num = (k: string, min: number, max: number) =>
    typeof data[k] === "number" && Number.isFinite(data[k])
      ? Math.max(min, Math.min(max, data[k] as number))
      : 0;
  return {
    dx: num("dx", -1, 1),
    dy: num("dy", -1, 1),
    angle: num("angle", -Math.PI * 2, Math.PI * 2),
    fire: data.fire === true,
    aim: data.aim === true,
    sprint: data.sprint === true,
    reload: data.reload === true,
    interact: data.interact === true,
    revive: data.revive === true,
    slot:
      data.slot === 1 || data.slot === 2 || data.slot === 3
        ? data.slot
        : undefined,
    targetX:
      typeof data.targetX === "number" && Number.isFinite(data.targetX)
        ? Math.max(0, Math.min(6400, data.targetX))
        : undefined,
    targetY:
      typeof data.targetY === "number" && Number.isFinite(data.targetY)
        ? Math.max(0, Math.min(4200, data.targetY))
        : undefined,
  };
}
wss.on("connection", (ws) => {
  let c: Client | undefined;
  const helloTimeout = setTimeout(() => {
    if (!c) ws.close();
  }, 5000);
  ws.on("error", () => {});
  ws.on("message", (raw) => {
    try {
      const m = JSON.parse(raw.toString());
      if (!m || typeof m !== "object") return;
      if (!c) {
        if (m.type !== "hello") return;
        const profile = store.get(
            typeof m.token === "string" ? m.token : undefined,
          ),
          id = profile.token.slice(0, 12);
        const old = clients.get(id);
        if (old) old.ws.close(4000, "New connection");
        c = {
          ws,
          profile,
          id,
          last: Date.now(),
          messages: 0,
          window: Date.now(),
        };
        clients.set(id, c);
        clearTimeout(helloTimeout);
        send(ws, { type: "hello", id, profile });
        for (const room of rooms.values()) {
          const p = room.players.find((p) => p.id === id);
          if (p) {
            c.room = room;
            p.connected = true;
            if (!room.players.some((v) => v.id === room.host && v.connected))
              room.host = id;
            p.input = emptyInput();
            disconnectedAt.delete(id);
            room.emptyAt = 0;
            broadcast(room);
            break;
          }
        }
        return;
      }
      if (clients.get(c.id) !== c) return;
      if (Date.now() - c.window > 1000) {
        c.window = Date.now();
        c.messages = 0;
      }
      if (++c.messages > 100) return;
      c.last = Date.now();
      if (m.type === "ping") return;
      if (m.type === "input") {
        const p = c.room?.players.find((p) => p.id === c!.id);
        if (p && c.room?.phase === "playing") {
          p.input = cleanInput(m);
          p.inputAt = Date.now();
        }
        return;
      }
      if (m.type === "leave") {
        leave(c);
        send(ws, { type: "left" });
        return;
      }
      if (m.type === "buy") {
        if (c.room?.phase === "playing") return;
        const item = String(m.item);
        const weapon = WEAPONS[item as keyof typeof WEAPONS],
          mod = MODS[item as keyof typeof MODS];
        const list = weapon ? c.profile.unlocks : mod ? c.profile.mods : null;
        const price = weapon?.price ?? mod?.price ?? Infinity;
        if (!list || list.includes(item as never)) return;
        if (c.profile.credits < price) {
          error(c, "크레딧이 부족합니다.");
          return;
        }
        c.profile.credits -= price;
        list.push(item as never);
        store.save();
        send(ws, { type: "profile", profile: c.profile });
        return;
      }
      if (m.type === "create" || m.type === "join") {
        if (c.room) {
          error(c, "현재 분대에서 먼저 나가 주세요.");
          return;
        }
        let r: Room | undefined;
        if (m.type === "create") {
          let code;
          do {
            code = randomBytes(3).toString("hex").slice(0, 5).toUpperCase();
          } while (rooms.has(code));
          r = {
            code,
            host: c.id,
            phase: "lobby",
            players: [],
            seed: Math.floor(Math.random() * 999999),
            difficulty: 3,
            contract: "blackout",
            world: null,
            emptyAt: 0,
            run: 0,
          };
          rooms.set(code, r);
        } else {
          r = rooms.get(String(m.code).trim().toUpperCase());
        }
        if (!r) {
          error(c, "분대 코드를 찾을 수 없습니다.");
          return;
        }
        if (r.phase !== "lobby" || r.players.length >= 4) {
          error(c, "출격 중이거나 정원이 찬 분대입니다.");
          return;
        }
        const p = makePlayer(
          c.id,
          String(m.name || "오퍼레이터")
            .trim()
            .slice(0, 14) || "오퍼레이터",
        );
        if (
          c.profile.character &&
          Object.hasOwn(CHARACTERS, c.profile.character)
        )
          p.character = c.profile.character;
        if (Object.hasOwn(CHARACTERS, String(m.character)))
          p.character = m.character;
        const selection = m.loadout
          ? validateLoadout(m.loadout, c.profile)
          : migrateLoadout(
              {
                weapon: m.weapon ?? c.profile.loadout?.primary,
                consumable: c.profile.loadout?.consumable,
              },
              c.profile.unlocks,
            );
        if (!selection) {
          error(c, "유효하지 않거나 해금되지 않은 장비입니다.");
          return;
        }
        p.weapon = selection.primary;
        p.primary = selection.primary;
        p.secondary = selection.secondary;
        p.consumable = selection.consumable;
        c.profile.character = p.character;
        c.profile.loadout = selection;
        store.save();
        if (c.profile.mods.includes(m.mod)) p.mod = m.mod;

        r.players.push(p);
        if (!r.players.some((v) => v.id === r.host && v.connected))
          r.host = c.id;
        c.room = r;
        r.emptyAt = 0;
        broadcast(r);
        return;
      }
      const r = c.room,
        p = r?.players.find((p) => p.id === c!.id);
      if (!r || !p) return;
      if (m.type === "loadout" && r.phase === "lobby") {
        const selection = m.loadout
          ? validateLoadout(m.loadout, c.profile)
          : migrateLoadout(
              {
                weapon: m.weapon ?? c.profile.loadout?.primary,
                consumable: c.profile.loadout?.consumable,
              },
              c.profile.unlocks,
            );
        if (!selection) {
          error(c, "유효하지 않거나 해금되지 않은 장비입니다.");
          return;
        }
        if (Object.hasOwn(CHARACTERS, String(m.character)))
          p.character = m.character;
        p.weapon = selection.primary;
        p.primary = selection.primary;
        p.secondary = selection.secondary;
        p.consumable = selection.consumable;
        c.profile.character = p.character;
        c.profile.loadout = selection;
        store.save();
        if (c.profile.mods.includes(m.mod)) p.mod = m.mod;

        p.ready = false;
      }
      if (m.type === "ready" && r.phase === "lobby") p.ready = !p.ready;
      if (m.type === "settings" && r.phase === "lobby" && r.host === c.id) {
        if (Number.isInteger(m.seed) && m.seed >= 0 && m.seed <= 999999)
          r.seed = m.seed;
        if (m.contract === "blackout" || m.contract === "recon")
          r.contract = m.contract;
        if (
          typeof m.difficulty === "number" &&
          Number.isInteger(m.difficulty) &&
          m.difficulty >= 1 &&
          m.difficulty <= 10
        )
          r.difficulty = m.difficulty;
      }
      if (m.type === "start" && r.phase === "lobby" && r.host === c.id) {
        if (!r.players.filter((p) => p.connected).every((p) => p.ready)) {
          error(c, "모든 오퍼레이터가 준비해야 합니다.");
          return;
        }
        r.world = createWorld(
          randomUUID(),
          r.seed,
          r.players,
          r.difficulty,
          r.contract,
        );
        r.phase = "playing";
        r.run++;
      }
      if (m.type === "return" && r.phase === "result" && r.host === c.id) {
        r.phase = "lobby";
        r.world = null;
        r.players = r.players.filter((p) => p.connected);
        r.players.forEach((p) => (p.ready = false));
        r.seed = (r.seed + 7919) % 1000000;
      }
      broadcast(r);
    } catch {
      if (c) error(c, "요청을 처리할 수 없습니다.");
    }
  });
  ws.on("close", () => {
    clearTimeout(helloTimeout);
    if (!c || clients.get(c.id) !== c) return;
    clients.delete(c.id);
    const r = c.room;
    if (r) {
      const p = r.players.find((p) => p.id === c!.id);
      if (p) {
        p.connected = false;
        p.input = emptyInput();
        p.ready = false;
        disconnectedAt.set(c.id, Date.now());
      }
      if (r.host === c.id)
        r.host = r.players.find((p) => p.connected)?.id || c.id;
      if (!r.players.some((p) => p.connected)) r.emptyAt = Date.now();
      broadcast(r);
    }
  });
});
function saveTrace(r: Room) {
  const file = process.env.QA_TRACE_FILE,
    w = r.world;
  if (!file || !w) return;
  const traceText = JSON.stringify({
    id: w.id,
    seed: w.map.seed,
    width: w.map.width,
    height: w.map.height,
    time: w.time,
    mission: w.mission,
    metrics: w.metrics,
    budgets: forceBudget(w),
    measurements: measurements(w),
    requests: w.reinforcements,
    difficulty: w.difficulty,
    alert: w.alertState,
    responseLog: w.responseLog,
    equipment: w.players.map((p) => ({
      id: p.id,
      primary: p.primary,
      activeSlot: p.activeSlot,
      guns: p.guns,
      consumable: p.consumable,
      count: p.consumableCount,
      hp: p.hp,
    })),
    projectiles: w.projectiles,
    trajectories: w.trajectories,
    sources: w.map.sources,
    actors: w.enemies.map((e) => ({
      id: e.id,
      kind: e.kind,
      x: e.x,
      y: e.y,
      source: e.sourceId,
      request: e.requestId,
      reserve: e.reserve,
      components: e.components,
      turretAngle: e.turretAngle,
      assignment: e.assignment,
      state: e.state,
    })),
    terrain: w.map.obstacles.filter((o) => o.kind === "door"),
  });
  writeFileSync(file, traceText);
  if (["success", "failed"].includes(w.mission.stage))
    writeFileSync(file.replace(/\.json$/, "-completed.json"), traceText);
}
let count = 0;
const interval = setInterval(() => {
  timerSample();
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (r.emptyAt && now - r.emptyAt > graceMs) {
      for (const p of r.players) disconnectedAt.delete(p.id);
      rooms.delete(code);
      continue;
    }
    for (let i = r.players.length - 1; i >= 0; i--) {
      const p = r.players[i];
      if (!p.connected && now - (disconnectedAt.get(p.id) ?? now) > graceMs) {
        r.players.splice(i, 1);
        disconnectedAt.delete(p.id);
      }
    }
    if (
      r.phase === "playing" &&
      r.world &&
      r.players.some((p) => p.connected)
    ) {
      for (const p of r.players)
        if (now - p.inputAt > 250) p.input = emptyInput();
      const tickStart = performance.now();
      tick(r.world, 1 / RULES.tickRate);
      tickSample(r.world, performance.now() - tickStart);
      if (process.env.QA_TRACE_FILE && count % 150 === 0) saveTrace(r);
      if (["success", "failed"].includes(r.world.mission.stage)) {
        saveTrace(r);
        r.phase = "result";
        for (const p of r.players) {
          const profile = [...store.profiles.values()].find((v) =>
            v.token.startsWith(p.id),
          );
          if (profile) {
            const reward = Math.round(
              r.world.mission.reward * difficulty(r.difficulty).reward,
            );
            store.settle(
              profile,
              r.world.id,
              reward,
              r.world.mission.stage === "success",
              p.kills,
            );
            const client = clients.get(p.id);
            if (client) send(client.ws, { type: "profile", profile });
          }
        }
      }
    }
    if (count % (RULES.tickRate / RULES.snapshotRate) === 0) broadcast(r);
  }
  count++;
  for (const c of clients.values()) if (now - c.last > 15000) c.ws.terminate();
}, 1000 / RULES.tickRate);
server.listen(port, "0.0.0.0", () =>
  console.log(`DOLL SQUAD ready: http://localhost:${port}`),
);
async function shutdown() {
  clearInterval(interval);
  for (const c of clients.values()) c.ws.close();
  wss.close();
  await vite?.close();
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
