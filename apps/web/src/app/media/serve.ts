import { getContainer } from "@/infrastructure/container";

export async function servePublicListingMedia(providerName: string, key: string) {
  const container = getContainer();
  try {
    const record = await container.listingMediaRepository.findByStorageProviderAndKey?.(
      providerName,
      key,
    );
    if (!record || record.state !== "active") return new Response("Not found", { status: 404 });
    const provider = container.objectStorage.get(providerName);
    if (provider.visibility === "private" || !provider.publicUrl || !provider.read)
      return new Response("Not found", { status: 404 });
    const object = await provider.read({
      provider: providerName,
      container: record.storageContainer,
      key: record.objectKey,
    });
    return new Response(Buffer.from(object.bytes), {
      headers: {
        "content-type": record.mimeType,
        "content-length": record.byteSize.toString(),
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
