# Character art provenance

- `aria-tactical-operator.png`: user-provided official Aria design; originally generated in this chat using `image_gen.imagegen`. Preserved byte-for-byte. Pink twin tails, black tactical uniform, teal accents.
- `operators-atlas.png`: generated using `image_gen.imagegen` with the official Aria PNG as its visual reference. Transparent PNG, four columns (south/east/north/west), two rows (Aria/Luna). No vector or code-generated character fallback.

The client uses the official PNG for Aria portraits and the atlas for both world characters. Luna's portrait is the front-facing atlas cell. Gameplay overlays (shadow, aim marker, reload ring, effects) are drawn separately. Body motion uses sprite transforms; the atlas has four directional poses rather than frame-by-frame walk animations. Guns in the generated sheet share one rifle silhouette; weapon mechanics and effects still distinguish AR/SMG/SG.

Generated atlas file was copied unchanged from `/workspace/generated_images/exec-98122fe6-20cd-471b-b3ca-8685fe2b401b.png`. Original generation tool output is retained outside the project.

## V2 enemy raster atlas

`enemies-atlas.png`: actually generated via `image_gen.imagegen` on 2026-10-15 KST. Original copied unchanged from `/workspace/generated_images/exec-1b5c1273-1558-43d3-900b-7c96b8006e5e.png`; RGBA 1448×1086, alpha 0–255. Three rows rifle/rush/heavy, four columns south/east/north/west. Sealed red-visor armored troops, olive/maroon/ochre silhouettes. `src/art/raster.ts` stores measured alpha bounds. Body art has no code-drawn fallback. Foot arcs, shadows, health bars and hit effects are gameplay overlays. Four static directional poses; independent gun/arm animation is not provided.

## V4 Total Warfare generated assets

Both new atlases were actually generated using `image_gen.imagegen` on 2026-10-15 KST, referencing the official Aria and existing enemy raster art. RGBA PNGs, 1448×1086, transparent alpha0–255; originals copied unchanged. No SVG/Canvas/Python replacement artwork.

- `v4-enemies-atlas.png`: `/workspace/generated_images/exec-8daf2542-2df7-42a4-b034-65d0de4f4172.png`. Juggernaut, recon drone, walker, tracked artillery; four directional poses each.
- `v4-environment-atlas.png`: `/workspace/generated_images/exec-aa32c444-c524-4f32-8ea7-1d837c8962c0.png`. Rock clusters, generator, bunker, communications mast, ruined corner, heavy wrecks and sand/scrub decor.
- `v4-frames.json` measures largest connected alpha-component bounds per cell; the raster files are not edited. Terrain collision clips rock artwork to the same convex polygon used by server collision and sight. Sand fields, roads, shadows and gameplay markers remain procedural terrain/effects.

V4.1 equipment: `v41-equipment-atlas.png` was generated using the actual image_gen.imagegen tool in this session. Its six item PNGs are lossless crops of the original RGBA atlas, not Python/SVG drawings. Source path, crop rectangles, alpha metadata and SHA256 hashes are in `docs/v4.1/art-provenance.json`. Runtime requires no generation API. Existing operator/enemy PNGs are unchanged.
