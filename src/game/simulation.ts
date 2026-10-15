import {tickConsumable,tickSmoke} from "./consumables";
import {rayHit,ensureComponents} from "./armor";
import {applyHit} from "./combat";
import {resetEquipment,saveActive,loadActive,equip,activeGun} from "../shared/loadout";
import {CONSUMABLES} from "../shared/data";
import { enemyRadius, armorMultiplier, armored } from "./armor";
import { launch, tickProjectiles, hurtEnemy } from "./projectiles";
import { objectives, tickObjectives } from "./objectives";
import { tickExtraction } from "./extraction";
import { initializeTheatre } from "./reinforcements";
import { tickDirector } from "./director";
import { enemyAI } from "./squads";
import { initialAlert, tickAlert, raiseAlert } from "./alert";
import { noise } from "./perception";
import { initialVision, updateVision } from "./visibility";
import { RULES } from "../shared/rules";
import { difficulty as difficultyConfig } from "../shared/difficulty";
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
  const p = {
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
    primary: "ar", secondary: "pistol", consumable:"antiarmor",
  } as Player;
  resetEquipment(p);
  return p;
}
export function random(w: World) {
  w.random = (Math.imul(1664525, w.random) + 1013904223) >>> 0;
  return w.random / 4294967296;
}
export function event(w: World, e: Omit<GameEvent, "id">) {
  w.events.push({ ...e, id: ++w.eventId, at: w.time });
  if (w.events.length > 160) w.events.splice(0, w.events.length - 160);
}
export function spawnEnemy(
  w: World,
  pos: Vec,
  kind: EnemyKind,
  options: Partial<Enemy> = {},
) {
  if (blocked(pos, w.map.obstacles, enemyRadius(kind))) return;
  w.enemies.push({
    ...pos,
    id: `e${++w.eventId}`,
    kind,
    elite:
      w.difficulty >= 7 && random(w) < difficultyConfig(w.difficulty).elite,
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
    role:
      kind === "heavy"
        ? "anchor"
        : random(w) < difficultyConfig(w.difficulty).flank
          ? "flank"
          : "assault",
    alert: 0,
    tactical: null,
    squad: "squad-" + Math.floor(w.eventId / 3),
    state: "PATROL",
    stateTime: 0,
    seenAt: -100,
    reportAt: -100,
    reportKind: "heard",
    heardNoise: 0,
    radio: 0,
    patrol: [],
    patrolIndex: 0,
    reserve: false,
    sourceId: "initial",
    requestId: "",
    traveling: false,
    stuck: 0,
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
    callAt: -100,
  });
  squad.members.push(e.id);
  return e;
}
export function createWorld(
  id: string,
  seed: number,
  players: Player[],
  difficulty = 3,
  contract: "blackout" | "recon" = "blackout",
): World {
  const map = generateMap(seed);
  map.smokes=[];
  for(const d of map.installations){
    const zone=[...map.zones].sort((a,b)=>distance(a.center,d)-distance(b.center,d))[0];
    d.angle=Math.atan2(zone.entry.y-d.y,zone.entry.x-d.x);ensureComponents(d);
  }
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
    resetEquipment(p);
  });
  const w: World = {
    id,
    map,
    players,
    enemies: [],
    mission: {
      stage: "recon",
      objectives: objectives(map),
      extraction: {
        state: "locked",
        site: null,
        requested: 0,
        eta: 0,
        departure: 0,
        boarding: 0,
      },
      elapsed: 0,
      intel: false,
      intelProgress: 0,
      reward: 0,
      reason: "",
    },
    difficulty: difficultyConfig(difficulty).level,
    contract,
    events: [],
    eventId: 0,
    time: 0,
    projectiles: [],
    projectileId: 0,
    wrecks: [],
    notices: [],
    responseLog: [],
    random: seed >>> 0,
    visibility: initialVision(map),
    alertState: initialAlert(),
    squads: {},
    noises: [],
    noiseId: 0,
    supportSignals: [],
    reinforcements: [],
    dispatchId: 0,
    dispatchKeys: {},
    trajectories: [],
    director: { next: 30, commsDown: false },
    terrainRevision: 0,
    metrics: {
      firstContact: -1,
      combatSeconds: 0,
      revives: 0,
      primaryAt: -1,
      peakActors: 0,
      objectiveOrder: [],
    },
  };
  initializeTheatre(w);
  updateVision(w, true);
  return w;
}
export function damagePlayer(w: World, p: Player, amount: number) {
  if (p.down) return;
  p.hp = Math.max(0, p.hp - amount);
  p.hurt = 4;
  event(w, { type: "hit", x: p.x, y: p.y, actor: p.id, enemy: true });
  if (!p.hp) {
    p.down = true;
    p.useTime=0;p.useTarget=null;
    p.reload = 0;
    p.input = emptyInput();
  }
}
export function fire(w: World, p: Player) {
  if(p.activeSlot===3||p.switching>0||p.ammo<=0||p.reload>0)return;
  const gun=WEAPONS[p.weapon];
  const spread=(gun.spread+(p.moving?gun.moving:0)+p.recoil)*(p.input.aim?.48:1)*(p.mod==="loader"?1.1:1);
  p.ammo--;p.cooldown=gun.rate;p.recoil=Math.min(.12,p.recoil+gun.recoil*(p.mod==="stabilizer"?.7:1));
  if(p.weapon==="at"){
    const a=p.angle+(random(w)-.5)*2*spread;
    launch(w,p,{x:p.x+Math.cos(a)*gun.range,y:p.y+Math.sin(a)*gun.range},"rocket",p.id,false);
    raiseAlert(w,5,"대전차 발사음",p);saveActive(p);return;
  }
  noise(w,p,900,"gunfire");raiseAlert(w,3,"총성",p);
  for(let n=0;n<gun.pellets;n++){
    const offset=gun.pellets>1?((n/(gun.pellets-1))*2-1)*spread+(random(w)-.5)*.012:(random(w)-.5)*2*spread;
    const a=p.angle+offset,maximum=gun.range*1.25;
    let length=wallDistance(p,a,maximum,w.map),target: Enemy|World["map"]["installations"][number]|undefined,contact: ReturnType<typeof rayHit>=null;
    for(const t of [...w.enemies,...w.map.installations]){
      if(t.hp<=0)continue;const hit=rayHit(t,p,a,length);
      if(hit&&hit.distance<length){length=hit.distance;contact=hit;target=t;}
    }
    if(target&&contact){
      const falloff=Math.max(p.weapon==="sg"?.12:p.weapon==="smg"?.18:.3,1-Math.max(0,length-gun.range*(p.weapon==="sg"?.25:p.weapon==="smg"?.4:.6))/(gun.range*(p.weapon==="sg"?.55:.8)));
      applyHit(w,target,contact,{normal:gun.damage,durable:gun.durableDamage,ap:gun.penetration,falloff},p,p.weapon);
    }
    event(w,{type:"shot",x:p.x,y:p.y,toX:p.x+Math.cos(a)*length,toY:p.y+Math.sin(a)*length,weapon:p.weapon,actor:p.id,pellet:n>0,impact:!!contact||length<maximum,angle:a});
  }
  saveActive(p);
}
export function finish(w: World, success: boolean, reason: string) {
  if (["success", "failed"].includes(w.mission.stage)) return;
  w.mission.stage = success ? "success" : "failed";
  w.mission.reason = reason;
  const complete = w.mission.objectives.filter((o) => o.state === "complete");
  w.mission.reward =
    (success ? 700 : 80) +
    complete.reduce(
      (sum, o) =>
        sum +
        (o.optional
          ? o.reward * (w.contract === "recon" ? 1.5 : 1)
          : success
            ? 100
            : 80),
      0,
    ) +
    Math.min(
      40,
      w.players.reduce((sum, p) => sum + p.kills, 0),
    );

  event(w, { type: success ? "explode" : "alarm", ...w.map.spawn });
}
export function tick(w: World, dt: number) {
  if (["success", "failed"].includes(w.mission.stage)) return;
  dt = Math.min(0.1, Math.max(0, dt));
  w.time += dt;
  w.mission.elapsed += dt;
  for (const p of w.players) {
    p.hurt = Math.max(0, p.hurt - dt);
    saveActive(p);
    for(const gun of Object.values(p.guns)){gun.cooldown=Math.max(0,gun.cooldown-dt);gun.recoil=Math.max(0,gun.recoil-dt*(gun.id==="smg"?0.085:0.045));}
    loadActive(p);
    p.switching=Math.max(0,p.switching-dt);p.useCooldown=Math.max(0,p.useCooldown-dt);
    p.moving = false;
    if (!p.connected || p.down){p.useTime=0;p.useTarget=null;continue;}
    const input = p.input;
    if(input.slot) equip(p,input.slot);
    const len = Math.hypot(input.dx, input.dy);
    p.angle = input.angle;
    if (len) {
      const speed =
        RULES.moveSpeed *
        CHARACTERS[p.character].speed *
        (input.sprint ? RULES.sprintSpeed : input.aim ? RULES.aimSpeed : 1) *
        (p.mod === "stabilizer" ? 0.96 : 1) *
        WEAPONS[p.weapon].speed * (p.useTime>0 ? 0.5 : 1);
      const beforeMove = { x: p.x, y: p.y };
      move(
        p,
        (input.dx / Math.max(1, len)) * speed * dt,
        (input.dy / Math.max(1, len)) * speed * dt,
        w.map,
      );
      if (
        w.map.installations.some(d=>d.hp>0&&distance(p,d)<43&&distance(p,d)<distance(beforeMove,d))||
        w.enemies.some(
          (e) =>
            e.hp > 0 &&
            armored(e.kind) &&
            distance(p, e) < enemyRadius(e.kind) + 16 &&
            distance(p, e) < distance(beforeMove, e),
        )
      )
        Object.assign(p, beforeMove);
      p.moving = distance(p, beforeMove) > 0.01;
      if (Math.floor((w.time - dt) / 0.8) !== Math.floor(w.time / 0.8))
        noise(w, p, input.sprint ? 360 : 150, "steps");
    }
    if (p.activeSlot!==3 && p.switching<=0 && p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) {
        const add = Math.min(WEAPONS[p.weapon].mag - p.ammo, p.reserve);
        p.ammo += add;
        p.reserve -= add;
        p.reload = 0;
      }
    }
    if (
      p.activeSlot!==3 && p.switching<=0 &&
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
      p.activeSlot!==3 && p.switching<=0 &&
      input.fire &&
      !input.sprint &&
      !input.interact &&
      !input.revive &&
      p.cooldown <= 0 &&
      p.reload <= 0 &&
      p.ammo > 0
    )
      fire(w, p);
    tickConsumable(w,p,dt);
    p.fireHeld=input.fire;
    saveActive(p);
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
      w.metrics.revives++;
      p.down = false;
      p.hp = 55;
      p.hurt = 4;
      p.reviveProgress = 0;
      event(w, { type: "revive", x: p.x, y: p.y, actor: p.id });
    }
  }
  tickSmoke(w);
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
        saveActive(p);
        for(const gun of Object.values(p.guns))gun.reserve=Math.min(WEAPONS[gun.id].reserve,gun.reserve+Math.max(1,Math.floor(WEAPONS[gun.id].reserve*0.5)));
        p.consumableCount=Math.min(CONSUMABLES[p.consumable].max,p.consumableCount+1);
        loadActive(p);
      }
      event(w, { type: "supply", ...s });
    }
  }
  const m = w.mission;
  tickProjectiles(w, dt);
  tickObjectives(w, dt);
  tickExtraction(w, dt);
  if (["success", "failed"].includes(m.stage)) return;
  tickAlert(w, dt);
  tickDirector(w, dt);
  enemyAI(w, dt);
  if (w.enemies.some((e) => e.seenAt === w.time)) w.metrics.combatSeconds += dt;
  w.metrics.peakActors = Math.max(w.metrics.peakActors, w.enemies.length);
  updateVision(w);
  if (m.elapsed > RULES.timeLimit) finish(w, false, "작전 제한시간 초과");
}
