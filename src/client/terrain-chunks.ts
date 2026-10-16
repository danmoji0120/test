import type { World, Vec } from "../shared/data";
import { paintTerrain } from "./terrain";
/** 16 bounded1024px surfaces, independent of world area. Coordinates seed all detail. */
export class TerrainChunks {
  readonly size = 1024;
  readonly limit = 16;
  private cache = new Map<string, HTMLCanvasElement>();
  private run = "";
  created = 0;
  evicted = 0;
  generationMs: number[] = [];
  clear() {
    for (const c of this.cache.values()) {
      c.width = 0;
      c.height = 0;
    }
    this.cache.clear();
    this.run = "";
  }
  stats() {
    return {
      chunks: this.cache.size,
      created: this.created,
      evicted: this.evicted,
      canvasBytes: this.cache.size * this.size * this.size * 4,
      generationMs: this.generationMs.slice(-100),
    };
  }
  draw(
    g: CanvasRenderingContext2D,
    w: World,
    atlas: HTMLImageElement,
    camera: Vec,
    halfW: number,
    halfH: number,
  ) {
    if (this.run !== w.id) {
      this.clear();
      this.run = w.id;
      this.created = 0;
      this.evicted = 0;
      this.generationMs = [];
    }
    const minX = Math.max(0, Math.floor((camera.x - halfW - 32) / this.size)),
      maxX = Math.min(
        Math.ceil(w.map.width / this.size) - 1,
        Math.floor((camera.x + halfW + 32) / this.size),
      ),
      minY = Math.max(0, Math.floor((camera.y - halfH - 32) / this.size)),
      maxY = Math.min(
        Math.ceil(w.map.height / this.size) - 1,
        Math.floor((camera.y + halfH + 32) / this.size),
      );
    for (let cy = minY; cy <= maxY; cy++)
      for (let cx = minX; cx <= maxX; cx++) {
        const key = cx + ":" + cy;
        let c = this.cache.get(key);
        if (c) this.cache.delete(key);
        else {
          // Release the oldest backing surface before allocating its replacement.
          // The16-surface bound holds during traversal as well as after a frame.
          if (this.cache.size >= this.limit) {
            const oldest = this.cache.keys().next().value!,
              released = this.cache.get(oldest)!;
            released.width = 0;
            released.height = 0;
            this.cache.delete(oldest);
            this.evicted++;
          }
          const t = performance.now();
          c = document.createElement("canvas");
          c.width = this.size;
          c.height = this.size;
          const ctx = c.getContext("2d")!;
          ctx.translate(-cx * this.size, -cy * this.size);
          paintTerrain(ctx, w, atlas, {
            x: cx * this.size,
            y: cy * this.size,
            w: this.size,
            h: this.size,
          });
          this.created++;
          this.generationMs.push(performance.now() - t);
          if (this.generationMs.length > 100) this.generationMs.shift();
        }
        this.cache.set(key, c);
        g.drawImage(c, cx * this.size, cy * this.size);
      }
    while (this.cache.size > this.limit) {
      const key = this.cache.keys().next().value!,
        old = this.cache.get(key)!;
      old.width = 0;
      old.height = 0;
      this.cache.delete(key);
      this.evicted++;
    }
  }
}
