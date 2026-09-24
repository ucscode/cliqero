import { describe, expect, it } from "vitest";
import { fixturePng } from "@/infrastructure/postgres/seed/fixture-media";
import { inspectImage, MAX_IMAGE_BYTES } from "@/modules/listing/media/image";

const tinyImages = {
  jpeg: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAv/EABQRAQAAAAAAAAAAAAAAAAAAAAA/2gAIAQMBAT8B/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Av/EABQRAQAAAAAAAAAAAAAAAAAAAAA/2gAIAQEAAT8h/9k=",
  gif: "R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
  webp: "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==",
};
const onePixelBmp = Buffer.from(
  "424d3a000000000000003600000028000000010000000100000001001800000000000400000000000000000000000000000000000000000000000000000000",
  "hex",
);

describe("listing image inspection", () => {
  it.each([
    ["PNG", fixturePng(35, 120, 95), "image/png"],
    ["JPEG", Buffer.from(tinyImages.jpeg, "base64"), "image/jpeg"],
    ["GIF", Buffer.from(tinyImages.gif, "base64"), "image/gif"],
    ["WebP", Buffer.from(tinyImages.webp, "base64"), "image/webp"],
  ])("accepts supported %s content", (_name, bytes, mimeType) => {
    const result = inspectImage(bytes, mimeType);
    expect(result.mimeType).toBe(mimeType);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("rejects empty, oversized, malformed, and unsupported image data", () => {
    expect(() => inspectImage(new Uint8Array())).toThrow("empty");
    expect(() => inspectImage(new Uint8Array(MAX_IMAGE_BYTES + 1))).toThrow("10 MiB");
    expect(() => inspectImage(new Uint8Array([0xff, 0xd8, 0xff]))).toThrow();
    expect(() => inspectImage(onePixelBmp)).toThrow("Unsupported image type");
    expect(() => inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toThrow();
  });

  it("rejects a declared MIME type that differs from detected bytes", () => {
    expect(() => inspectImage(Buffer.from(tinyImages.gif, "base64"), "image/png")).toThrow(
      "does not match",
    );
  });
});
