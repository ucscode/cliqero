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

export type ListingImageSource = "none" | "uploaded" | "external";

/**
 * Older listings have no explicit source marker. Preserve their established
 * rendering: a valid external URL took precedence over uploaded media.
 */
export function listingImageSource(
  metadata: Readonly<Record<string, unknown>>,
  hasUploadedMedia: boolean,
): ListingImageSource {
  const source = metadata.image_source;
  if (source === "none" || source === "uploaded" || source === "external") return source;
  if (externalListingImageUrl(metadata)) return "external";
  return hasUploadedMedia ? "uploaded" : "none";
}

export function listingCoverImageUrl(
  metadata: Readonly<Record<string, unknown>>,
  uploadedUrl: string | undefined,
): string | null {
  switch (listingImageSource(metadata, Boolean(uploadedUrl))) {
    case "none":
      return null;
    case "uploaded":
      return uploadedUrl ?? null;
    case "external":
      return externalListingImageUrl(metadata);
  }
}

export function updateListingImageMetadata(
  metadata: Readonly<Record<string, unknown>>,
  source: ListingImageSource,
  externalUrl: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...metadata, image_source: source };
  if (externalUrl.trim()) next.external_image_url = externalUrl.trim();
  return next;
}
