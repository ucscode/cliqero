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

export interface AccountReferralAttribution {
  referrerAccountId: Id;
}

export interface AccountReferralAttributionRepository {
  createAccountAttribution(input: {
    id: Id;
    referrerAccountId: Id;
    tokenHash: Buffer;
    expiresAt: Date;
  }): Promise<void>;
  resolveAccountAttribution(tokenHash: Buffer): Promise<AccountReferralAttribution | null>;
  claimAccountAttribution(
    tokenHash: Buffer,
    childAccountId: Id,
  ): Promise<AccountReferralAttribution | null>;
  revokeAccountAttribution(tokenHash: Buffer): Promise<void>;
}

export interface AccountReferralAttributionResolver {
  resolve(source: string | undefined): Promise<AccountReferralAttribution | null>;
  claim(source: string | undefined, childAccountId: Id): Promise<AccountReferralAttribution | null>;
  visit(referrerAccountId: Id, previousSource?: string): Promise<{ source: string } | null>;
  urlFor(referrerAccountId: Id): Promise<string>;
}
