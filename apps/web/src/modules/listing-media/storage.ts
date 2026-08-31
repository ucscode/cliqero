export interface ObjectLocator {
  provider: string;
  container: string;
  key: string;
}
export interface StoredObject extends ObjectLocator {
  byteSize: number;
  mimeType: string;
}
export interface ObjectStorageProvider {
  readonly name: string;
  put(input: { key: string; bytes: Uint8Array; mimeType: string }): Promise<StoredObject>;
  delete(locator: ObjectLocator): Promise<void>;
  publicUrl(locator: ObjectLocator): string;
  read?(locator: ObjectLocator): Promise<{ bytes: Uint8Array; mimeType: string }>;
}
export class ObjectStorageRegistry {
  private providers = new Map<string, ObjectStorageProvider>();
  constructor(private defaultProviderName: string) {}
  register(provider: ObjectStorageProvider) {
    this.providers.set(provider.name, provider);
    return this;
  }
  get(name: string) {
    const value = this.providers.get(name);
    if (!value) throw new Error(`Object storage provider is unavailable: ${name}`);
    return value;
  }
  default() {
    return this.get(this.defaultProviderName);
  }
  names() {
    return [...this.providers.keys()];
  }
}
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
