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
  rng,
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
export function spawnEnemy(w: World, pos: Vec, kind: EnemyKind) {
  if (blocked(pos, w.map.obstacles, 20)) return;
  w.enemies.push({
    ...pos,
    id: `e${++w.eventId}`,
    kind,
    hp: ENEMIES[kind].hp,
    angle: 0,
    cooldown: 1 + random(w),
    windup: 0,
    target: null,
    lastSeen: null,
    memory: 0,
    path: [],
    repath: 0,
    hurt: 0,
    home: { ...pos },
  });
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
      relays: [0, 0],
      plant: 0,
      timer: RULES.defenseSeconds,
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
  };
  const r = rng(seed + 7);
  for (const [x, y] of [
    [700, 280],
    [750, 800],
    [820, 1180],
    [1170, 580],
    [1330, 980],
    [1330, 1550],
    [1730, 250],
    [1800, 730],
    [1820, 1020],
    [2150, 680],
    [2180, 1370],
    [360, 920],
    [800, 1530],
    [1280, 210],
    [1740, 1480],
  ]) {
    const pos = { x: x + r() * 45, y: y + r() * 40 };
    if (distance(pos, map.spawn) > 500)
      spawnEnemy(
        w,
        pos,
        (["rifle", "rifle", "rush", "heavy"] as EnemyKind[])[
          Math.floor(r() * 4)
        ],
      );
  }
  return w;
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
  let spread =
    (gun.spread + (moving ? gun.moving : 0) + p.recoil) *
    (p.input.aim ? 0.48 : 1) *
    (p.mod === "loader" ? 1.1 : 1);
  p.ammo--;
  p.cooldown = gun.rate;
  p.recoil = Math.min(
    0.12,
    p.recoil + gun.recoil * (p.mod === "stabilizer" ? 0.7 : 1),
  );
  for (let n = 0; n < gun.pellets; n++) {
    const a = p.angle + (random(w) - 0.5) * 2 * spread;
    let length = wallDistance(p, a, gun.range * 1.25, w.map),
      hit: World["enemies"][number] | undefined;
    const dx = Math.cos(a),
      dy = Math.sin(a);
    for (const e of w.enemies) {
      if (e.hp <= 0) continue;
      const ex = e.x - p.x,
        ey = e.y - p.y,
        along = ex * dx + ey * dy,
        perp = Math.abs(ex * dy - ey * dx);
      if (along > 0 && perp < 22) {
        const contact = along - Math.sqrt(22 * 22 - perp * perp);
        if (contact < length) {
          length = Math.max(0, contact);
          hit = e;
        }
      }
    }
    if (hit) {
      const falloff = Math.max(
        0.3,
        1 - Math.max(0, length - gun.range * 0.55) / (gun.range * 0.9),
      );
      hit.hp -=
        gun.damage *
        falloff *
        (1 - ENEMIES[hit.kind].armor * (1 - gun.penetration));
      hit.hurt = 0.15;
      event(w, { type: "hit", x: hit.x, y: hit.y, actor: p.id });
      if (hit.hp <= 0) {
        p.kills++;
        event(w, { type: "kill", x: hit.x, y: hit.y, actor: p.id });
      }
    }
    event(w, {
      type: "shot",
      x: p.x,
      y: p.y,
      toX: p.x + dx * length,
      toY: p.y + dy * length,
      weapon: p.weapon,
      actor: p.id,
    });
  }
}
function enemyAI(w: World, dt: number, difficulty: number) {
  const live = w.players.filter((p) => p.connected && !p.down);
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    const spec = ENEMIES[e.kind];
    e.cooldown -= dt;
    e.repath -= dt;
    e.hurt = Math.max(0, e.hurt - dt);
    e.memory -= dt;
    const seen = live
      .filter((p) => distance(e, p) < 760 && visible(e, p, w.map))
      .sort((a, b) => distance(e, a) - distance(e, b));
    const target = seen[0];
    if (target) {
      e.target = target.id;
      e.lastSeen = { x: target.x, y: target.y };
      e.memory = 5;
    }
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) {
        let len = wallDistance(e, e.angle, spec.range, w.map);
        let victim: Player | undefined;
        for (const p of live) {
          const dx = p.x - e.x,
            dy = p.y - e.y,
            along = dx * Math.cos(e.angle) + dy * Math.sin(e.angle),
            perp = Math.abs(dx * Math.sin(e.angle) - dy * Math.cos(e.angle));
          if (along > 0 && along < len && perp < 17) {
            len = along;
            victim = p;
          }
        }
        if (victim) damagePlayer(w, victim, spec.damage * difficulty);
        event(w, {
          type: "shot",
          x: e.x,
          y: e.y,
          toX: e.x + Math.cos(e.angle) * len,
          toY: e.y + Math.sin(e.angle) * len,
          enemy: true,
        });
        e.cooldown = spec.delay;
      }
      continue;
    }
    if (target && distance(e, target) < spec.range) {
      if (e.cooldown <= 0) {
        e.angle =
          Math.atan2(target.y - e.y, target.x - e.x) + (random(w) - 0.5) * 0.12;
        e.windup = spec.windup;
      }
      if (e.kind !== "rush" && distance(e, target) < 170) {
        const a = Math.atan2(e.y - target.y, e.x - target.x);
        move(
          e,
          Math.cos(a) * spec.speed * dt,
          Math.sin(a) * spec.speed * dt,
          w.map,
          19,
        );
      }
      continue;
    }
    let goal: Vec | undefined;
    if (e.memory > 0 && e.lastSeen) goal = e.lastSeen;
    else {
      e.target = null;
      if (e.repath <= 0) {
        const a = random(w) * Math.PI * 2;
        goal = {
          x: e.home.x + Math.cos(a) * 100,
          y: e.home.y + Math.sin(a) * 100,
        };
      }
    }
    if (goal && e.repath <= 0) {
      // Riflemen choose a reachable cover edge while pursuing a remembered target.
      if (e.kind === "rifle" && e.memory > 0 && !target) {
        const covers = w.map.obstacles.filter(
          (o) => o.kind !== "wall" && distance(e, o) < 220,
        );
        const cover = covers[0];
        if (cover) {
          const side = e.x < cover.x ? cover.x - 45 : cover.x + cover.w + 45;
          const candidate = { x: side, y: cover.y + cover.h / 2 };
          if (!blocked(candidate, w.map.obstacles, 20)) goal = candidate;
        }
      }
      e.path = findPath(e, goal, w.map);
      e.repath = 0.8 + random(w) * 0.6;
    }
    if (e.path.length) {
      const point = e.path[0],
        d = distance(e, point);
      if (d < 8) e.path.shift();
      else {
        const speed = spec.speed * (e.memory > 0 ? 1 : 0.45);
        e.angle = Math.atan2(point.y - e.y, point.x - e.x);
        move(
          e,
          ((point.x - e.x) / d) * speed * dt,
          ((point.y - e.y) / d) * speed * dt,
          w.map,
          19,
        );
      }
    }
  }
  w.enemies = w.enemies.filter((e) => e.hp > 0);
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
        205 *
        CHARACTERS[p.character].speed *
        (input.sprint ? 1.5 : input.aim ? 0.62 : 1) *
        (p.mod === "stabilizer" ? 0.96 : 1);
      move(
        p,
        (input.dx / Math.max(1, len)) * speed * dt,
        (input.dy / Math.max(1, len)) * speed * dt,
        w.map,
      );
      p.moving = true;
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
      event(w, { type: "reload", x: p.x, y: p.y, actor: p.id });
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
  if (m.stage === "infiltrate") {
    m.relays = m.relays.map((progress, i) =>
      Math.min(6, progress + (near(w.map.relays[i]) ? dt : 0)),
    );
    if (m.relays.every((v) => v >= 6)) {
      m.stage = "plant";
      event(w, { type: "alarm", ...w.map.core });
    }
  } else if (m.stage === "plant") {
    if (near(w.map.core)) m.plant += dt;
    if (m.plant >= 5) {
      m.stage = "defend";
      m.timer = RULES.defenseSeconds;
      m.wave = 0;
      event(w, { type: "alarm", ...w.map.core });
    }
  } else if (m.stage === "defend") {
    m.timer -= dt;
    const wave =
      Math.floor((RULES.defenseSeconds - m.timer) / RULES.waveInterval) + 1;
    if (m.timer > 0 && wave > m.wave) {
      m.wave = wave;
      const count = 2 + Math.ceil(live.length * 0.75);
      const pads = [
        { x: 1775, y: 300 },
        { x: 2180, y: 900 },
        { x: 1700, y: 1500 },
        { x: 1220, y: 850 },
      ];
      for (let i = 0; i < count && w.enemies.length < 22; i++) {
        const pos = pads[(wave + i) % pads.length];
        spawnEnemy(
          w,
          { x: pos.x + (i % 2) * 45, y: pos.y + Math.floor(i / 2) * 45 },
          i % 3 === 0 ? "heavy" : i % 2 === 0 ? "rifle" : "rush",
        );
      }
    }
    if (m.timer <= 0) {
      m.stage = "extract";
      event(w, { type: "explode", ...w.map.core });
    }
  } else if (m.stage === "extract") {
    const connected = w.players.filter((p) => p.connected);
    const all =
      connected.length > 0 &&
      connected.every((p) => !p.down && distance(p, w.map.extract) < 120);
    m.extract = all ? m.extract + dt : 0;
    if (m.extract >= 5) finish(w, true, "핵심 시설 파괴 · 전원 복귀 완료");
  }
  enemyAI(w, dt, hard ? 1.4 : 1);
  if (m.elapsed > 900) finish(w, false, "작전 시간 15분 초과");
}
