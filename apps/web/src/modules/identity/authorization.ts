import type { Account } from "./account";
import type { Listing } from "@/modules/listing/listing";
import type { Entitlement } from "@/modules/entitlement/entitlement";

export class AuthorizationPolicy {
  canModifyListing(account: Account, listing: Listing): boolean {
    return account.id === listing.sellerId;
  }
  canUseEntitlement(account: Account, entitlement: Entitlement): boolean {
    return account.id === entitlement.buyerId && entitlement.isActive;
  }
}
