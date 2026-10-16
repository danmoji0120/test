import type { World, Vec } from "../shared/data";
import { drawEnvironment } from "../art/environment";
/** Existing industrial PNG atlas plus animated hardware, not fabricated gameplay screenshots. */
export function drawMissionHardware(
  g: CanvasRenderingContext2D,
  w: World,
  atlas: HTMLImageElement,
  t: number,
  camera: Vec,
  halfW: number,
  halfH: number,
) {
  for (const d of w.map.installations) {
    if (
      !d.role ||
      d.kind === "generator" ||
      Math.abs(d.x - camera.x) > halfW + 200 ||
      Math.abs(d.y - camera.y) > halfH + 200
    )
      continue;
    const o = w.mission.objectives.find((o) => o.facilityId === d.id),
      active = o?.state === "active",
      dead = d.hp <= 0;
    g.save();
    g.translate(d.x, d.y);
    g.globalAlpha = dead ? 0.35 : 1;
    const color =
      o?.state === "locked"
        ? "#8a929d"
        : o?.state === "complete"
          ? "#7ad9be"
          : "#e7c38e";
    g.fillStyle = "#101f2799";
    g.beginPath();
    g.ellipse(0, 15, 58, 29, 0, 0, Math.PI * 2);
    g.fill();
    drawEnvironment(
      g,
      atlas,
      d.role === "transmitter" || d.role === "radar"
        ? 6
        : d.role === "production" || d.role === "cooling"
          ? 7
          : 5,
      -50,
      -85,
      100,
      110,
    );
    if (d.role === "silo") {
      g.fillStyle = "#253b43";
      g.beginPath();
      g.ellipse(0, -10, 52, 30, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.stroke();
      if (!w.mission.launch) {
        g.fillStyle = "#d3d4bc";
        g.beginPath();
        g.moveTo(0, -105);
        g.lineTo(15, -75);
        g.lineTo(15, -16);
        g.lineTo(-15, -16);
        g.lineTo(-15, -75);
        g.closePath();
        g.fill();
        g.fillStyle = "#d48187";
        g.fillRect(-15, -52, 30, 9);
      }
    } else if (d.role === "drill") {
      g.strokeStyle = "#b8b9a3";
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(-28, 8);
      g.lineTo(-16, -90);
      g.lineTo(20, -90);
      g.lineTo(32, 8);
      g.stroke();
      g.save();
      g.translate(3, -32);
      g.rotate(active ? t * 7 : 0);
      g.strokeStyle = "#d2aa68";
      g.lineWidth = 5;
      for (let i = 0; i < 6; i++) {
        g.rotate(Math.PI / 3);
        g.beginPath();
        g.moveTo(4, 0);
        g.lineTo(22, 0);
        g.stroke();
      }
      g.restore();
      if (active) {
        g.fillStyle = "#d3b38150";
        for (let i = 0; i < 6; i++)
          g.fillRect(
            Math.sin(t * 3 + i) * 45,
            15 + Math.cos(t * 5 + i) * 12,
            5,
            3,
          );
      }
    } else if (d.role === "beacon") {
      g.strokeStyle = "#80d7da";
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, -10, 65, 40, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#9fe5e8";
      g.fillRect(-9, -87, 18, 59);
    } else if (d.role === "radar" || d.role === "analyzer") {
      g.save();
      g.translate(0, -65);
      g.rotate(t * (active ? 2 : 0.6));
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, 25, -1.1, 1.1);
      g.moveTo(0, 0);
      g.lineTo(30, 0);
      g.stroke();
      g.restore();
    }
    g.fillStyle = "#111c24";
    g.fillRect(-42, 27, 84, 7);
    g.fillStyle = color;
    g.fillRect(-42, 27, 84 * Math.max(0, d.hp / d.maxHp), 7);
    g.fillStyle = color;
    g.font = "bold 11px sans-serif";
    g.textAlign = "center";
    g.fillText(o?.label ?? d.role, 0, -112);
    g.font = "10px sans-serif";
    g.fillText(
      dead
        ? "파괴됨"
        : o?.state === "locked"
          ? "잠김 · 선행 조건 필요"
          : (o?.phase ??
            (o?.state === "complete"
              ? "완료"
              : o?.action === "destroy"
                ? "파괴 목표"
                : "E · 장비 조작")),
      0,
      52,
    );
    g.restore();
    if (o?.operatingPoint && o.action !== "destroy" && o.state !== "complete") {
      const p = o.operatingPoint;
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.strokeRect(p.x - 18, p.y - 18, 36, 36);
      g.fillStyle = color;
      g.font = "bold 13px sans-serif";
      g.textAlign = "center";
      g.fillText("E", p.x, p.y + 5);
    }
  }
  const launch = w.mission.launch;
  if (launch) {
    const elapsed = w.time - launch.at;
    if (elapsed < 6) {
      g.save();
      g.translate(launch.position.x, launch.position.y - elapsed * 220);
      g.fillStyle = "#e2e3ca";
      g.beginPath();
      g.moveTo(0, -100);
      g.lineTo(16, -65);
      g.lineTo(16, 0);
      g.lineTo(-16, 0);
      g.lineTo(-16, -65);
      g.closePath();
      g.fill();
      g.fillStyle = "#ffb969";
      g.beginPath();
      g.moveTo(-13, 2);
      g.lineTo(0, 75 + Math.sin(t * 41) * 15);
      g.lineTo(13, 2);
      g.fill();
      g.restore();
    }
  }
  const c = w.mission.cargo;
  if (c && !c.delivered) {
    g.save();
    g.translate(c.x + 18, c.y - 12);
    g.fillStyle = "#c5a56d";
    g.strokeStyle = "#f1dcaa";
    g.lineWidth = 2;
    g.fillRect(-11, -8, 22, 16);
    g.strokeRect(-11, -8, 22, 16);
    g.fillStyle = "#93ead6";
    g.fillRect(-3, -4, 6, 8);
    g.restore();
  }
}
