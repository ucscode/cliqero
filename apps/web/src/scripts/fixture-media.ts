import { deflateSync } from "node:zlib";

function crc32(bytes: Uint8Array) {
  let value = ~0;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return ~value >>> 0;
}

/**
 * Small deterministic PNGs keep fixtures self-contained while exercising
 * real media storage. The simple geometric cover is intentionally more than
 * a flat color so the catalogue and detail views exercise real image framing.
 */
export function fixturePng(red: number, green: number, blue: number) {
  const width = 640,
    height = 360,
    scanline = width * 4 + 1,
    raw = Buffer.alloc(scanline * height);
  for (let y = 0; y < height; y++) {
    raw[y * scanline] = 0;
    for (let x = 0; x < width; x++) {
      const offset = y * scanline + 1 + x * 4;
      let r = Math.min(255, red + Math.floor((x / width) * 35));
      let g = Math.min(255, green + Math.floor((y / height) * 35));
      let b = blue;
      if (y < 72) {
        r = Math.max(0, Math.floor(r * 0.55));
        g = Math.max(0, Math.floor(g * 0.55));
        b = Math.max(0, Math.floor(b * 0.55));
      }
      if (x >= 56 && x < width - 56 && y >= 108 && y < 312) {
        r = 242;
        g = 246;
        b = 244;
      }
      if (x >= 92 && x < 430 && y >= 144 && y < 184) {
        r = Math.min(255, red + 50);
        g = Math.min(255, green + 50);
        b = Math.min(255, blue + 50);
      }
      if (x >= 92 && x < 350 && y >= 212 && y < 224) {
        r = 75;
        g = 92;
        b = 88;
      }
      if (x >= 92 && x < 390 && y >= 240 && y < 250) {
        r = 155;
        g = 170;
        b = 165;
      }
      const dx = x - 510,
        dy = y - 174;
      if (dx * dx + dy * dy < 54 * 54) {
        r = Math.min(255, red + 70);
        g = Math.min(255, green + 70);
        b = Math.min(255, blue + 70);
      }
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = 255;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const typeBytes = Buffer.from(type),
      chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    typeBytes.copy(chunk, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
    return chunk;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
