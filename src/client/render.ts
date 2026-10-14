import {
  CHARACTERS,
  WEAPONS,
  ENEMIES,
  type World,
  type Player,
  type Enemy,
  type Vec,
  type GameEvent,
} from "../shared/data";
import { headImage } from "../art/characters";
import { distance } from "../game/map";
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
  ctx: CanvasRenderingContext2D;
  width = innerWidth;
  height = innerHeight;
  camera = { x: 0, y: 0 };
  mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  world: World | null = null;
  id = "";
  floor: HTMLCanvasElement | null = null;
  mapSeed = -1;
  heads = { aria: headImage("aria"), luna: headImage("luna") };
  hurtHeads = {
    aria: headImage("aria", "hurt"),
    luna: headImage("luna", "hurt"),
  };
  positions = new Map<string, Vec>();
  particles: Particle[] = [];
  trails: (GameEvent & { life: number })[] = [];
  lastEvent = 0;
  shake = 0;
  hit = 0;
  frames: number[] = [];
  last = performance.now();
  running = false;
  raf = 0;
  zoom = 1.12;
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
    this.zoom = this.width < 1400 ? 1 : 1.12;
  }
  set(w: World, id: string) {
    if (this.world?.id !== w.id) {
      this.floor = null;
      this.mapSeed = -1;
      this.lastEvent = w.eventId;
      this.positions.clear();
      this.particles = [];
      this.trails = [];
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
    for (const e of w.events) {
      if (e.id <= this.lastEvent) continue;
      this.lastEvent = e.id;
      if (me && distance(e, me) < 1100) {
        this.audio.play(e, distance(e, me));
        if (e.type === "shot") {
          this.trails.push({ ...e, life: 0.11 });
          this.burst(
            e.x + Math.cos(Math.atan2(e.toY! - e.y, e.toX! - e.x)) * 23,
            e.y + Math.sin(Math.atan2(e.toY! - e.y, e.toX! - e.x)) * 23,
            2,
            "#f8d393",
            25,
          );
          if (e.actor === id)
            this.shake = Math.max(this.shake, e.weapon === "sg" ? 3.8 : 1.4);
        } else if (e.type === "hit") {
          this.burst(e.x, e.y, 6, "#fbd594", 90);
          if (e.actor === id && !e.enemy) this.hit = 0.15;
        } else if (e.type === "kill") {
          this.burst(e.x, e.y, 13, "#fd9a95", 140);
        } else if (e.type === "explode") {
          this.burst(e.x, e.y, 65, "#ffb875", 250);
          this.shake = 7;
        }
      }
    }
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
    const g = c.getContext("2d")!;
    g.fillStyle = "#1b2931";
    g.fillRect(0, 0, c.width, c.height);
    for (let x = 0; x < c.width; x += 100)
      for (let y = 0; y < c.height; y += 100) {
        g.fillStyle = (x + y) % 300 ? "#1d2c34" : "#203039";
        g.fillRect(x + 2, y + 2, 96, 96);
        g.fillStyle = "#35434a";
        g.fillRect(x + 7, y + 7, 2, 2);
        g.fillRect(x + 92, y + 92, 2, 2);
      }
    // Road paint, loading lanes, industrial floor labels.
    g.strokeStyle = "#91abb214";
    g.lineWidth = 3;
    for (const y of [175, 820, 1620]) {
      g.beginPath();
      g.moveTo(80, y);
      g.lineTo(2320, y);
      g.stroke();
    }
    g.setLineDash([20, 18]);
    g.strokeStyle = "#a7a07638";
    g.lineWidth = 3;
    g.strokeRect(1590, 690, 355, 390);
    g.setLineDash([]);
    g.font = "bold 46px monospace";
    g.fillStyle = "#9cb7bf16";
    g.fillText("SECTOR 07", 650, 1550);
    g.fillText("REACTOR", 1620, 670);
    g.fillText("NO ENTRY", 2100, 520);
    g.font = "14px monospace";
    g.fillStyle = "#8a9b9d55";
    g.fillText("NORTHSTAR // ENERGY COMPLEX", 650, 150);
    g.fillText("AUTHORIZED PERSONNEL ONLY", 1100, 1700);
    for (const o of w.map.obstacles) {
      g.fillStyle = "#080f1690";
      g.fillRect(o.x + 10, o.y + 15, o.w, o.h);
      g.fillStyle =
        o.kind === "wall"
          ? "#111e28"
          : o.kind === "container"
            ? "#344c56"
            : "#45555a";
      g.fillRect(o.x, o.y, o.w, o.h);
      g.fillStyle = o.kind === "wall" ? "#344751" : "#5a7178";
      g.fillRect(o.x, o.y, o.w, 6);
      g.strokeStyle = "#71858b4a";
      g.lineWidth = 1;
      g.strokeRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
      if (o.kind === "container") {
        g.strokeStyle = "#152c3680";
        g.lineWidth = 4;
        for (let x = o.x + 12; x < o.x + o.w - 7; x += 13) {
          g.beginPath();
          g.moveTo(x, o.y + 10);
          g.lineTo(x, o.y + o.h - 10);
          g.stroke();
        }
        g.fillStyle = "#d6bf8170";
        g.fillRect(o.x + o.w - 28, o.y + 12, 15, 20);
      } else if (o.kind === "crate") {
        g.strokeStyle = "#1f343c";
        g.lineWidth = 5;
        g.strokeRect(o.x + 13, o.y + 13, o.w - 26, o.h - 26);
        g.beginPath();
        g.moveTo(o.x + 13, o.y + 13);
        g.lineTo(o.x + o.w - 13, o.y + o.h - 13);
        g.stroke();
        g.fillStyle = "#c4ae76";
        g.fillRect(o.x + o.w / 2 - 10, o.y + o.h / 2 - 8, 20, 16);
      } else {
        for (let y = o.y + 30; y < o.y + o.h; y += 90) {
          g.fillStyle = "#5b6c762f";
          g.fillRect(o.x + 5, y, o.w - 10, 2);
        }
        if (o.h > 150) {
          g.fillStyle = "#84c9c480";
          g.fillRect(o.x + o.w / 2 - 3, o.y + 18, 6, 24);
        }
      }
    }
    this.floor = c;
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
    const target = {
      x: p.x + (this.mouse.x - this.width / 2) * 0.13,
      y: p.y + (this.mouse.y - this.height / 2) * 0.13,
    };
    const halfW = this.width / 2 / this.zoom,
      halfH = this.height / 2 / this.zoom;
    target.x = Math.max(halfW, Math.min(w.map.width - halfW, target.x));
    target.y = Math.max(halfH, Math.min(w.map.height - halfH, target.y));
    const blend = 1 - Math.exp(-dt * 12);
    this.camera.x += (target.x - this.camera.x) * blend;
    this.camera.y += (target.y - this.camera.y) * blend;
    g.clearRect(0, 0, this.width, this.height);
    g.save();
    g.translate(
      this.width / 2 + (Math.random() - 0.5) * this.shake,
      this.height / 2 + (Math.random() - 0.5) * this.shake,
    );
    g.scale(this.zoom, this.zoom);
    g.translate(-this.camera.x, -this.camera.y);
    this.shake = Math.max(0, this.shake - dt * 14);
    if (this.floor) g.drawImage(this.floor, 0, 0);
    for (const [i, r] of w.map.relays.entries()) {
      this.terminal(
        r,
        "0" + (i + 1),
        w.mission.relays[i] / 6,
        w.mission.relays[i] >= 6,
        t,
      );
    }
    const core = w.map.core;
    g.save();
    g.translate(core.x, core.y);
    g.fillStyle = "#080f17aa";
    g.beginPath();
    g.ellipse(0, 16, 68, 50, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#354f5d";
    g.fillRect(-52, -55, 104, 95);
    g.fillStyle = "#516d7b";
    g.fillRect(-52, -55, 104, 10);
    g.fillStyle = "#172b36";
    g.fillRect(-38, -40, 76, 59);
    for (let i = -26; i <= 26; i += 26) {
      g.fillStyle = w.mission.stage === "extract" ? "#443e4b" : "#7ce2cc";
      g.shadowBlur = 12;
      g.shadowColor = g.fillStyle;
      g.fillRect(i - 5, -29, 10, 36);
      g.shadowBlur = 0;
    }
    g.fillStyle = "#eecc84";
    g.font = "bold 11px monospace";
    g.textAlign = "center";
    g.fillText("POWER CORE", 0, 33);
    g.restore();
    if (w.mission.stage === "plant" || w.mission.stage === "defend")
      this.marker(
        core,
        w.mission.stage === "plant" ? "폭약 설치" : "방어 중",
        t,
        "#f9cc7e",
      );
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
    if (w.mission.stage === "extract") {
      const e = w.map.extract;
      g.strokeStyle = "#80ead3";
      g.fillStyle = "#75dec51a";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(e.x, e.y, 120, 0, TAU);
      g.fill();
      g.stroke();
      g.strokeRect(e.x - 42, e.y - 42, 84, 84);
      g.fillStyle = "#a5f1dd";
      g.font = "bold 36px monospace";
      g.textAlign = "center";
      g.fillText("H", e.x, e.y + 12);
      this.marker(e, "전원 집결", t, "#89edcc");
    }
    for (const e of w.enemies) {
      if (e.windup > 0) {
        g.strokeStyle = "#ff685d80";
        g.setLineDash([8, 5]);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(
          e.x + Math.cos(e.angle) * ENEMIES[e.kind].range,
          e.y + Math.sin(e.angle) * ENEMIES[e.kind].range,
        );
        g.stroke();
        g.setLineDash([]);
      }
    }
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
      if ("character" in a) this.player(a, pos, t);
      else this.enemy(a, pos, t);
    }
    for (const id of this.positions.keys())
      if (!actors.some((a) => a.id === id)) this.positions.delete(id);
    for (const e of this.trails) {
      e.life -= dt;
      g.globalAlpha = Math.max(0, e.life / 0.11);
      g.strokeStyle = e.enemy
        ? "#ff8178"
        : e.weapon
          ? WEAPONS[e.weapon].color
          : "#ffe9ac";
      g.lineWidth = e.enemy ? 2 : 2.5;
      g.beginPath();
      g.moveTo(e.x, e.y - 4);
      g.lineTo(e.toX!, e.toY! - 4);
      g.stroke();
      g.fillStyle = "#ffe8b0";
      g.beginPath();
      g.arc(
        e.x + Math.cos(Math.atan2(e.toY! - e.y, e.toX! - e.x)) * 34,
        e.y + Math.sin(Math.atan2(e.toY! - e.y, e.toX! - e.x)) * 34 - 4,
        7,
        0,
        TAU,
      );
      g.fill();
    }
    g.globalAlpha = 1;
    this.trails = this.trails.filter((e) => e.life > 0);
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
    g.restore();
    // A restrained vignette leaves targets readable at screen edges.
    const shade = g.createRadialGradient(
      this.width / 2,
      this.height / 2,
      this.height * 0.2,
      this.width / 2,
      this.height / 2,
      this.width * 0.65,
    );
    shade.addColorStop(0, "#09101900");
    shade.addColorStop(1, "#090f1977");
    g.fillStyle = shade;
    g.fillRect(0, 0, this.width, this.height);
    if (p.hurt > 3.75) {
      g.strokeStyle = "#ed687c55";
      g.lineWidth = 20;
      g.strokeRect(0, 0, this.width, this.height);
    }
    this.minimap(w);
    this.cursor(p, dt);
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
    g.ellipse(0, 12, 24, 10, 0, 0, TAU);
    g.fill();
    g.strokeStyle = p.down ? "#f28b9a" : c.color + "99";
    g.lineWidth = p.id === this.id ? 2 : 1;
    g.beginPath();
    g.ellipse(0, 13, 27, 12, 0, 0, TAU);
    g.stroke();
    if (p.down) {
      g.rotate(-1.3);
      g.globalAlpha = 0.7;
    }
    const step = p.moving ? Math.sin(t * 15) * 4 : 0;
    g.fillStyle = "#202538";
    g.fillRect(-12, 1 + step, 9, 15);
    g.fillRect(3, 1 - step, 9, 15);
    g.fillStyle = "#667182";
    g.fillRect(-13, 12 + step, 11, 5);
    g.fillRect(2, 12 - step, 11, 5);
    g.translate(0, bob);
    const gun = () => {
      g.save();
      g.rotate(p.angle);
      g.translate(-p.recoil * 35, p.reload > 0 ? Math.sin(t * 9) * 3 : 0);
      g.fillStyle = p.character === "aria" ? "#44465a" : "#dbddea";
      g.fillRect(1, -10, 19, 8);
      g.fillStyle = "#ffe4d3";
      g.beginPath();
      g.arc(18, -5, 5, 0, TAU);
      g.fill();
      g.fillStyle = "#0b1421";
      g.fillRect(12, -7, p.weapon === "smg" ? 25 : 36, 9);
      g.fillStyle = "#637884";
      g.fillRect(14, -7, 22, 3);
      g.fillStyle = c.color;
      g.fillRect(23, -11, 8, 4);
      g.fillStyle = "#242e40";
      g.fillRect(24, 2, 7, 9);
      g.restore();
    };
    if (Math.sin(p.angle) < 0) gun();
    g.fillStyle = p.character === "aria" ? "#333344" : "#dadce9";
    g.beginPath();
    g.roundRect(-15, -19, 30, 28, 7);
    g.fill();
    g.fillStyle = "#394657";
    g.fillRect(-11, -12, 8, 15);
    g.fillRect(4, -12, 8, 15);
    g.fillStyle = c.color;
    g.fillRect(-2, -17, 4, 12);
    g.fillStyle = "#161f30";
    g.fillRect(-16, 4, 32, 5);
    g.fillStyle = "#bbd4d1";
    g.fillRect(-3, 4, 6, 5);
    const img =
      p.hurt > 3.5 || p.down
        ? this.hurtHeads[p.character]
        : this.heads[p.character];
    if (img.complete) {
      g.save();
      g.translate(Math.cos(p.angle) * 2, -Math.abs(Math.sin(p.angle)));
      g.rotate(Math.cos(p.angle) * 0.035);
      g.drawImage(img, -33, -67, 66, 66);
      g.restore();
    }
    if (Math.sin(p.angle) >= 0) gun();
    g.restore();
    g.save();
    g.textAlign = "center";
    g.font = "bold 10px sans-serif";
    g.fillStyle = p.down ? "#ff9daa" : p.connected ? "#c5e5e1" : "#8c9da5";
    g.fillText(p.down ? "F · 구조 요청" : p.name, pos.x, pos.y + 31);
    if (p.hp < 100 || p.down) {
      g.fillStyle = "#0b1423";
      g.fillRect(pos.x - 22, pos.y + 37, 44, 4);
      g.fillStyle = p.down ? "#b9a3ee" : "#87d8c1";
      g.fillRect(
        pos.x - 22,
        pos.y + 37,
        44 * (p.down ? p.reviveProgress / 3 : p.hp / 100),
        4,
      );
    }
    g.restore();
  }
  enemy(e: Enemy, pos: Vec, t: number) {
    const g = this.ctx,
      heavy = e.kind === "heavy",
      rush = e.kind === "rush";
    g.save();
    g.translate(pos.x, pos.y);
    g.fillStyle = "#050c1670";
    g.beginPath();
    g.ellipse(0, 12, heavy ? 25 : 20, 10, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#19252e";
    g.fillRect(-13, 0, 10, 15);
    g.fillRect(4, 0, 10, 15);
    g.fillStyle =
      e.hurt > 0 ? "#e4b2ac" : heavy ? "#6a6058" : rush ? "#663f48" : "#4a555e";
    g.beginPath();
    g.roundRect(heavy ? -23 : -17, -26, heavy ? 46 : 34, 36, 5);
    g.fill();
    g.fillStyle = "#263541";
    g.fillRect(-13, -20, 26, 22);
    g.strokeStyle = heavy ? "#dba474" : rush ? "#e3818f" : "#a8a39a";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-10, -13);
    g.lineTo(0, -5);
    g.lineTo(10, -13);
    g.stroke();
    g.fillStyle = "#1a2530";
    g.beginPath();
    g.roundRect(-17, -45, 34, 27, 7);
    g.fill();
    g.fillStyle = "#5d6269";
    g.fillRect(-16, -44, 32, 7);
    g.shadowColor = "#fc7a7b";
    g.shadowBlur = e.windup > 0 ? 12 : 4;
    g.fillStyle = "#fb8c8e";
    g.fillRect(-11, -34, 22, 5);
    g.shadowBlur = 0;
    g.save();
    g.rotate(e.angle);
    g.fillStyle = "#111c25";
    g.fillRect(6, -5, heavy ? 43 : 31, 10);
    g.fillStyle = "#8b7772";
    g.fillRect(10, -5, 20, 3);
    g.restore();
    if (e.windup > 0) {
      g.fillStyle = "#ffb49b";
      g.font = "bold 21px monospace";
      g.textAlign = "center";
      g.fillText("!", 0, -56 + Math.sin(t * 20));
    }
    if (e.hp < ENEMIES[e.kind].hp) {
      g.fillStyle = "#18232d";
      g.fillRect(-20, -53, 40, 3);
      g.fillStyle = "#e8978d";
      g.fillRect(-20, -53, (40 * e.hp) / ENEMIES[e.kind].hp, 3);
    }
    g.restore();
  }
  minimap(w: World) {
    const g = this.ctx,
      x = this.width - 204,
      y = 108,
      s = 0.068;
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
    const goals =
      w.mission.stage === "infiltrate"
        ? w.map.relays
        : w.mission.stage === "extract"
          ? [w.map.extract]
          : [w.map.core];
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
    if (this.hit > 0) {
      this.hit -= dt;
      g.strokeStyle = "#ffdfb1";
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
