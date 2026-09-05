export function generatedObjectKey(listingId: string, mediaId: string, mimeType: string) {
  const extension: { [key: string]: string } = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  const value = extension[mimeType];
  if (!value) throw new Error("Unsupported image type");
  return `listings/${listingId}/${mediaId}.${value}`;
}
