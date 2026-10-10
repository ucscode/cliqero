export function externalListingImageUrl(
  metadata: Readonly<Record<string, unknown>>,
): string | null {
  const value = metadata.external_image_url;
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
