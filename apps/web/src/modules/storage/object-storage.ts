export interface ObjectLocator {
  /** Configured storage instance identity, not the adapter/driver name. */
  provider: string;
  container: string;
  key: string;
}

export interface StoredObject extends ObjectLocator {
  byteSize: number;
  mimeType: string;
}

export interface ObjectStorageProvider {
  /** Configured storage instance identity. */
  readonly name: string;
  readonly visibility?: "public" | "private";
  put(input: { key: string; bytes: Uint8Array; mimeType: string }): Promise<StoredObject>;
  delete(locator: ObjectLocator): Promise<void>;
  publicUrl?(locator: ObjectLocator): string;
  read?(locator: ObjectLocator): Promise<{ bytes: Uint8Array; mimeType: string }>;
}

export class ObjectStorageRegistry {
  private providers = new Map<string, ObjectStorageProvider>();

  constructor(private defaultProviderName: string) {}

  register(provider: ObjectStorageProvider): this;
  register(instanceName: string, provider: ObjectStorageProvider): this;
  register(
    instanceNameOrProvider: string | ObjectStorageProvider,
    configuredProvider?: ObjectStorageProvider,
  ) {
    const instanceName =
      typeof instanceNameOrProvider === "string"
        ? instanceNameOrProvider
        : instanceNameOrProvider.name;
    const provider =
      typeof instanceNameOrProvider === "string" ? configuredProvider : instanceNameOrProvider;
    if (!provider) throw new Error(`Object storage provider is unavailable: ${instanceName}`);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(instanceName))
      throw new Error(`Object storage instance name is invalid: ${instanceName}`);
    this.providers.set(
      instanceName,
      provider.name === instanceName
        ? provider
        : {
            ...provider,
            name: instanceName,
            put: async (input) => ({
              ...(await provider.put(input)),
              provider: instanceName,
            }),
            delete: provider.delete.bind(provider),
            ...(provider.publicUrl ? { publicUrl: provider.publicUrl.bind(provider) } : {}),
            ...(provider.read ? { read: provider.read.bind(provider) } : {}),
          },
    );
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

  publicUrl(locator: ObjectLocator) {
    const provider = this.get(locator.provider);
    if (provider.visibility === "private")
      throw new Error(`Object storage instance is private: ${locator.provider}`);
    if (!provider.publicUrl)
      throw new Error(`Object storage instance cannot produce public URLs: ${locator.provider}`);
    return provider.publicUrl(locator);
  }

  names() {
    return [...this.providers.keys()];
  }
}
