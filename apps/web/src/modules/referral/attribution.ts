import type { Id } from "@/kernel/ids";

export interface ReferralLinkRecord {
  id: Id;
  code: string;
  listingId: Id;
  referrerAccountId: Id;
  state: "active" | "revoked";
  listingTitle?: string | null;
  createdAt?: Date;
}
export interface PurchaseAttribution {
  attributionId: Id;
  referralLinkId: Id;
  referrerAccountId: Id;
  listingId: Id;
}
export interface ReferralAttributionRepository {
  createOrGetLink(input: {
    id: Id;
    code: string;
    listingId: Id;
    referrerAccountId: Id;
  }): Promise<ReferralLinkRecord>;
  findActiveLinkByCode(code: string): Promise<ReferralLinkRecord | null>;
  findLinkById(id: Id): Promise<ReferralLinkRecord | null>;
  listLinks(referrerAccountId: Id): Promise<readonly ReferralLinkRecord[]>;
  revokeLink(id: Id, referrerAccountId: Id): Promise<void>;
  createAttribution(input: {
    id: Id;
    link: ReferralLinkRecord;
    tokenHash: Buffer;
    expiresAt: Date;
  }): Promise<void>;
  resolveActive(tokenHash: Buffer, listingId: Id): Promise<PurchaseAttribution | null>;
}
export interface PurchaseAttributionResolver {
  resolve(source: string | undefined, listingId: Id): Promise<PurchaseAttribution | null>;
}
