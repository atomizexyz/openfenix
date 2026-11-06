import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping } from "three";

/** A reusable 256 KiB noise volume keeps the smoke ray march inexpensive. */
export function createAshNoiseVolume() {
  const size = 64;
  const data = new Uint8Array(size ** 3);
  let seed = 0x5f3759df;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = seed >>> 24;
  }
  const texture = new Data3DTexture(data, size, size, size);
  texture.format = RedFormat;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.needsUpdate = true;
  texture.name = "Fire plume density noise";
  return texture;
}
