import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { newId } from "@/kernel/ids";
import type { ListingRepository } from "@/modules/listing/listing";
import type { AccountReader } from "@/modules/identity/account";
import type {
  PurchaseAttributionResolver,
  ReferralAttributionRepository,
} from "@/modules/referral/attribution";
import { referralUrl } from "@/modules/referral/url";

const hash = (source: string) => createHash("sha256").update(source, "utf8").digest();
const uuidSchema = z.uuid();

function hasValidPublicIdentifiers(referrerAccountId: string, listingId: string): boolean {
  return uuidSchema.safeParse(referrerAccountId).success && uuidSchema.safeParse(listingId).success;
}

export class ReferralAttributionService implements PurchaseAttributionResolver {
  static readonly lifetimeSeconds = 30 * 24 * 60 * 60;
  constructor(
    private readonly attributions: ReferralAttributionRepository,
    private readonly listings: ListingRepository,
    private readonly accounts?: AccountReader,
  ) {}
  async urlFor(referrerAccountId: string, listingId: string) {
    if (!hasValidPublicIdentifiers(referrerAccountId, listingId))
      throw new Error("Listing not found");
    const listing = await this.listings.findById(listingId);
    if (!listing || listing.state !== "published") throw new Error("Listing not found");
    if (listing.sellerId === referrerAccountId)
      throw new Error("You cannot promote your own listing");
    if (this.accounts && !(await this.accounts.exists(referrerAccountId)))
      throw new Error("Referral account not found");
    return referralUrl(referrerAccountId, listingId);
  }
  async visit(
    referrerAccountId: string,
    listingId: string,
  ): Promise<{ listingId: string; source: string } | null> {
    if (!hasValidPublicIdentifiers(referrerAccountId, listingId)) return null;
    const listing = await this.listings.findById(listingId);
    if (!listing || listing.state !== "published" || listing.sellerId === referrerAccountId)
      return null;
    if (this.accounts && !(await this.accounts.exists(referrerAccountId))) return null;
    const source = randomBytes(32).toString("base64url");
    await this.attributions.createAttribution({
      id: newId(),
      listingId,
      referrerAccountId,
      tokenHash: hash(source),
      expiresAt: new Date(Date.now() + ReferralAttributionService.lifetimeSeconds * 1000),
    });
    return { listingId, source };
  }
  resolve(source: string | undefined, listingId: string) {
    if (!source || source.length > 200) return Promise.resolve(null);
    return this.attributions.resolveActive(hash(source), listingId);
  }
}
