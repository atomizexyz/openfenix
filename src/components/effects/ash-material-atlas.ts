import { DataTexture, LinearFilter, LinearMipmapLinearFilter } from "three";

const TILE_SIZE = 128;
const GRID_SIZE = 4;

function hash(x: number, y: number, seed: number) {
  let value = Math.imul(x + seed * 131, 374761393) + Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

function fbm(x: number, y: number, seed: number) {
  return noise(x, y, seed) * 0.57
    + noise(x * 2.07 + 11, y * 2.07, seed) * 0.28
    + noise(x * 4.13, y * 4.13 + 23, seed) * 0.15;
}

/** Distance to the boundary between two cells: a network of charcoal cracks. */
function fissure(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let first = Infinity;
  let second = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const px = ix + dx + hash(ix + dx, iy + dy, seed);
      const py = iy + dy + hash(ix + dx, iy + dy, seed + 19);
      const distance = (px - x) ** 2 + (py - y) ** 2;
      if (distance < first) {
        second = first;
        first = distance;
      } else if (distance < second) {
        second = distance;
      }
    }
  }
  return Math.sqrt(second) - Math.sqrt(first);
}

function polygonDistance(x: number, y: number, polygon: number[][]) {
  let inside = false;
  let distance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j];
    const [bx, by] = polygon[i];
    const ex = bx - ax;
    const ey = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
    distance = Math.min(distance, Math.hypot(x - ax - ex * t, y - ay - ey * t));
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside ? -distance : distance;
}

/**
 * Sixteen unique fragments, baked once after the lazy Three.js import.
 * RGBA stores mineral mottling, fissures, crumpled height, and signed distance.
 * Keeping these as data (NoColorSpace) lets the shader light and heat the same
 * surface differently throughout its life. Mipmaps filter the fine grain.
 */
export function createAshMaterialAtlas() {
  const size = TILE_SIZE * GRID_SIZE;
  const data = new Uint8Array(size * size * 4);
  const byte = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255);

  for (let tile = 0; tile < GRID_SIZE * GRID_SIZE; tile++) {
    const seed = 73 + tile * 29;
    const sides = 7 + tile % 5;
    const polygon = Array.from({ length: sides }, (_, i) => {
      const angle = (i + hash(i, 2, seed) * 0.45) / sides * Math.PI * 2;
      const radius = 0.48 + hash(i, 7, seed) * 0.38;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });

    for (let py = 0; py < TILE_SIZE; py++) {
      for (let px = 0; px < TILE_SIZE; px++) {
        const x = (px + 0.5) / TILE_SIZE * 2 - 1;
        const y = (py + 0.5) / TILE_SIZE * 2 - 1;
        const broad = fbm(x * 3.7, y * 3.7, seed);
        const grain = fbm(x * 31, y * 18, seed + 1);
        const fibres = noise(x * 12 + broad * 2, y * 48, seed + 3);
        const crackDistance = fissure(x * 4.2 + broad * 0.7, y * 3.5, seed);
        const crack = Math.exp(-crackDistance * 25);
        let distance = polygonDistance(x, y, polygon) + (grain - 0.5) * 0.065;

        // Thin tears and missing chips give a broken edge, not a cloudy disc.
        const tearX = (hash(tile, 11, seed) - 0.5) * 0.7;
        const tear = Math.hypot((x - tearX) * 1.6, y + 0.58) - 0.13;
        if (tile % 3 !== 0) distance = Math.max(distance, -tear);

        const mineral = Math.max(0, Math.min(1, broad * 0.65 + grain * 0.25 + fibres * 0.1));
        const fold = Math.abs(Math.sin(x * (3 + tile % 3) + y * 2 + broad * 2));
        const height = 0.18 + broad * 0.42 + fold * 0.22 + fibres * 0.12 - crack * 0.13;
        const offset = (((tile >> 2) * TILE_SIZE + py) * size + (tile % 4) * TILE_SIZE + px) * 4;
        data[offset] = byte(mineral);
        data[offset + 1] = byte(crack);
        data[offset + 2] = byte(height);
        data[offset + 3] = byte(0.5 - distance * 0.5);
      }
    }
  }

  const texture = new DataTexture(data, size, size);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.name = "Charcoal and ash surface atlas";
  return texture;
}
