import type { CharacterId } from "../shared/data";
export const ariaPortraitUrl = new URL(
  "../../assets/aria-tactical-operator.png",
  import.meta.url,
).href;
export const operatorAtlasUrl = new URL(
  "../../assets/operators-atlas.png",
  import.meta.url,
).href;
/** Both sources are actual imagegen PNGs; no vector character fallback. */
export function portrait(character: CharacterId, expression = "normal") {
  const alt =
    character === "aria"
      ? "아리아 · 분홍 트윈테일 전술 오퍼레이터"
      : "루나 · 은보라 머리 지원 오퍼레이터";
  return character === "aria"
    ? `<span class="raster-portrait ${expression}"><img src="${ariaPortraitUrl}" alt="${alt}" draggable="false"/></span>`
    : `<span class="atlas-portrait ${expression}"><img src="${operatorAtlasUrl}" alt="${alt}" draggable="false"/></span>`;
}
export function operatorImage() {
  const img = new Image();
  img.src = operatorAtlasUrl;
  return img;
}
// Measured transparent gutters of the generated atlas. Its rows are not perfectly equal.
export function operatorFrame(character: CharacterId, direction: number) {
  const edges = [0, 472, 894, 1308, 1774];
  return {
    x: edges[direction],
    y: character === "aria" ? 0 : 424,
    w: edges[direction + 1] - edges[direction],
    h: character === "aria" ? 424 : 463,
  };
}
