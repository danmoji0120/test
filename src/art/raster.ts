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

export const enemyAtlasUrl = new URL(
  "../../assets/enemies-atlas.png",
  import.meta.url,
).href;
export function enemyImage() {
  const img = new Image();
  img.src = enemyAtlasUrl;
  return img;
}
/** Alpha bounds measured on the actual imagegen result; the PNG is preserved unchanged. */
const enemyFrames = {
  rifle: [
    [86, 8, 195, 333],
    [438, 10, 270, 333],
    [821, 9, 180, 330],
    [1111, 11, 257, 330],
  ],
  rush: [
    [84, 355, 179, 334],
    [439, 352, 254, 334],
    [825, 354, 180, 333],
    [1137, 354, 278, 337],
  ],
  heavy: [
    [50, 699, 302, 352],
    [390, 698, 348, 374],
    [785, 697, 241, 358],
    [1071, 703, 340, 371],
  ],
};
export function enemyFrame(kind: keyof typeof enemyFrames, direction: number) {
  const [x, y, w, h] = enemyFrames[kind][direction];
  return { x, y, w, h };
}
