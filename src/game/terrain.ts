/** Deterministic continuous fields, shared by generation and the cached ground renderer. */
export function terrainNoise(x: number, y: number, seed: number) {
  const hash = (a: number, b: number) => {
    let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const ix = Math.floor(x),
    iy = Math.floor(y),
    u = x - ix,
    v = y - iy,
    fx = u * u * (3 - 2 * u),
    fy = v * v * (3 - 2 * v);
  return (
    (hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx) * (1 - fy) +
    (hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx) * fy
  );
}
export function elevation(x: number, y: number, seed: number) {
  return (
    terrainNoise(x / 900, y / 900, seed) * 0.58 +
    terrainNoise(x / 330, y / 330, seed + 19) * 0.3 +
    terrainNoise(x / 100, y / 100, seed + 71) * 0.12
  );
}
