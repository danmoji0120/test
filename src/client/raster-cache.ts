/** Runtime cache of the actual PNG crops at gameplay scale; original artwork remains unchanged. */
export class RasterCache {
  private sprites = new Map<string, HTMLCanvasElement>();
  draw(
    g: CanvasRenderingContext2D,
    img: HTMLImageElement,
    key: string,
    f: { x: number; y: number; w: number; h: number },
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    if (!img.complete || !img.naturalWidth) return;
    let canvas = this.sprites.get(key);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = Math.ceil(w * 1.5);
      canvas.height = Math.ceil(h * 1.5);
      const c = canvas.getContext("2d")!;
      c.imageSmoothingQuality = "high";
      c.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, canvas.width, canvas.height);
      this.sprites.set(key, canvas);
    }
    g.drawImage(canvas, x, y, w, h);
  }
}
