const types = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export function inspectImage(bytes: Uint8Array, declared?: string) {
  if (bytes.byteLength === 0) throw new Error("Image file is empty");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds the 10 MiB limit");
  const result = dimensions(bytes);
  if (!types.has(result.mimeType)) throw new Error("Unsupported image type");
  if (declared && declared.toLowerCase() !== result.mimeType)
    throw new Error("Image content does not match its declared MIME type");
  return result;
}
function dimensions(b: Uint8Array): { mimeType: string; width: number; height: number } {
  if (b.length >= 24 && hex(b, 0, 8) === "89504e470d0a1a0a")
    return { mimeType: "image/png", width: u32(b, 16), height: u32(b, 20) };
  if (b.length >= 10 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a"))
    return { mimeType: "image/gif", width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  if (b.length >= 30 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    const chunk = ascii(b, 12, 4);
    if (chunk === "VP8X")
      return {
        mimeType: "image/webp",
        width: 1 + b[24] + (b[25] << 8) + (b[26] << 16),
        height: 1 + b[27] + (b[28] << 8) + (b[29] << 16),
      };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p + 8 < b.length) {
      if (b[p] !== 0xff) {
        p++;
        continue;
      }
      const marker = b[p + 1],
        length = (b[p + 2] << 8) | b[p + 3];
      if (marker >= 0xc0 && marker <= 0xc3)
        return {
          mimeType: "image/jpeg",
          height: (b[p + 5] << 8) | b[p + 6],
          width: (b[p + 7] << 8) | b[p + 8],
        };
      if (length < 2) break;
      p += 2 + length;
    }
  }
  throw new Error("File is not a supported PNG, JPEG, GIF, or WebP image");
}
const ascii = (b: Uint8Array, o: number, l: number) => String.fromCharCode(...b.slice(o, o + l));
const hex = (b: Uint8Array, o: number, l: number) => Buffer.from(b.slice(o, o + l)).toString("hex");
const u32 = (b: Uint8Array, o: number) =>
  (b[o] * 0x1000000 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]) >>> 0;
