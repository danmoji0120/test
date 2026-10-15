/** Actual imagegen PNGs. Source atlas/provenance lives under assets/ and docs/v4.1/. */
export const equipmentURLs: Record<string, string> = {
  at: new URL("../../assets/v41-at.png", import.meta.url).href,
  pistol: new URL("../../assets/v41-pistol.png", import.meta.url).href,
  frag: new URL("../../assets/v41-frag.png", import.meta.url).href,
  antiarmor: new URL("../../assets/v41-antiarmor.png", import.meta.url).href,
  smoke: new URL("../../assets/v41-smoke.png", import.meta.url).href,
  medical: new URL("../../assets/v41-medical.png", import.meta.url).href,
};
const images = new Map<string, HTMLImageElement>();
export function equipmentSprite(id: string) {
  if (!equipmentURLs[id]) return null;
  let image = images.get(id);
  if (!image) {
    image = new Image();
    image.src = equipmentURLs[id];
    images.set(id, image);
  }
  return image;
}
export const equipmentIcon = (id: string) =>
  equipmentURLs[id]
    ? `<img class="equipment-icon" src="${equipmentURLs[id]}" alt="" aria-hidden="true">`
    : "";
