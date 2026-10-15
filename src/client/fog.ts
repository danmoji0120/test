import type { World, Vec } from "../shared/data";
/** Cached 5Hz masks. Render current sight as exact polygons rather than coarse leaking tiles. */
export class Fog {
  private explored = document.createElement("canvas");
  private visible = document.createElement("canvas");
  private revision = -1;
  private run = "";
  update(w: World) {
    const v = w.visibility;
    if (!v || (this.run === w.id && this.revision === v.revision)) return;
    this.run = w.id;
    this.revision = v.revision;
    this.explored.width = v.cols * 5;
    this.explored.height = v.rows * 5;
    this.visible.width = w.map.width / 5;
    this.visible.height = w.map.height / 5;
    const a = this.explored.getContext("2d")!,
      b = this.visible.getContext("2d")!;
    a.fillStyle = "#fff";
    v.explored.forEach((n, i) => {
      if (n) a.fillRect((i % v.cols) * 5, Math.floor(i / v.cols) * 5, 5, 5);
    });
    b.fillStyle = "#fff";
    for (const polygon of v.polygons) {
      if (!polygon.length) continue;
      b.beginPath();
      polygon.forEach((p: Vec, i: number) =>
        i ? b.lineTo(p.x / 5, p.y / 5) : b.moveTo(p.x / 5, p.y / 5),
      );
      b.closePath();
      b.fill();
    }
  }
  draw(
    g: CanvasRenderingContext2D,
    w: World,
    camera: Vec,
    halfW: number,
    halfH: number,
  ) {
    this.update(w);
    const x = Math.max(0, camera.x - halfW - 15),
      y = Math.max(0, camera.y - halfH - 15),
      width = Math.min(w.map.width - x, halfW * 2 + 30),
      height = Math.min(w.map.height - y, halfH * 2 + 30);
    // Separate composited overlay keeps destination-out from erasing the actual world.
    const layer = Fog.layer;
    if (
      layer.width !== Math.ceil(width) ||
      layer.height !== Math.ceil(height)
    ) {
      layer.width = Math.ceil(width);
      layer.height = Math.ceil(height);
    }
    const ctx = layer.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#03060bf9";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 0.62;
    ctx.drawImage(
      this.explored,
      x / 10,
      y / 10,
      width / 10,
      height / 10,
      0,
      0,
      width,
      height,
    );
    ctx.globalAlpha = 1;
    ctx.drawImage(
      this.visible,
      x / 5,
      y / 5,
      width / 5,
      height / 5,
      0,
      0,
      width,
      height,
    );
    ctx.globalCompositeOperation = "source-over";
    g.drawImage(layer, x, y);
  }
  minimap(g: CanvasRenderingContext2D, w: World) {
    this.update(w);
    g.save();
    g.globalAlpha = 1;
    g.fillStyle = "#02050b";
    const v = w.visibility;
    for (let y = 0; y < v.rows; y++)
      for (let x = 0; x < v.cols; x++)
        if (!v.explored[y * v.cols + x])
          g.fillRect(x * v.cell, y * v.cell, v.cell, v.cell);
    g.restore();
  }
  private static layer = document.createElement("canvas");
}
