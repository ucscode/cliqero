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

export class StorageConfigurationError extends Error {
  constructor(
    readonly instanceName: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StorageConfigurationError";
  }
}

export class StorageUnavailableError extends Error {
  constructor(readonly instanceName: string) {
    super(`Object storage provider is unavailable: ${instanceName}`);
    this.name = "StorageUnavailableError";
  }
}

export class ObjectStorageRegistry {
  private providers = new Map<string, ObjectStorageProvider>();
  private factories = new Map<string, () => ObjectStorageProvider | null>();
  private failures = new Map<string, StorageConfigurationError>();

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
    this.factories.delete(instanceName);
    this.failures.delete(instanceName);
    return this;
  }

  registerLazy(
    instanceName: string,
    factory: () => ObjectStorageProvider | null,
    options?: { onFailure?: (error: StorageConfigurationError) => void },
  ) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(instanceName))
      throw new Error(`Object storage instance name is invalid: ${instanceName}`);
    this.providers.delete(instanceName);
    this.failures.delete(instanceName);
    this.factories.set(instanceName, () => {
      try {
        const provider = factory();
        if (!provider) return null;
        if (provider.name !== instanceName)
          throw new Error(
            `Storage instance name does not match lazy registration: ${instanceName}`,
          );
        return provider;
      } catch (error) {
        const configurationError =
          error instanceof StorageConfigurationError
            ? error
            : new StorageConfigurationError(
                instanceName,
                `Storage configuration is invalid: ${instanceName}: ${error instanceof Error ? error.message : "Storage configuration is invalid"}`,
                error,
              );
        this.factories.delete(instanceName);
        this.failures.set(instanceName, configurationError);
        options?.onFailure?.(configurationError);
        throw configurationError;
      }
    });
    return this;
  }

  get(name: string) {
    const existing = this.providers.get(name);
    if (existing) return existing;
    const failure = this.failures.get(name);
    if (failure) throw failure;
    const factory = this.factories.get(name);
    if (factory) {
      const provider = factory();
      this.factories.delete(name);
      if (provider) {
        this.register(provider);
        return this.providers.get(name)!;
      }
    }
    throw new StorageUnavailableError(name);
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
    return [...new Set([...this.providers.keys(), ...this.factories.keys()])];
  }
}
