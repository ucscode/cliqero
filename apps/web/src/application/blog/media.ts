import { newId } from "@/kernel/ids";
import { inspectImage } from "@/modules/listing/media/image";
import type { ObjectStorageRegistry, ObjectLocator } from "@/modules/storage/object-storage";
import type { BlogMediaAsset, BlogMediaRepository } from "./contracts";

const stagingLifetimeMs = 60 * 60 * 1000;
const deletionClaimLifetimeMs = 5 * 60 * 1000;

export class BlogMediaService {
  constructor(
    private readonly repository: BlogMediaRepository,
    private readonly storage: ObjectStorageRegistry,
    private readonly providerName: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async upload(input: {
    ownerAccountId: string;
    bytes: Uint8Array;
    mimeType?: string;
    origin: string;
  }) {
    await this.cleanupExpired();
    const image = inspectImage(input.bytes, input.mimeType);
    const provider = this.storage.get(this.providerName);
    if (provider.visibility === "private" || !provider.publicUrl || !provider.read)
      throw new Error("Blog image storage must be publicly readable and support media delivery");
    const id = newId();
    const key = `blog/${id}.${image.mimeType.split("/")[1] === "jpeg" ? "jpg" : image.mimeType.split("/")[1]}`;
    const stored = await provider.put({ key, bytes: input.bytes, mimeType: image.mimeType });
    const createdAt = this.now();
    try {
      this.repository.create({
        id,
        ownerAccountId: input.ownerAccountId,
        stored,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + stagingLifetimeMs),
      });
    } catch (error) {
      await provider.delete(stored).catch(() => undefined);
      throw error;
    }
    return { id, url: new URL(`/media/blog/${id}`, input.origin).toString() };
  }

  async find(id: string): Promise<BlogMediaAsset | null> {
    return this.repository.findById(id);
  }

  async discard(id: string, ownerAccountId: string) {
    const marked = this.repository.markUnattachedForDeletion(id, ownerAccountId);
    await this.processDeletionWork();
    return marked;
  }

  async processDeletionWork() {
    const now = this.now();
    let deleted = 0;
    let failed = 0;
    try {
      this.repository.markExpiredForDeletion(now);
    } catch {
      return { deleted, failed: 1 };
    }
    const claimToken = newId();
    let work: BlogMediaAsset[];
    try {
      work = this.repository.claimDeletionWork({
        now,
        staleBefore: new Date(now.getTime() - deletionClaimLifetimeMs),
        claimToken,
      });
    } catch {
      return { deleted, failed: 1 };
    }
    for (const asset of work) {
      try {
        await this.storage.get(asset.storageProvider).delete(locator(asset));
        if (this.repository.deleteById(asset.id, claimToken)) deleted++;
      } catch {
        failed++;
        try {
          this.repository.scheduleDeletionRetry(asset.id, claimToken, this.now());
        } catch {
          // The persisted claim expires and can be reclaimed after a worker restart.
        }
      }
    }
    return { deleted, failed };
  }

  private async cleanupExpired() {
    await this.processDeletionWork();
  }
}

export function blogMediaLocator(asset: BlogMediaAsset): ObjectLocator {
  return locator(asset);
}

function locator(asset: BlogMediaAsset): ObjectLocator {
  return {
    provider: asset.storageProvider,
    container: asset.storageContainer,
    key: asset.objectKey,
  };
}
