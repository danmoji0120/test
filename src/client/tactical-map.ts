import type { World } from "../shared/data";
import type { Fog } from "./fog";
export class TacticalMap {
  zoom = 1;
  pan = { x: 0, y: 0 };
  private run = "";
  private dragging = false;
  private moved = false;
  private last = { x: 0, y: 0 };
  private transform = { scale: 1, x: 0, y: 0 };
  attach(
    canvas: HTMLCanvasElement,
    getWorld: () => World | undefined,
    track: (id: string) => void,
  ) {
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(
          1,
          Math.min(5, this.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)),
        );
      },
      { passive: false },
    );
    canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.moved = false;
      this.last = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.last.x,
        dy = e.clientY - this.last.y;
      this.pan.x += dx;
      this.pan.y += dy;
      this.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
      this.last = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
      this.dragging = false;
      if (this.moved) return;
      const w = getWorld();
      if (!w) return;
      const r = canvas.getBoundingClientRect(),
        x =
          (((e.clientX - r.left) * canvas.width) / r.width - this.transform.x) /
          this.transform.scale,
        y =
          (((e.clientY - r.top) * canvas.height) / r.height -
            this.transform.y) /
          this.transform.scale;
      const o = w.mission.objectives
        .filter(
          (o) => o.discovered || o.known === "region" || o.known === "exact",
        )
        .sort(
          (a, b) =>
            Math.hypot(a.position.x - x, a.position.y - y) -
            Math.hypot(b.position.x - x, b.position.y - y),
        )[0];
      if (o && Math.hypot(o.position.x - x, o.position.y - y) < 400 / this.zoom)
        track(o.id);
    });
  }
  draw(canvas: HTMLCanvasElement, w: World, fog: Fog, tracked: string) {
    if (this.run !== w.id) {
      this.run = w.id;
      this.zoom = 1;
      this.pan = { x: 0, y: 0 };
    }
    const g = canvas.getContext("2d")!,
      width = canvas.width,
      height = canvas.height;
    const scale =
        Math.min((width - 30) / w.map.width, (height - 30) / w.map.height) *
        this.zoom,
      x = (width - w.map.width * scale) / 2 + this.pan.x,
      y = (height - w.map.height * scale) / 2 + this.pan.y;
    this.transform = { scale, x, y };
    g.fillStyle = "#070e14";
    g.fillRect(0, 0, width, height);
    g.save();
    g.translate(x, y);
    g.scale(scale, scale);
    g.fillStyle = "#4e4434";
    g.fillRect(0, 0, w.map.width, w.map.height);
    for (const road of w.map.roads) {
      g.strokeStyle = "#b39a7060";
      g.lineWidth = road.width;
      g.beginPath();
      road.points.forEach((p, i) =>
        i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y),
      );
      g.stroke();
    }
    for (const o of w.map.obstacles) {
      g.fillStyle = o.kind === "rock" ? "#211e19" : "#303b3a";
      g.fillRect(o.x, o.y, o.w, o.h);
    }
    fog.minimap(g, w);
    const marker = (p: { x: number; y: number }, color: string, size = 5) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(p.x, p.y, size / scale, 0, Math.PI * 2);
      g.fill();
    };
    for (const o of w.mission.objectives) {
      if (!o.discovered && o.known !== "region" && o.known !== "exact")
        continue;
      const color =
        o.state === "complete"
          ? "#75d9b8"
          : o.state === "locked"
            ? "#8b90a0"
            : o.optional
              ? "#b4a4ef"
              : "#f1c684";
      if (!o.discovered && o.known === "region") {
        g.strokeStyle = color;
        g.lineWidth = 1.5 / scale;
        g.setLineDash([6 / scale, 5 / scale]);
        g.beginPath();
        g.arc(o.position.x, o.position.y, 550, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      marker(o.position, color, o.id === tracked ? 8 : 5);
      g.fillStyle = color;
      g.font = `${11 / scale}px sans-serif`;
      g.fillText(o.label, o.position.x + 10 / scale, o.position.y - 9 / scale);
    }
    for (const p of w.map.extractions) {
      g.strokeStyle = "#7bd7b9";
      g.lineWidth = 2 / scale;
      g.strokeRect(p.x - 7 / scale, p.y - 7 / scale, 14 / scale, 14 / scale);
    }
    for (const s of w.map.supplies) if (!s.used) marker(s, "#89d6c0", 3);
    for (const p of w.players) marker(p, p.down ? "#ff7d83" : "#92f0df", 5);
    const c = w.mission.cargo;
    if (c && !c.delivered) marker(c, "#f1cc7b", 6);
    g.restore();
    g.fillStyle = "#d7e5e1";
    g.font = "12px sans-serif";
    g.fillText(
      `${w.map.width} × ${w.map.height} · ${this.zoom.toFixed(1)}× · 휠 확대 / 드래그 이동 / 목표 클릭`,
      15,
      height - 15,
    );
  }
}
