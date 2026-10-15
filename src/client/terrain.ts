import type { World, Rect } from "../shared/data";
import { rng } from "../game/map";
import { elevation, terrainNoise } from "../game/terrain";
import { drawEnvironment } from "../art/environment";
function polygon(g: CanvasRenderingContext2D, o: Rect, dx = 0, dy = 0) {
  g.beginPath();
  if (o.polygon) {
    o.polygon.forEach((p, i) =>
      i ? g.lineTo(p.x + dx, p.y + dy) : g.moveTo(p.x + dx, p.y + dy),
    );
    g.closePath();
  } else g.rect(o.x + dx, o.y + dy, o.w, o.h);
}
export function paintTerrain(
  g: CanvasRenderingContext2D,
  w: World,
  atlas: HTMLImageElement,
) {
  const m = w.map,
    random = rng(m.seed + 1009);
  // Continuous field rather than steel tiles: broad strata, fine sand and scattered gravel.
  for (let y = 0; y < m.height; y += 24)
    for (let x = 0; x < m.width; x += 24) {
      const h = elevation(x, y, m.seed),
        shade = terrainNoise(x / 1400, y / 1400, m.seed + 143),
        r = 82 + h * 57 + shade * 14,
        green = 65 + h * 42,
        blue = 49 + h * 29;
      g.fillStyle = `rgb(${r | 0},${green | 0},${blue | 0})`;
      g.fillRect(x, y, 25, 25);
    }
  for (let i = 0; i < 22000; i++) {
    const x = random() * m.width,
      y = random() * m.height;
    g.fillStyle = i % 3 ? "#c5af7922" : "#211f1d35";
    g.fillRect(x, y, 1 + random() * 4, 1 + random() * 2);
  }
  for (const road of m.roads) {
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    road.points.forEach((p, i) =>
      i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y),
    );
    g.strokeStyle = "#443c2c55";
    g.lineWidth = road.width + 22;
    g.stroke();
    g.strokeStyle = "#9c835655";
    g.lineWidth = road.width;
    g.stroke();
    g.strokeStyle = "#51493470";
    g.lineWidth = 3;
    g.setLineDash([7, 11]);
    g.stroke();
    g.setLineDash([]);
  }
  for (const z of m.zones) {
    g.fillStyle = z.kind === "reactor" ? "#252e2b66" : "#36342d55";
    g.beginPath();
    g.roundRect(z.x - 40, z.y - 40, z.w + 80, z.h + 80, 70);
    g.fill();
    g.fillStyle = "#a8b6a83a";
    g.font = "bold 17px sans-serif";
    g.fillText(z.label, z.x + 45, z.y + 65);
    g.strokeStyle = "#bba17035";
    g.setLineDash([14, 14]);
    g.lineWidth = 2;
    g.strokeRect(z.x + 55, z.y + 80, z.w - 110, z.h - 135);
    g.setLineDash([]);
  }
  for (const d of m.terrain?.decor ?? []) {
    g.save();
    g.translate(d.x, d.y);
    g.rotate(d.angle);
    g.globalAlpha = d.frame === 11 ? 0.32 : 0.7;
    drawEnvironment(
      g,
      atlas,
      d.frame,
      -d.size / 2,
      -d.size / 2,
      d.size,
      d.size * 0.8,
    );
    g.restore();
  }
  for (const o of m.obstacles) {
    if (o.kind === "door") continue;
    if (o.kind === "rock") {
      polygon(g, o, 13, 24);
      g.fillStyle = "#1c1a1870";
      g.fill();
      polygon(g, o);
      g.fillStyle = "#786044";
      g.fill();
      g.strokeStyle = "#b19a6f";
      g.lineWidth = 3;
      g.stroke();
      if (atlas.complete && atlas.naturalWidth) {
        g.save();
        polygon(g, o);
        g.clip();
        drawEnvironment(
          g,
          atlas,
          o.variant ?? 0,
          o.x - 8,
          o.y - 24,
          o.w + 16,
          o.h + 36,
        );
        g.restore();
      }
      continue;
    }
    g.fillStyle = "#12181780";
    g.fillRect(o.x + 9, o.y + 13, o.w, o.h);
    g.fillStyle =
      o.kind === "crate"
        ? "#665f43"
        : o.kind === "container"
          ? "#434d43"
          : o.kind === "fence"
            ? "#59605a65"
            : "#55564b";
    g.fillRect(o.x, o.y, o.w, o.h);
    g.fillStyle = "#a7a28a70";
    g.fillRect(o.x, o.y, o.w, 5);
    if (o.kind === "container") {
      g.strokeStyle = "#1e2b2770";
      g.lineWidth = 3;
      for (let x = o.x + 10; x < o.x + o.w; x += 14) {
        g.beginPath();
        g.moveTo(x, o.y + 7);
        g.lineTo(x, o.y + o.h - 7);
        g.stroke();
      }
    }
    if (o.kind === "wall") {
      g.strokeStyle = "#272c27";
      g.lineWidth = 2;
      for (let x = o.x + 35; x < o.x + o.w; x += 65) {
        g.beginPath();
        g.moveTo(x, o.y);
        g.lineTo(x - 8, o.y + o.h);
        g.stroke();
      }
    }
  }
}
