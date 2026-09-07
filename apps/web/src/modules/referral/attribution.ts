import type { Id } from "@/kernel/ids";

export interface PurchaseAttribution {
  attributionId: Id;
  referrerAccountId: Id;
  listingId: Id;
}
export interface ReferralAttributionRepository {
  createAttribution(input: {
    id: Id;
    listingId: Id;
    referrerAccountId: Id;
    tokenHash: Buffer;
    expiresAt: Date;
  }): Promise<void>;
  resolveActive(tokenHash: Buffer, listingId: Id): Promise<PurchaseAttribution | null>;
}
export interface PurchaseAttributionResolver {
  resolve(source: string | undefined, listingId: Id): Promise<PurchaseAttribution | null>;
}
