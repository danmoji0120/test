import { equipmentSprite } from "../art/equipment";
import { RasterCache } from "./raster-cache";
import {
  hitRegions,
  worldPoint,
  enemyRadius,
  enemyHeight,
  armored,
  special,
} from "../game/armor";
import { paintTerrain } from "./terrain";
import { environmentImage, drawEnvironment } from "../art/environment";
import { operationGoal } from "../shared/operation";
import { lineOfSight } from "../game/visibility";
import { Fog } from "./fog";
import { RULES } from "../shared/rules";
import {
  CHARACTERS,
  WEAPONS,
  CONSUMABLES,
  ENEMIES,
  type World,
  type Player,
  type Enemy,
  type Vec,
  type GameEvent,
  type Input,
} from "../shared/data";
import {
  operatorFrame,
  operatorImage,
  enemyFrame,
  enemyImage,
  v4EnemyImage,
} from "../art/raster";
import { distance, visible, wallDistance } from "../game/map";
import type { AudioEngine } from "./audio";
const TAU = Math.PI * 2;
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
export class Renderer {
  trackedObjective = "";
  fog = new Fog();
  ctx: CanvasRenderingContext2D;
  rasterCache = new RasterCache();
  vignette: HTMLCanvasElement | null = null;
  width = innerWidth;
  height = innerHeight;
  camera = { x: 0, y: 0 };
  mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  world: World | null = null;
  id = "";
  floor: HTMLCanvasElement | null = null;
  mapSeed = -1;
  atlas = operatorImage();
  enemyAtlas = enemyImage();
  v4Atlas = v4EnemyImage();
  environmentAtlas = environmentImage();
  positions = new Map<string, Vec>();
  particles: Particle[] = [];
  trails: (GameEvent & { life: number })[] = [];
  lastEvent = 0;
  lastNotice = "";
  shake = 0;
  hit = 0;
  kill = 0;
  kick = 0;
  flashes: {
    x: number;
    y: number;
    angle: number;
    weapon: string;
    life: number;
  }[] = [];
  debris: { x: number; y: number; angle: number; life: number }[] = [];
  numbers: { x: number; y: number; text: string; life: number }[] = [];
  localInput: (() => Input | null) | null = null;
  nextPreview = 0;
  pendingPreview: number[] = [];
  frames: number[] = [];
  last = performance.now();
  running = false;
  raf = 0;
  zoom = 0.95;
  constructor(
    public canvas: HTMLCanvasElement,
    public audio: AudioEngine,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }
  resize() {
    this.width = innerWidth;
    this.height = innerHeight;
    const dpr = Math.min(devicePixelRatio, 1.5);
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = this.width + "px";
    this.canvas.style.height = this.height + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.zoom = this.width < 1400 ? 0.82 : 0.95;
    this.vignette = document.createElement("canvas");
    this.vignette.width = this.width;
    this.vignette.height = this.height;
    const v = this.vignette.getContext("2d")!,
      shade = v.createRadialGradient(
        this.width / 2,
        this.height / 2,
        this.height * 0.2,
        this.width / 2,
        this.height / 2,
        this.width * 0.65,
      );
    shade.addColorStop(0, "#09101900");
    shade.addColorStop(1, "#090f1977");
    v.fillStyle = shade;
    v.fillRect(0, 0, this.width, this.height);
  }
  set(w: World, id: string) {
    if (this.world?.id !== w.id) {
      this.floor = null;
      this.mapSeed = -1;
      this.lastEvent = w.eventId;
      this.positions.clear();
      this.particles = [];
      this.trails = [];
      this.flashes = [];
      this.debris = [];
      this.numbers = [];
      this.pendingPreview = [];
      this.nextPreview = 0;
      const p = w.players.find((p) => p.id === id)!;
      this.camera = { x: p.x, y: p.y };
    }
    this.world = w;
    this.id = id;
    if (this.mapSeed !== w.map.seed) {
      this.makeFloor(w);
      this.mapSeed = w.map.seed;
    }
    const me = w.players.find((p) => p.id === id);
    const notice = [...(w.notices || [])]
      .reverse()
      .find((n) => n.text.includes("중장갑") && w.time - n.at < 18);
    const noticeKey = notice ? `${w.id}/${notice.at}/${notice.text}` : "";
    if (me && notice && noticeKey !== this.lastNotice) {
      this.lastNotice = noticeKey;
      this.audio.play(
        { id: 0, type: "alarm", x: me.x, y: me.y, heavy: true },
        0,
      );
    }

    for (const e of w.events) {
      if (e.id <= this.lastEvent) continue;
      this.lastEvent = e.id;
      if (me && distance(e, me) < 1100) {
        const previewed =
          e.type === "shot" &&
          !e.pellet &&
          !e.heavy &&
          e.actor === id &&
          this.pendingPreview.length > 0 &&
          performance.now() - this.pendingPreview[0] < 500;
        if (previewed) this.pendingPreview.shift();
        if (!previewed)
          this.audio.play(
            e,
            distance(e, me),
            (e.x - me.x) / Math.max(1, distance(e, me)),
          );
        if (e.obscured) {
          if (e.actor === id) {
            this.hit = 0.18;
            if (e.type === "kill") this.kill = 0.24;
          }
          continue;
        }
        if (
          e.type === "sound" &&
          e.heavy &&
          e.cue === "steps" &&
          distance(e, me) < 600
        )
          this.shake = Math.max(this.shake, 1.6);
        if (e.type === "shot") {
          this.trails.push({ ...e, life: e.weapon === "sg" ? 0.07 : 0.085 });
          if (!e.pellet && !previewed) this.muzzle(e);
          if (e.impact)
            this.burst(
              e.toX!,
              e.toY! - RULES.muzzleHeight - 4,
              e.weapon === "sg" ? 2 : 4,
              "#f5d9a5",
              105,
            );
        } else if (e.type === "hit") {
          if (e.actor === id && e.enemy) this.shake = Math.max(this.shake, 6);
          this.burst(
            e.x,
            e.y - 12,
            e.quality === "ricochet" ? 4 : e.quality === "component" ? 20 : 8,
            e.quality === "ricochet"
              ? "#a8c7de"
              : e.quality === "partial"
                ? "#f5ca70"
                : e.quality === "component"
                  ? "#ff8457"
                  : "#ecf7ca",
            130,
          );
          if (e.actor === id && !e.enemy) {
            this.hit = 0.18;
            const victim = w.enemies.find((target) => target.id === e.target);
            this.numbers.push({
              x: victim?.x ?? e.x,
              y: victim ? victim.y - enemyHeight(victim.kind) - 26 : e.y - 55,
              text:
                e.quality === "component"
                  ? "부품 파괴"
                  : e.quality === "weakpoint"
                    ? `${e.penetrationResult === "partial" ? "부분·" : ""}약점 ${Math.round(e.damage ?? 0)}`
                    : e.quality === "partial"
                      ? `부분 ${Math.round(e.damage ?? 0)}`
                      : e.armored
                        ? "관통 불가"
                        : String(Math.round(e.damage ?? 0)),
              life: 0.55,
            });
          }
        } else if (e.type === "kill") {
          this.burst(e.x, e.y - 12, 22, "#fd9a95", 190);
          this.debris.push({ x: e.x, y: e.y, angle: e.angle ?? 0, life: 3.5 });
          if (this.debris.length > 28) this.debris.shift();
          if (e.actor === id) {
            this.kill = 0.24;
            this.hit = 0.2;
          }
        } else if (e.type === "explode") {
          this.burst(e.x, e.y, 65, "#ffb875", 250);
          this.shake = e.heavy ? 9 : 7;
        }
      }
    }
    // Background tabs may pause RAF while snapshots continue arriving.
    this.trails = this.trails.slice(-120);
    this.flashes = this.flashes.slice(-40);
    this.numbers = this.numbers.slice(-28);
  }
  muzzle(e: GameEvent) {
    const a = e.angle ?? Math.atan2(e.toY! - e.y, e.toX! - e.x);
    this.flashes.push({
      x: e.x,
      y: e.y,
      angle: a,
      weapon: e.heavy ? "heavy" : (e.weapon ?? "enemy"),
      life: 0.075,
    });
    this.burst(
      e.x - Math.sin(a) * 14,
      e.y + Math.cos(a) * 14,
      1,
      "#ddbf78",
      55,
    );
    if (e.actor === this.id) {
      this.kick = e.heavy
        ? 14
        : e.weapon === "sg"
          ? 12
          : e.weapon === "ar"
            ? 5
            : 2.3;
      this.shake = Math.max(
        this.shake,
        e.heavy ? 8 : e.weapon === "sg" ? 9 : e.weapon === "ar" ? 4 : 1.7,
      );
    }
  }
  preview(p: Player, input: Input, now: number) {
    this.pendingPreview = this.pendingPreview.filter((t) => now - t < 500);
    if (
      (input.slot !== undefined && input.slot !== p.activeSlot) ||
      p.activeSlot === 3 ||
      p.switching > 0 ||
      p.weapon === "at" ||
      !input.fire ||
      input.sprint ||
      input.interact ||
      input.revive ||
      input.reload ||
      p.down ||
      p.reload > 0 ||
      p.ammo <= this.pendingPreview.length ||
      now < this.nextPreview
    )
      return;
    this.nextPreview =
      now + (Math.ceil(WEAPONS[p.weapon].rate * 30) / 30) * 1000;
    this.pendingPreview.push(now);
    const e: GameEvent = {
      id: 0,
      type: "shot",
      x: p.x,
      y: p.y,
      angle: input.angle,
      weapon: p.weapon,
      actor: p.id,
    };
    this.muzzle(e);
    this.audio.play(e, 0);
  }
  burst(x: number, y: number, count: number, color: string, speed: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU,
        l = 0.2 + Math.random() * 0.4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: l,
        max: l,
        color,
        size: 1 + Math.random() * 3,
      });
    }
    if (this.particles.length > 400)
      this.particles.splice(0, this.particles.length - 400);
  }
  makeFloor(w: World) {
    const c = document.createElement("canvas");
    c.width = w.map.width;
    c.height = w.map.height;
    paintTerrain(c.getContext("2d")!, w, this.environmentAtlas);
    this.floor = c;
    if (!this.environmentAtlas.complete)
      this.environmentAtlas.addEventListener(
        "load",
        () => {
          if (this.world?.id === w.id) {
            paintTerrain(c.getContext("2d")!, w, this.environmentAtlas);
          }
        },
        { once: true },
      );
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      const now = performance.now(),
        dt = Math.min(0.05, (now - this.last) / 1000);
      this.frames.push(now - this.last);
      if (this.frames.length > 600) this.frames.shift();
      this.last = now;
      this.draw(dt, now / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  screenToWorld(v: Vec) {
    return {
      x: (v.x - this.width / 2) / this.zoom + this.camera.x,
      y: (v.y - this.height / 2) / this.zoom + this.camera.y,
    };
  }
  draw(dt: number, t: number) {
    const w = this.world;
    if (!w) return;
    const g = this.ctx,
      p = w.players.find((p) => p.id === this.id);
    if (!p) return;
    const local = this.localInput?.();
    if (local) this.preview(p, local, performance.now());
    this.kick = Math.max(0, this.kick - dt * 45);
    const aimX = (this.mouse.x - this.width / 2) / this.zoom,
      aimY = (this.mouse.y - this.height / 2) / this.zoom,
      aimLength = Math.hypot(aimX, aimY),
      aimScale = Math.min(
        local?.aim ? 0.32 : 0.23,
        165 / Math.max(1, aimLength),
      ),
      movement = local ?? p.input ?? { dx: 0, dy: 0 };
    const leadX = aimX * aimScale + movement.dx * 48,
      leadY = aimY * aimScale + movement.dy * 48,
      cap = Math.min(1, 195 / Math.max(1, Math.hypot(leadX, leadY)));
    const target = {
      x: p.x + leadX * cap,
      y: p.y + leadY * cap,
    };
    const halfW = this.width / 2 / this.zoom,
      halfH = this.height / 2 / this.zoom;
    target.x = Math.max(halfW, Math.min(w.map.width - halfW, target.x));
    target.y = Math.max(halfH, Math.min(w.map.height - halfH, target.y));
    const blend = 1 - Math.exp(-dt * 6);
    this.camera.x += (target.x - this.camera.x) * blend;
    this.camera.y += (target.y - this.camera.y) * blend;
    g.clearRect(0, 0, this.width, this.height);
    g.save();
    g.translate(
      this.width / 2 +
        (Math.random() - 0.5) * this.shake -
        Math.cos(p.angle) * this.kick * 0.5,
      this.height / 2 +
        (Math.random() - 0.5) * this.shake -
        Math.sin(p.angle) * this.kick * 0.5,
    );
    g.scale(this.zoom, this.zoom);
    g.translate(-this.camera.x, -this.camera.y);
    this.shake = Math.max(0, this.shake - dt * 26);
    if (this.floor) {
      const x = Math.max(0, Math.floor(this.camera.x - halfW - 8)),
        y = Math.max(0, Math.floor(this.camera.y - halfH - 8));
      const width = Math.min(this.floor.width - x, Math.ceil(halfW * 2 + 16)),
        height = Math.min(this.floor.height - y, Math.ceil(halfH * 2 + 16));
      g.drawImage(this.floor, x, y, width, height, x, y, width, height);
    }
    for (const d of this.debris) {
      d.life -= dt;
      g.save();
      g.translate(d.x, d.y);
      g.rotate(d.angle);
      g.globalAlpha = Math.min(0.65, d.life);
      g.fillStyle = "#463c41";
      g.fillRect(-19, -12, 33, 23);
      g.fillStyle = "#a66564";
      g.fillRect(14, -6, 11, 8);
      g.restore();
    }
    this.debris = this.debris.filter((d) => d.life > 0);
    for (const r of w.wrecks || []) {
      drawEnvironment(
        g,
        this.environmentAtlas,
        r.kind === "artillery" ? 9 : 8,
        r.x - 70,
        r.y - 70,
        140,
        110,
      );
    }
    for (const d of w.map.obstacles.filter((o) => o.kind === "door")) {
      g.fillStyle = d.open ? "#6ee4bc45" : "#ab8450";
      g.fillRect(d.x, d.y, d.w, d.h);
      g.strokeStyle = "#f4cd91";
      g.strokeRect(d.x, d.y, d.w, d.h);
    }
    for (const s of w.map.sources) {
      g.fillStyle = s.disabled
        ? "#5c5554"
        : s.warning > w.time
          ? Math.floor(t * 5) % 2
            ? "#ff926e"
            : "#7a4c40"
          : "#a29a76";
      g.fillRect(s.entry.x - 13, s.entry.y - 13, 26, 26);
      if (s.warning > w.time) this.marker(s.entry, "출동 경보", t, "#ffb58d");
    }
    for (const d of w.map.installations.filter((d) => d.kind !== "generator")) {
      g.save();
      g.translate(d.x, d.y);
      g.globalAlpha = d.hp > 0 ? 1 : 0.4;
      drawEnvironment(
        g,
        this.environmentAtlas,
        d.kind === "comms" ? 6 : 5,
        -55,
        -100,
        110,
        120,
      );
      g.globalAlpha = 1;
      if (w.alertState.level >= 3 && d.hp > 0) {
        g.fillStyle = Math.floor(t * 6) % 2 ? "#ff5948" : "#701b19";
        g.beginPath();
        g.arc(0, -85, 6, 0, TAU);
        g.fill();
      }
      g.fillStyle = "#e1bd8b";
      g.fillRect(-30, 25, (60 * d.hp) / d.maxHp, 4);
      g.restore();
      this.marker(
        d,
        (d.kind === "comms"
          ? "통신탑"
          : d.kind === "outpost"
            ? "전초 지휘장치"
            : "병영 관제") + (d.hp > 0 ? " · 사격" : " · 무력화"),
        t,
        "#e5bd9a",
      );
    }
    for (const device of w.map.installations.filter(
      (d) => d.kind === "generator",
    )) {
      const active = true,
        dead = device.hp <= 0;
      g.save();
      g.translate(device.x, device.y);
      g.globalAlpha = dead ? 0.45 : 1;
      drawEnvironment(g, this.environmentAtlas, 4, -55, -75, 110, 95);
      g.globalAlpha = 1;
      g.fillStyle = "#ffd286";
      g.fillRect(-32, 31, 64 * Math.max(0, device.hp / device.maxHp), 5);
      g.restore();
      if (!dead) {
        for (const part of hitRegions(device).filter(
          (r) => r.id === "core" || r.id === "shield",
        )) {
          const pos = worldPoint(device, part);
          g.strokeStyle = part.id === "core" ? "#8ff4d2" : "#eeae80";
          g.lineWidth = 2;
          g.beginPath();
          g.arc(pos.x, pos.y, part.radius, 0, TAU);
          g.stroke();
          if (active)
            this.marker(
              pos,
              part.id === "core"
                ? "노출 핵심부 · AP0"
                : device.components?.shield?.destroyed
                  ? "방호 파괴"
                  : "방호 AV3",
              t,
              part.id === "core" ? "#8ff4d2" : "#eeae80",
            );
        }
      }
    }
    for (const s of w.map.supplies) {
      if (s.used) continue;
      g.fillStyle = "#173f3c";
      g.fillRect(s.x - 23, s.y - 19, 46, 36);
      g.strokeStyle = "#79dbc6";
      g.strokeRect(s.x - 23, s.y - 19, 46, 36);
      g.fillStyle = "#9be9d4";
      g.fillRect(s.x - 3, s.y - 11, 6, 20);
      g.fillRect(s.x - 10, s.y - 4, 20, 6);
    }
    if (!w.mission.intel) {
      this.terminal(
        w.map.intel,
        "DATA",
        w.mission.intelProgress / 3,
        false,
        t,
        "#bcb0f5",
      );
    }
    const ex = w.mission.extraction;
    for (const site of w.map.extractions) {
      const selected = ex.site && distance(site, ex.site) < 1;
      g.strokeStyle = selected ? "#91f8d5" : "#78999b";
      g.fillStyle = selected ? "#77edca22" : "#69888e0d";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(site.x, site.y, 140, 0, TAU);
      g.fill();
      g.stroke();
      if (ex.state === "available" || selected)
        this.marker(
          site,
          ex.state === "available"
            ? "E · 수송 요청"
            : ex.state === "inbound"
              ? "수송 접근 중"
              : "수송기 도착",
          t,
          "#9de5c9",
        );
    }
    if (ex.site && ["inbound", "landed", "departing"].includes(ex.state)) {
      const fraction =
        ex.state === "inbound"
          ? Math.max(
              0,
              Math.min(1, (w.time - ex.requested) / (ex.eta - ex.requested)),
            )
          : 1;
      const ship = {
        x: ex.site.x + (1 - fraction) * 450,
        y: ex.site.y - (1 - fraction) * 1250 - 35,
      };
      g.save();
      g.translate(ship.x, ship.y);
      g.fillStyle = "#0b1725aa";
      g.beginPath();
      g.ellipse(10, 35, 65, 24, 0, 0, TAU);
      g.fill();
      g.fillStyle = "#455e6a";
      g.strokeStyle = "#a3dcdb";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -65);
      g.lineTo(20, -25);
      g.lineTo(70, 0);
      g.lineTo(70, 15);
      g.lineTo(18, 10);
      g.lineTo(14, 60);
      g.lineTo(-14, 60);
      g.lineTo(-18, 10);
      g.lineTo(-70, 15);
      g.lineTo(-70, 0);
      g.lineTo(-20, -25);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#a7ecde";
      g.fillRect(-10, -40, 20, 20);
      g.fillStyle = "#86efdd";
      for (const x of [-60, 60]) {
        g.fillRect(x - 7, 0, 14, 25);
        g.globalAlpha = 0.35;
        g.fillRect(x - 11, 25, 22, 14 + Math.sin(t * 35) * 5);
        g.globalAlpha = 1;
      }
      g.restore();
    }
    for (const e of w.enemies) {
      if (
        e.kind === "heavy" &&
        e.windup > 0 &&
        w.players.some(
          (ally) =>
            ally.connected &&
            !ally.down &&
            distance(ally, e) < 950 &&
            lineOfSight(ally, e, w.map),
        )
      ) {
        g.strokeStyle = "#ff685d80";
        g.setLineDash([8, 5]);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(
          e.x +
            Math.cos(e.turretAngle ?? e.angle) *
              wallDistance(
                e,
                e.turretAngle ?? e.angle,
                ENEMIES[e.kind].range,
                w.map,
              ),
          e.y -
            RULES.muzzleHeight -
            4 +
            Math.sin(e.turretAngle ?? e.angle) *
              wallDistance(
                e,
                e.turretAngle ?? e.angle,
                ENEMIES[e.kind].range,
                w.map,
              ),
        );
        g.stroke();
        g.setLineDash([]);
      }
    }
    if (p.activeSlot === 3 && p.consumable !== "medical" && local?.aim) {
      const item = CONSUMABLES[p.consumable],
        a = Math.atan2(
          (local.targetY ?? p.y) - p.y,
          (local.targetX ?? p.x) - p.x,
        );
      const range = Math.min(
        item.range,
        Math.hypot((local.targetX ?? p.x) - p.x, (local.targetY ?? p.y) - p.y),
      );
      const reach = Math.max(0, wallDistance(p, a, range, w.map) - 3),
        x = p.x + Math.cos(a) * reach,
        y = p.y + Math.sin(a) * reach;
      g.strokeStyle = p.consumable === "antiarmor" ? "#ffc18c" : "#a6e8d7";
      g.lineWidth = 1.5;
      g.setLineDash([5, 5]);
      g.beginPath();
      g.moveTo(p.x, p.y - 16);
      g.lineTo(x, y);
      g.stroke();
      g.beginPath();
      g.arc(x, y, item.radius, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#e6efde";
      g.textAlign = "center";
      g.font = "11px sans-serif";
      g.fillText(
        `예상 투척 · ${(reach / 100).toFixed(1)}m`,
        x,
        y - item.radius - 8,
      );
    }
    for (const q of w.projectiles || []) {
      if (q.kind === "mortar") {
        const remaining = Math.max(0, q.impactAt - w.time),
          total = q.impactAt - q.at,
          progress = 1 - remaining / total;
        g.strokeStyle = Math.floor(t * 10) % 2 ? "#ff674b" : "#ffc677";
        g.fillStyle = "#fd714c22";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(q.target.x, q.target.y, q.radius, 0, TAU);
        g.fill();
        g.stroke();
        g.beginPath();
        g.arc(q.target.x, q.target.y, q.radius * (1 - progress), 0, TAU);
        g.stroke();
        g.fillStyle = "#ffe3b0";
        g.font = "bold 14px sans-serif";
        g.textAlign = "center";
        g.fillText(
          "포격 " + remaining.toFixed(1) + "s",
          q.target.x,
          q.target.y - q.radius - 12,
        );
        const shell =
          q.shell ??
          (q.owner
            ? {
                x: q.x,
                y: q.y,
                height:
                  Math.sin(Math.PI * progress) * 260 + (1 - progress) * 40,
              }
            : undefined);
        if (shell) {
          g.fillStyle = "#fff1c5";
          g.beginPath();
          g.ellipse(shell.x, shell.y - shell.height, 5, 10, 0.4, 0, TAU);
          g.fill();
        }
      } else if (["frag", "antiarmor", "smoke"].includes(q.kind)) {
        const progress = Math.min(1, q.traveled / Math.max(1, q.range)),
          h = Math.sin(progress * Math.PI) * 60;
        g.fillStyle = "#0008";
        g.beginPath();
        g.ellipse(q.x, q.y, 6, 3, 0, 0, TAU);
        g.fill();
        g.fillStyle =
          q.kind === "antiarmor"
            ? "#ffba73"
            : q.kind === "smoke"
              ? "#d3dfe2"
              : "#9de2ba";
        const sprite = equipmentSprite(q.kind);
        if (sprite?.complete && sprite.naturalWidth) {
          const sh = (12 * sprite.naturalHeight) / sprite.naturalWidth;
          this.rasterCache.draw(
            g,
            sprite,
            `thrown/${q.kind}`,
            { x: 0, y: 0, w: sprite.naturalWidth, h: sprite.naturalHeight },
            q.x - 6,
            q.y - h - sh,
            12,
            sh,
          );
        }
      } else {
        g.strokeStyle = q.enemy ? "#ff9371" : "#ffe5a0";
        g.lineWidth = q.kind === "rocket" ? 5 : 4;
        g.beginPath();
        g.moveTo(
          q.x - Math.cos(q.angle) * 28,
          q.y - 16 - Math.sin(q.angle) * 28,
        );
        g.lineTo(q.x, q.y - 16);
        g.stroke();
        g.fillStyle = "#fff2c0";
        g.beginPath();
        g.arc(q.x, q.y - 16, 5, 0, TAU);
        g.fill();
      }
    }
    for (const smoke of w.map.smokes ?? []) {
      const alpha = Math.min(
        0.65,
        Math.max(0, (smoke.until - w.time) / 2) * 0.65,
      );
      const cloud = g.createRadialGradient(
        smoke.x,
        smoke.y,
        20,
        smoke.x,
        smoke.y,
        smoke.radius,
      );
      cloud.addColorStop(0, `rgba(170,184,181,${alpha})`);
      cloud.addColorStop(1, "rgba(151,168,165,0)");
      g.fillStyle = cloud;
      g.beginPath();
      g.arc(smoke.x, smoke.y, smoke.radius, 0, TAU);
      g.fill();
    }
    for (const e of this.trails) {
      e.life -= dt;
      g.globalAlpha = Math.max(0, Math.min(1, e.life / 0.06));
      g.strokeStyle = e.enemy
        ? "#ff8178"
        : e.weapon
          ? WEAPONS[e.weapon].color
          : "#ffe9ac";
      g.lineWidth = e.enemy ? 2 : 2.5;
      g.beginPath();
      g.moveTo(e.x, e.y - RULES.muzzleHeight - 4);
      g.lineTo(e.toX!, e.toY! - RULES.muzzleHeight - 4);
      g.stroke();
    }
    g.globalAlpha = 1;
    this.trails = this.trails.filter((e) => e.life > 0);
    for (const f of this.flashes) {
      f.life -= dt;
      g.save();
      g.translate(f.x, f.y - RULES.muzzleHeight - 4);
      g.rotate(f.angle);
      const size =
        f.weapon === "heavy"
          ? 32
          : f.weapon === "sg"
            ? 27
            : f.weapon === "ar"
              ? 18
              : 11;
      const light = g.createRadialGradient(20, 0, 0, 20, 0, size * 3);
      light.addColorStop(0, "#ffc67b66");
      light.addColorStop(1, "#ffc67b00");
      g.fillStyle = light;
      g.fillRect(20 - size * 3, -size * 3, size * 6, size * 6);
      g.fillStyle = "#fff1bf";
      g.beginPath();
      g.moveTo(19, -3);
      g.lineTo(23 + size, -1);
      g.lineTo(23, 4);
      g.lineTo(29, -size / 2);
      g.lineTo(20, 3);
      g.closePath();
      g.fill();
      g.restore();
    }
    this.flashes = this.flashes.filter((f) => f.life > 0);
    for (const q of this.particles) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.94;
      q.vy *= 0.94;
      g.globalAlpha = Math.max(0, q.life / q.max);
      g.fillStyle = q.color;
      g.fillRect(q.x, q.y, q.size, q.size);
    }
    g.globalAlpha = 1;
    this.particles = this.particles.filter((q) => q.life > 0);
    if (w.map.terrain) {
      g.fillStyle = "#ddc79726";
      for (let i = 0; i < 28; i++) {
        const x = this.camera.x - halfW + ((i * 137 + t * 21) % (halfW * 2)),
          y = this.camera.y - halfH + ((i * 83 + t * 5) % (halfH * 2));
        g.fillRect(x, y, 2 + (i % 3), 1);
      }
    }
    this.fog.draw(g, w, this.camera, halfW, halfH);
    // Only server-disclosed, exact-LOS actors. Their elevated raster bodies must not be cut by the cached ground-plane fog.
    const actors = [...w.players, ...w.enemies].sort((a, b) => a.y - b.y);
    for (const a of actors) {
      let pos = this.positions.get(a.id);
      if (!pos) {
        pos = { x: a.x, y: a.y };
        this.positions.set(a.id, pos);
      }
      pos.x += (a.x - pos.x) * Math.min(1, dt * 22);
      pos.y += (a.y - pos.y) * Math.min(1, dt * 22);
      if (
        Math.abs(pos.x - this.camera.x) > halfW + 100 ||
        Math.abs(pos.y - this.camera.y) > halfH + 100
      )
        continue;
      if ("character" in a)
        this.player(
          a.id === this.id && local ? { ...a, angle: local.angle } : a,
          pos,
          t,
        );
      else if (
        w.players.some(
          (ally) =>
            ally.connected &&
            !ally.down &&
            distance(ally, a) < 850 &&
            lineOfSight(ally, a, w.map),
        )
      )
        this.enemy(a, pos, t);
    }
    for (const id of this.positions.keys())
      if (!actors.some((a) => a.id === id)) this.positions.delete(id);

    for (const n of this.numbers) {
      n.life -= dt;
      n.y -= dt * 26;
      g.globalAlpha = Math.min(1, n.life * 4);
      g.fillStyle = "#fff0c4";
      g.font = "bold 13px monospace";
      g.textAlign = "center";
      g.fillText(n.text, n.x, n.y);
    }
    g.globalAlpha = 1;
    this.numbers = this.numbers.filter((n) => n.life > 0).slice(-28);
    g.restore();
    // A restrained vignette leaves targets readable at screen edges.
    if (this.vignette) g.drawImage(this.vignette, 0, 0);
    if (p.hurt > 3.75) {
      g.strokeStyle = "#ed687c99";
      g.lineWidth = 20;
      g.strokeRect(0, 0, this.width, this.height);
    }
    // Clouds share the authoritative radius and lifetime. They never create bullet collision.
    this.minimap(w);
    this.objectivePointer(w, p);
    this.cursor(p, dt);
  }
  objectivePointer(w: World, p: Player) {
    const chosen = operationGoal(w, p, this.trackedObjective),
      goal = chosen?.position;
    if (!goal) return;
    const sx = (goal.x - this.camera.x) * this.zoom + this.width / 2,
      sy = (goal.y - this.camera.y) * this.zoom + this.height / 2;
    if (sx > 100 && sx < this.width - 100 && sy > 150 && sy < this.height - 130)
      return;
    const x = Math.max(170, Math.min(this.width - 240, sx)),
      y = Math.max(190, Math.min(this.height - 190, sy));
    const g = this.ctx,
      label = chosen!.label;
    g.save();
    g.translate(x, y);
    g.fillStyle = "#14222de6";
    g.beginPath();
    g.roundRect(-75, -17, 150, 34, 6);
    g.fill();
    g.fillStyle = "#ffe1a3";
    g.font = "bold 11px sans-serif";
    g.textAlign = "center";
    g.fillText(`${label} · ${(distance(p, goal) / 100).toFixed(1)}m`, 0, 4);
    g.rotate(Math.atan2(sy - y, sx - x));
    g.beginPath();
    g.moveTo(88, 0);
    g.lineTo(79, -6);
    g.lineTo(79, 6);
    g.fill();
    g.restore();
  }
  marker(v: Vec, label: string, t: number, color: string) {
    const g = this.ctx;
    g.fillStyle = color;
    g.textAlign = "center";
    g.font = "bold 12px sans-serif";
    g.fillText(label, v.x, v.y - 78 + Math.sin(t * 3) * 3);
    g.beginPath();
    g.moveTo(v.x - 5, v.y - 67);
    g.lineTo(v.x + 5, v.y - 67);
    g.lineTo(v.x, v.y - 61);
    g.fill();
  }
  terminal(
    v: Vec,
    label: string,
    progress: number,
    done: boolean,
    t: number,
    color = "#efd28b",
  ) {
    const g = this.ctx;
    g.fillStyle = "#111f2b";
    g.fillRect(v.x - 24, v.y - 28, 48, 50);
    g.fillStyle = "#4b626e";
    g.fillRect(v.x - 24, v.y - 28, 48, 5);
    g.fillStyle = done ? "#8adfcb" : color;
    g.globalAlpha = 0.75 + Math.sin(t * 2) * 0.15;
    g.fillRect(v.x - 16, v.y - 16, 32, 19);
    g.globalAlpha = 1;
    g.fillStyle = "#1b3e45";
    g.font = "bold 10px monospace";
    g.textAlign = "center";
    g.fillText(label, v.x, v.y - 3);
    g.fillStyle = done ? "#9aedcf" : color;
    g.fillRect(v.x - 22, v.y + 27, 44 * progress, 4);
    if (!done)
      this.marker(
        v,
        label === "DATA" ? "선택 · 기밀 자료" : "중계기 " + label,
        t,
        color,
      );
  }
  player(p: Player, pos: Vec, t: number) {
    const g = this.ctx,
      c = CHARACTERS[p.character],
      bob = p.moving ? Math.sin(t * 15) * 2 : Math.sin(t * 2) * 0.5;
    g.save();
    g.translate(pos.x, pos.y);
    g.fillStyle = "#050c1680";
    g.beginPath();
    g.ellipse(0, 7, 16, 7, 0, 0, TAU);
    g.fill();
    g.strokeStyle = p.down ? "#f28b9a" : c.color + "99";
    g.lineWidth = p.id === this.id ? 2 : 1;
    g.beginPath();
    g.ellipse(0, 8, 18, 8, 0, 0, TAU);
    g.stroke();
    if (p.down) {
      g.rotate(-1.3);
      g.globalAlpha = 0.7;
    }
    const direction =
      Math.abs(Math.sin(p.angle)) > Math.abs(Math.cos(p.angle))
        ? Math.sin(p.angle) > 0
          ? 0
          : 2
        : Math.cos(p.angle) > 0
          ? 1
          : 3;
    const cardinal = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][direction];
    const delta = Math.atan2(
      Math.sin(p.angle - cardinal),
      Math.cos(p.angle - cardinal),
    );
    g.translate(
      -Math.cos(p.angle) * (p.id === this.id ? this.kick * 0.4 : p.recoil * 20),
      bob,
    );
    const poseTilt = delta * 0.16 + (p.moving ? Math.sin(t * 14) * 0.025 : 0);
    g.rotate(poseTilt);
    if (p.hurt > 3.7) g.filter = "brightness(1.8) saturate(0.7)";
    if (this.atlas.complete && this.atlas.naturalWidth) {
      const f = operatorFrame(p.character, direction),
        width = (64 * f.w) / f.h;
      this.rasterCache.draw(
        g,
        this.atlas,
        `operator/${p.character}/${direction}`,
        f,
        -width / 2,
        -53,
        width,
        64,
      );
    }
    g.filter = "none";
    if (!p.down) {
      const id = p.activeSlot === 3 ? p.consumable : p.weapon,
        sprite = equipmentSprite(id);
      if (sprite?.complete && sprite.naturalWidth) {
        const width = id === "at" ? 45 : id === "pistol" ? 20 : 16,
          height = (width * sprite.naturalHeight) / sprite.naturalWidth;
        g.save();
        g.translate(Math.cos(p.angle) * 13, -18 + Math.sin(p.angle) * 7);
        if (p.activeSlot !== 3) g.rotate(p.angle - poseTilt);
        this.rasterCache.draw(
          g,
          sprite,
          `equipment/${id}`,
          { x: 0, y: 0, w: sprite.naturalWidth, h: sprite.naturalHeight },
          -width * 0.42,
          -height / 2,
          width,
          height,
        );
        g.restore();
      }
    }
    if (p.reload > 0) {
      g.strokeStyle = "#f4d391";
      g.lineWidth = 3;
      g.beginPath();
      const total = WEAPONS[p.weapon].reload * (p.mod === "loader" ? 0.8 : 1);
      g.arc(
        0,
        5,
        23,
        -Math.PI / 2,
        -Math.PI / 2 + TAU * (1 - p.reload / total),
      );
      g.stroke();
    }
    g.restore();
    g.save();
    g.textAlign = "center";
    g.font = "bold 10px sans-serif";
    g.fillStyle = p.down ? "#ff9daa" : p.connected ? "#c5e5e1" : "#8c9da5";
    g.fillText(p.down ? "F · 구조 요청" : p.name, pos.x, pos.y + 23);
    if (p.hp < 100 || p.down) {
      g.fillStyle = "#0b1423";
      g.fillRect(pos.x - 22, pos.y + 29, 44, 4);
      g.fillStyle = p.down ? "#b9a3ee" : "#87d8c1";
      g.fillRect(
        pos.x - 22,
        pos.y + 29,
        44 * (p.down ? p.reviveProgress / 3 : p.hp / 100),
        4,
      );
    }
    g.restore();
  }
  enemy(e: Enemy, pos: Vec, t: number) {
    const g = this.ctx;
    g.save();
    g.translate(pos.x, pos.y);
    g.fillStyle = "#030911aa";
    g.beginPath();
    g.ellipse(0, 5, enemyRadius(e.kind), enemyRadius(e.kind) * 0.4, 0, 0, TAU);
    g.fill();
    const direction =
      Math.abs(Math.sin(e.angle)) > Math.abs(Math.cos(e.angle))
        ? Math.sin(e.angle) > 0
          ? 0
          : 2
        : Math.cos(e.angle) > 0
          ? 1
          : 3;
    const f = enemyFrame(e.kind, direction),
      height = enemyHeight(e.kind),
      width = (height * f.w) / f.h;
    if (e.hurt > 0) {
      g.translate(-Math.cos(e.angle) * 2, -Math.sin(e.angle) * 2);
      g.filter = "brightness(2) saturate(0.5)";
    }
    const atlas = special(e.kind) ? this.v4Atlas : this.enemyAtlas;
    this.rasterCache.draw(
      g,
      atlas,
      `enemy/${e.kind}/${direction}`,
      f,
      -width / 2,
      -height + 8,
      width,
      height,
    );
    g.filter = "none";
    // A compact red foot arc identifies hostility even when the visor faces away.
    g.strokeStyle = e.elite
      ? "#ffcf60"
      : e.kind === "heavy"
        ? "#efad65bb"
        : "#eb6570aa";
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(0, 7, 17, 7, 0, 0, Math.PI);
    g.stroke();
    if (armored(e.kind)) {
      g.strokeStyle = "#ffb85b";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(
        0,
        2,
        enemyRadius(e.kind) + 4,
        e.angle + Math.PI - 0.65,
        e.angle + Math.PI + 0.65,
      );
      g.stroke();
      g.fillStyle = e.phase === "overheat" ? "#ffb96d" : "#eab77d";
      g.font = "bold 10px sans-serif";
      g.textAlign = "center";
      g.fillText(
        e.phase === "overheat"
          ? "과열 · 우회 기회"
          : e.phase === "spinup"
            ? "발사 준비"
            : ENEMIES[e.kind].name,
        0,
        -height - 10,
      );
    }
    if (armored(e.kind)) {
      g.strokeStyle = e.components?.weapon?.destroyed ? "#8b7773" : "#f0a18a";
      g.lineWidth = e.kind === "walker" ? 7 : 4;
      g.beginPath();
      g.moveTo(0, -height * 0.45);
      const turret = e.turretAngle ?? e.angle;
      g.lineTo(
        Math.cos(turret) * enemyRadius(e.kind) * 1.2,
        -height * 0.45 + Math.sin(turret) * enemyRadius(e.kind) * 0.65,
      );
      g.stroke();
      for (const part of hitRegions(e).filter((r) => r.hp > 0)) {
        const wp = worldPoint(e, part),
          broken = e.components?.[part.id]?.destroyed;
        g.strokeStyle = broken ? "#8f8e89" : "#ffd08c";
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(wp.x - e.x, wp.y - e.y, part.radius, 0, TAU);
        g.stroke();
        if (broken) {
          g.fillStyle = "#171b20b0";
          g.beginPath();
          g.arc(wp.x - e.x, wp.y - e.y, part.radius * 0.8, 0, TAU);
          g.fill();
          g.fillStyle = "#ffb6a1";
          g.font = "10px sans-serif";
          g.fillText(
            part.id === "weapon" ? "무장 파손" : "동력 손상",
            wp.x - e.x,
            wp.y - e.y + 4,
          );
        }
      }
    }
    if (e.windup > 0) {
      g.fillStyle = "#ffd5ad";
      g.textAlign = "center";
      g.font = "bold 14px monospace";
      g.fillText(
        e.kind === "heavy" ? "▲" : "!",
        0,
        -height - 2 + Math.sin(t * 20),
      );
    }
    if (e.hp < ENEMIES[e.kind].hp) {
      g.fillStyle = "#0e141c";
      g.fillRect(-16, -height - 3, 32, 3);
      g.fillStyle = "#f39185";
      g.fillRect(-16, -height - 3, (32 * e.hp) / ENEMIES[e.kind].hp, 3);
    }
    g.restore();
  }
  minimap(w: World) {
    const g = this.ctx,
      x = this.width - 204,
      y = 108,
      s = Math.min(164 / w.map.width, 122 / w.map.height);
    g.fillStyle = "#111b29dd";
    g.fillRect(x - 10, y - 10, 184, 142);
    g.strokeStyle = "#b9d4d12b";
    g.strokeRect(x - 10, y - 10, 184, 142);
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = "#54727b";
    for (const o of w.map.obstacles) g.fillRect(o.x, o.y, o.w, o.h);
    g.fillStyle = "#f0cb89";
    this.fog.minimap(g, w);
    const goals =
      w.mission.stage === "extract" && w.mission.extraction.site
        ? [w.mission.extraction.site]
        : w.mission.objectives
            .filter((o) => !o.optional && o.state !== "complete")
            .map((o) => o.position);
    for (const o of goals) g.fillRect(o.x - 30, o.y - 30, 60, 60);
    for (const p of w.players) {
      g.fillStyle = p.down ? "#f2889f" : CHARACTERS[p.character].color;
      g.beginPath();
      g.arc(p.x, p.y, 35, 0, TAU);
      g.fill();
    }
    g.restore();
  }
  cursor(p: Player, dt: number) {
    const g = this.ctx,
      r = 7 + p.recoil * 120 + (p.moving ? 4 : 0),
      { x, y } = this.mouse;
    g.strokeStyle = p.reload > 0 ? "#eacb8d" : "#c3f5e6";
    g.lineWidth = 1.5;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      g.beginPath();
      g.moveTo(x + dx * r, y + dy * r);
      g.lineTo(x + dx * (r + 7), y + dy * (r + 7));
      g.stroke();
    }
    g.fillStyle = "#eafff5";
    g.fillRect(x - 1, y - 1, 2, 2);
    this.kill = Math.max(0, this.kill - dt);
    if (this.hit > 0) {
      this.hit -= dt;
      g.strokeStyle = this.kill > 0 ? "#fb90ae" : "#ffdfb1";
      g.lineWidth = this.kill > 0 ? 3 : 2;
      g.beginPath();
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ]) {
        g.moveTo(x + dx * 6, y + dy * 6);
        g.lineTo(x + dx * 11, y + dy * 11);
      }
      g.stroke();
    }
  }
}
