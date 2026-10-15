import { enemyAI } from "./squads";
import { initialAlert, tickAlert, raiseAlert } from "./alert";
import { noise } from "./perception";
import { initialVision, updateVision } from "./visibility";
import { RULES } from "../shared/rules";
import {
  CHARACTERS,
  WEAPONS,
  ENEMIES,
  emptyInput,
  type Player,
  type World,
  type Vec,
  type EnemyKind,
  type Enemy,
  type GameEvent,
  type WeaponId,
} from "../shared/data";
import {
  generateMap,
  distance,
  move,
  visible,
  wallDistance,
  findPath,
  blocked,
} from "./map";
export function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    character: "aria",
    weapon: "ar",
    mod: "none",
    x: 240,
    y: 260,
    hp: 100,
    ammo: 30,
    reserve: 240,
    angle: 0,
    down: false,
    connected: true,
    ready: false,
    reload: 0,
    cooldown: 0,
    recoil: 0,
    kills: 0,
    reviveProgress: 0,
    hurt: 0,
    moving: false,
    input: emptyInput(),
    inputAt: 0,
  };
}
export function random(w: World) {
  w.random = (Math.imul(1664525, w.random) + 1013904223) >>> 0;
  return w.random / 4294967296;
}
export function event(w: World, e: Omit<GameEvent, "id">) {
  w.events.push({ ...e, id: ++w.eventId });
  if (w.events.length > 160) w.events.splice(0, w.events.length - 160);
}
export function spawnEnemy(
  w: World,
  pos: Vec,
  kind: EnemyKind,
  options: Partial<Enemy> = {},
) {
  if (blocked(pos, w.map.obstacles, 20)) return;
  w.enemies.push({
    ...pos,
    id: `e${++w.eventId}`,
    kind,
    hp: ENEMIES[kind].hp,
    angle: 0,
    cooldown: 0,
    windup: 0,
    target: null,
    lastSeen: null,
    memory: 0,
    path: [],
    repath: 0,
    hurt: 0,
    stagger: 0,
    zone: -1,
    burst: 0,
    home: { ...pos },
    role: kind === "heavy" ? "anchor" : random(w) < 0.4 ? "flank" : "assault",
    alert: 0,
    tactical: null,
    squad: "squad-" + Math.floor(w.eventId / 3),
    state: "PATROL",
    stateTime: 0,
    seenAt: -100,
    heardNoise: 0,
    radio: 0,
    patrol: [],
    patrolIndex: 0,
    reserve: false,
    sourceId: "initial",
    requestId: "",
    ...options,
  });
  const e = w.enemies.at(-1)!;
  const squad = (w.squads[e.squad] ??= {
    id: e.squad,
    leader: e.id,
    members: [],
    lastSeen: null,
    direction: { x: 0, y: 0 },
    observedAt: -100,
    confidence: "heard",
    callAt: -20,
  });
  squad.members.push(e.id);
  return e;
}
export function createWorld(
  id: string,
  seed: number,
  players: Player[],
): World {
  const map = generateMap(seed);
  players.forEach((p, i) => {
    Object.assign(p, {
      x: map.spawn.x + (i % 2) * 60,
      y: map.spawn.y + Math.floor(i / 2) * 60,
      hp: 100,
      down: false,
      ammo: WEAPONS[p.weapon].mag,
      reserve: WEAPONS[p.weapon].reserve,
      reload: 0,
      cooldown: 0,
      recoil: 0,
      kills: 0,
      hurt: 0,
      reviveProgress: 0,
      input: emptyInput(),
    });
  });
  const w: World = {
    id,
    map,
    players,
    enemies: [],
    mission: {
      stage: "infiltrate",
      checkpoint: 0,
      encounters: [],
      pressure: 0,
      timer: RULES.meltdownSeconds,
      extract: 0,
      elapsed: 0,
      intel: false,
      intelProgress: 0,
      wave: 0,
      reward: 0,
      reason: "",
    },
    events: [],
    eventId: 0,
    time: 0,
    random: seed >>> 0,
    visibility: initialVision(map),
    alertState: initialAlert(),
    squads: {},
    noises: [],
    noiseId: 0,
    supportSignals: [],
  };
  w.mission.encounters = map.route.slice(1, 10).map((zone, index) => ({
    zone,
    wave: 0,
    total: index === 4 || index === 8 ? 3 : 2,
    spawned: false,
    cleared: false,
  }));
  // Front guards are live from insertion; later fights wake when the squad approaches.
  spawnEncounter(w, map.route[1], 0, players.length);
  w.mission.encounters[0].spawned = true;
  updateVision(w, true);
  return w;
}
export function spawnEncounter(
  w: World,
  zoneId: number,
  wave: number,
  team: number,
  pursuit = false,
) {
  const zone = w.map.zones[zoneId];
  if (!zone) return;
  const count = pursuit ? 2 + team : 3 + team;
  for (let i = 0; i < count && w.enemies.length < 30; i++) {
    const pad = zone.pads[(i + wave * 2) % zone.pads.length];
    if (!pad) continue;
    const pos = {
      x: pad.x + (Math.floor(i / zone.pads.length) % 2) * 45,
      y: pad.y,
    };
    if (
      w.players.some(
        (p) =>
          p.connected &&
          !p.down &&
          distance(p, pos) < 220 &&
          visible(p, pos, w.map),
      )
    )
      continue;
    const before = w.enemies.length;
    spawnEnemy(
      w,
      pos,
      (i + wave) % 5 === 0 ? "heavy" : (i + wave) % 3 === 0 ? "rush" : "rifle",
    );
    if (w.enemies.length > before) {
      const e = w.enemies.at(-1)!;
      e.zone = zoneId;
      if (pursuit) {
        const p = w.players.find((p) => p.connected && !p.down);
        if (p) {
          e.lastSeen = { x: p.x, y: p.y };
          e.memory = 12;
        }
      }
    }
  }
}
export function damagePlayer(w: World, p: Player, amount: number) {
  if (p.down) return;
  p.hp = Math.max(0, p.hp - amount);
  p.hurt = 4;
  event(w, { type: "hit", x: p.x, y: p.y, actor: p.id, enemy: true });
  if (!p.hp) {
    p.down = true;
    p.reload = 0;
    p.input = emptyInput();
  }
}
export function fire(w: World, p: Player) {
  const gun = WEAPONS[p.weapon],
    moving = p.moving;
  // Physics stays on the shared ground plane; the renderer projects rays to torso height.
  const origin = p;
  let spread =
    (gun.spread + (moving ? gun.moving : 0) + p.recoil) *
    (p.input.aim ? 0.48 : 1) *
    (p.mod === "loader" ? 1.1 : 1);
  noise(w, p, 900, "gunfire");
  raiseAlert(w, 3, "총성", p);
  p.ammo--;
  p.cooldown = gun.rate;
  p.recoil = Math.min(
    0.12,
    p.recoil + gun.recoil * (p.mod === "stabilizer" ? 0.7 : 1),
  );
  const impacts = new Map<
    string,
    { e: World["enemies"][number]; damage: number }
  >();
  for (let n = 0; n < gun.pellets; n++) {
    // Stratified pellets preserve the shotgun cone without lottery-like empty shots.
    const offset =
      gun.pellets > 1
        ? ((n / (gun.pellets - 1)) * 2 - 1) * spread + (random(w) - 0.5) * 0.012
        : (random(w) - 0.5) * 2 * spread;
    const a = p.angle + offset;
    const maximum = gun.range * 1.25;
    let length = wallDistance(origin, a, maximum, w.map),
      hit: World["enemies"][number] | undefined;
    const dx = Math.cos(a),
      dy = Math.sin(a);
    for (const e of w.enemies) {
      if (e.hp <= 0) continue;
      const ex = e.x - origin.x,
        ey = e.y - origin.y,
        along = ex * dx + ey * dy,
        perp = Math.abs(ex * dy - ey * dx);
      if (along > 0 && perp < 27) {
        const contact = along - Math.sqrt(27 * 27 - perp * perp);
        if (contact < length) {
          length = Math.max(0, contact);
          hit = e;
        }
      }
    }
    let deviceHit: World["map"]["devices"][number] | undefined;
    if (w.mission.stage === "destroy")
      for (const device of w.map.devices) {
        if (device.hp <= 0) continue;
        const ex = device.x - origin.x,
          ey = device.y - origin.y,
          along = ex * dx + ey * dy,
          perp = Math.abs(ex * dy - ey * dx);
        if (along > 0 && perp < 32) {
          const contact = along - Math.sqrt(32 * 32 - perp * perp);
          if (contact < length) {
            length = contact;
            hit = undefined;
            deviceHit = device;
          }
        }
      }
    if (deviceHit) {
      deviceHit.hp = Math.max(0, deviceHit.hp - gun.damage);
      event(w, {
        type: deviceHit.hp === 0 ? "explode" : "hit",
        ...deviceHit,
        actor: p.id,
        weapon: p.weapon,
        damage: gun.damage,
      });
    }
    if (hit) {
      const falloff = Math.max(
        gun.id === "sg" ? 0.15 : 0.3,
        1 -
          Math.max(0, length - gun.range * (gun.id === "sg" ? 0.3 : 0.55)) /
            (gun.range * (gun.id === "sg" ? 0.6 : 0.9)),
      );
      const damage =
        gun.damage *
        falloff *
        (1 - ENEMIES[hit.kind].armor * (1 - gun.penetration));
      hit.hp -= damage;
      hit.hurt = 0.18;
      hit.stagger = Math.max(
        hit.stagger,
        gun.id === "sg" ? 0.22 : gun.id === "ar" ? 0.08 : 0.035,
      );
      const prior = impacts.get(hit.id);
      impacts.set(hit.id, { e: hit, damage: (prior?.damage ?? 0) + damage });
      if (hit.hp <= 0) {
        p.kills++;
        event(w, {
          type: "kill",
          x: hit.x,
          y: hit.y,
          actor: p.id,
          weapon: p.weapon,
          angle: a,
        });
      }
    }
    event(w, {
      type: "shot",
      x: origin.x,
      y: origin.y,
      toX: origin.x + dx * length,
      toY: origin.y + dy * length,
      weapon: p.weapon,
      actor: p.id,
      pellet: n > 0,
      impact: !!hit || !!deviceHit || length < maximum,
      angle: a,
    });
  }
  for (const { e, damage } of impacts.values())
    event(w, {
      type: "hit",
      x: e.x,
      y: e.y,
      actor: p.id,
      weapon: p.weapon,
      damage,
      angle: p.angle,
    });
}
export function finish(w: World, success: boolean, reason: string) {
  if (["success", "failed"].includes(w.mission.stage)) return;
  w.mission.stage = success ? "success" : "failed";
  w.mission.reason = reason;
  w.mission.reward =
    (success ? 300 : 60) +
    Math.min(
      180,
      w.players.reduce((n, p) => n + p.kills * 4, 0),
    ) +
    (w.mission.intel ? 100 : 0);
  event(w, { type: success ? "explode" : "alarm", ...w.map.core });
}
export function tick(w: World, dt: number, hard = false) {
  if (["success", "failed"].includes(w.mission.stage)) return;
  dt = Math.min(0.1, Math.max(0, dt));
  w.time += dt;
  w.mission.elapsed += dt;
  for (const p of w.players) {
    p.hurt = Math.max(0, p.hurt - dt);
    p.recoil = Math.max(0, p.recoil - dt * 0.045);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.moving = false;
    if (!p.connected || p.down) continue;
    const input = p.input;
    const len = Math.hypot(input.dx, input.dy);
    p.angle = input.angle;
    if (len) {
      const speed =
        RULES.moveSpeed *
        CHARACTERS[p.character].speed *
        (input.sprint ? RULES.sprintSpeed : input.aim ? RULES.aimSpeed : 1) *
        (p.mod === "stabilizer" ? 0.96 : 1);
      move(
        p,
        (input.dx / Math.max(1, len)) * speed * dt,
        (input.dy / Math.max(1, len)) * speed * dt,
        w.map,
      );
      p.moving = true;
      if (Math.floor((w.time - dt) / 0.8) !== Math.floor(w.time / 0.8))
        noise(w, p, input.sprint ? 360 : 150, "steps");
    }
    if (p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) {
        const add = Math.min(WEAPONS[p.weapon].mag - p.ammo, p.reserve);
        p.ammo += add;
        p.reserve -= add;
        p.reload = 0;
      }
    }
    if (
      (input.reload || (!p.ammo && input.fire)) &&
      p.ammo < WEAPONS[p.weapon].mag &&
      p.reserve > 0 &&
      p.reload === 0
    ) {
      p.reload = WEAPONS[p.weapon].reload * (p.mod === "loader" ? 0.8 : 1);
      event(w, {
        type: "reload",
        x: p.x,
        y: p.y,
        actor: p.id,
        weapon: p.weapon,
      });
    }
    if (
      input.fire &&
      !input.sprint &&
      !input.interact &&
      !input.revive &&
      p.cooldown <= 0 &&
      p.reload <= 0 &&
      p.ammo > 0
    )
      fire(w, p);
    // A small recovery buffer makes solo runs viable without removing supply value.
    if (p.hurt === 0 && p.hp < 45) p.hp = Math.min(45, p.hp + dt * 3);
  }
  for (const p of w.players.filter((p) => p.down)) {
    const rescuers = w.players.filter(
      (o) =>
        o.connected &&
        !o.down &&
        o.input.revive &&
        distance(o, p) < 85 &&
        visible(o, p, w.map),
    );
    p.reviveProgress = rescuers.length
      ? p.reviveProgress +
        dt * Math.max(...rescuers.map((o) => CHARACTERS[o.character].revive))
      : Math.max(0, p.reviveProgress - dt);
    if (p.reviveProgress >= 3) {
      p.down = false;
      p.hp = 55;
      p.hurt = 4;
      p.reviveProgress = 0;
      event(w, { type: "revive", x: p.x, y: p.y, actor: p.id });
    }
  }
  const live = w.players.filter((p) => p.connected && !p.down);
  if (w.players.some((p) => p.connected) && !live.length) {
    finish(w, false, "모든 오퍼레이터가 쓰러졌습니다");
    return;
  }
  const near = (v: Vec, r = 90) =>
    live.some(
      (p) => p.input.interact && distance(p, v) < r && visible(p, v, w.map),
    );
  for (const s of w.map.supplies) {
    if (!s.used && near(s)) {
      s.used = true;
      for (const p of w.players.filter(
        (p) => p.connected && distance(p, s) < 200 && !p.down,
      )) {
        p.hp = 100;
        p.reserve += Math.floor(WEAPONS[p.weapon].reserve * 0.55);
      }
      event(w, { type: "supply", ...s });
    }
  }
  const m = w.mission;
  if (!m.intel && near(w.map.intel)) {
    m.intelProgress += dt;
    if (m.intelProgress >= 3) m.intel = true;
  }
  // A checkpoint advances through combat clearance, never a long interaction timer.
  if (["infiltrate", "breach", "destroy"].includes(m.stage)) {
    const nextPatrol = m.encounters[m.checkpoint + 1];
    if (
      nextPatrol &&
      !nextPatrol.spawned &&
      live.some((p) => distance(p, w.map.zones[nextPatrol.zone].center) < 1050)
    ) {
      spawnEncounter(w, nextPatrol.zone, 0, live.length);
      nextPatrol.spawned = true;
    }
    const encounter = m.encounters[m.checkpoint];
    if (encounter && !encounter.cleared) {
      const zone = w.map.zones[encounter.zone];
      if (
        !encounter.spawned &&
        live.some((p) => distance(p, zone.center) < 670)
      ) {
        spawnEncounter(w, encounter.zone, encounter.wave, live.length);
        encounter.spawned = true;
        event(w, { type: "alarm", ...zone.center });
      }
      const guards = w.enemies.filter(
        (e) => e.zone === encounter.zone && e.hp > 0,
      );
      if (encounter.spawned && guards.length === 0) {
        encounter.wave++;
        if (encounter.wave < encounter.total) {
          spawnEncounter(w, encounter.zone, encounter.wave, live.length);
        } else {
          encounter.cleared = true;
          m.checkpoint++;
          event(w, { type: "supply", ...zone.center });
        }
      }
    }
    const nextStage =
      m.checkpoint < Math.min(2, m.encounters.length)
        ? "infiltrate"
        : m.checkpoint < m.encounters.length
          ? "breach"
          : "destroy";
    if (m.stage !== nextStage) {
      m.stage = nextStage;
      event(w, { type: "alarm", ...w.map.core });
    }
    if (m.stage === "destroy" && w.map.devices.every((d) => d.hp <= 0)) {
      m.stage = "extract";
      m.timer = RULES.meltdownSeconds;
      m.pressure = 0;
      spawnEncounter(w, w.map.route.at(-1)!, 0, live.length, true);
      event(w, { type: "explode", ...w.map.core });
    }
  } else if (m.stage === "extract") {
    m.timer = Math.max(0, m.timer - dt);
    m.pressure += dt;
    if (m.pressure >= RULES.waveInterval) {
      m.pressure = 0;
      m.wave++;
      const rear =
        w.map.zones[w.map.route[Math.max(0, w.map.route.length - 3)]];
      spawnEncounter(w, rear.id, m.wave, live.length, true);
    }
    const connected = w.players.filter((p) => p.connected);
    const all =
      connected.length > 0 &&
      connected.every((p) => !p.down && distance(p, w.map.extract) < 140);
    m.extract = all ? m.extract + dt : 0;
    if (m.extract >= RULES.extractSeconds)
      finish(w, true, "발전 장치 파괴 · 돌파 및 분대 탈출 완료");
    else if (m.timer <= 0)
      finish(
        w,
        false,
        `시설 붕괴 · ${RULES.meltdownSeconds}초 내 분대 탈출 실패`,
      );
  }

  if (["success", "failed"].includes(m.stage)) return;
  tickAlert(w, dt);
  enemyAI(w, dt, hard ? 1.4 : 1);
  updateVision(w);
  if (m.elapsed > RULES.timeLimit) finish(w, false, "작전 시간 14분 초과");
}
