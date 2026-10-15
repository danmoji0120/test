import frames from "../../assets/v4-frames.json";
export const environmentAtlasUrl = new URL(
  "../../assets/v4-environment-atlas.png",
  import.meta.url,
).href;
export function environmentImage() {
  const i = new Image();
  i.src = environmentAtlasUrl;
  return i;
}
export function environmentFrame(n: number) {
  const [x, y, w, h] = frames["v4-environment-atlas.png"][n];
  return { x, y, w, h };
}
export function drawEnvironment(
  g: CanvasRenderingContext2D,
  img: HTMLImageElement,
  n: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!img.complete || !img.naturalWidth) return;
  const f = environmentFrame(n);
  g.drawImage(img, f.x, f.y, f.w, f.h, x, y, w, h);
}
