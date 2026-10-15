import type { World, Vec } from "../shared/data";
/** Compose once per visibility revision; each frame only blends one cached texture. */
export class Fog {
  private overlay = document.createElement("canvas");
  private minimapMask = document.createElement("canvas");
  private revision = -1;
  private run = "";
  update(w: World) {
    const v = w.visibility;
    if (!v || (this.run === w.id && this.revision === v.revision)) return;
    this.run = w.id;
    this.revision = v.revision;
    this.overlay.width = Math.ceil(w.map.width / 5);
    this.overlay.height = Math.ceil(w.map.height / 5);
    this.minimapMask.width = v.cols;
    this.minimapMask.height = v.rows;
    const g = this.overlay.getContext("2d")!,
      m = this.minimapMask.getContext("2d")!;
    g.fillStyle = "#03060bf9";
    g.fillRect(0, 0, this.overlay.width, this.overlay.height);
    g.globalCompositeOperation = "destination-out";
    g.globalAlpha = 0.62;
    g.fillStyle = "#fff";
    m.fillStyle = "#02050b";
    for (let y = 0; y < v.rows; y++)
      for (let x = 0; x < v.cols; x++) {
        if (v.explored[y * v.cols + x])
          g.fillRect(
            (x * v.cell) / 5,
            (y * v.cell) / 5,
            v.cell / 5,
            v.cell / 5,
          );
        else m.fillRect(x, y, 1, 1);
      }
    g.globalAlpha = 1;
    for (const poly of v.polygons) {
      g.beginPath();
      poly.forEach((p, i) =>
        i ? g.lineTo(p.x / 5, p.y / 5) : g.moveTo(p.x / 5, p.y / 5),
      );
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }
  draw(
    g: CanvasRenderingContext2D,
    w: World,
    camera: Vec,
    halfW: number,
    halfH: number,
  ) {
    this.update(w);
    const x = Math.max(0, camera.x - halfW - 12),
      y = Math.max(0, camera.y - halfH - 12),
      width = Math.min(w.map.width - x, halfW * 2 + 24),
      height = Math.min(w.map.height - y, halfH * 2 + 24);
    g.drawImage(
      this.overlay,
      x / 5,
      y / 5,
      width / 5,
      height / 5,
      x,
      y,
      width,
      height,
    );
  }
  minimap(g: CanvasRenderingContext2D, w: World) {
    this.update(w);
    g.save();
    g.imageSmoothingEnabled = false;
    g.drawImage(this.minimapMask, 0, 0, w.map.width, w.map.height);
    g.restore();
  }
}
