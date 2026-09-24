import { disableTypes, imageSize, types as imageTypes } from "image-size-next";

const supportedMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const supportedImageTypes = new Set(["png", "jpg", "gif", "webp"]);
const mimeTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

// image-size-next stores disabled parser types in module-global state. Configure
// that state once here, preserving only the formats accepted by Cliqero.
disableTypes(imageTypes.filter((type) => !supportedImageTypes.has(type)));

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export function inspectImage(bytes: Uint8Array, declared?: string) {
  if (bytes.byteLength === 0) throw new Error("Image file is empty");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds the 10 MiB limit");
  let detected: ReturnType<typeof imageSize>;
  try {
    detected = imageSize(bytes);
  } catch {
    throw new Error("File is not a supported PNG, JPEG, GIF, or WebP image");
  }
  const mimeType = mimeTypes[detected.type?.toLowerCase() ?? ""];
  if (!mimeType || !supportedMimeTypes.has(mimeType)) throw new Error("Unsupported image type");
  if (declared && declared.toLowerCase() !== mimeType)
    throw new Error("Image content does not match its declared MIME type");
  return { mimeType, width: detected.width, height: detected.height };
}
