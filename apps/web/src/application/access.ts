import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { Account } from "@/modules/identity/account";
import type { ListingRepository } from "@/modules/listing/listing";
import { AccessService } from "@/modules/access/access";
import type {PurchaseRepository} from "@/modules/purchase/purchase";
import type {EntitlementRepository} from "@/modules/entitlement/entitlement";

export class BuyerAccessService {
  constructor(private readonly access:AccessService,private readonly listings:ListingRepository,private readonly uow:UnitOfWork,private readonly purchases?:PurchaseRepository,private readonly entitlements?:EntitlementRepository) {}
  async handoff(buyer:Account,listingId:string,idempotencyKey?:string):Promise<URL> {
    const listing=await this.listings.findById(listingId); if(!listing||listing.state!=="published")throw new Error("Listing not found");
    const issued=await this.uow.transaction(()=>this.access.issue(buyer.id,listing.id,idempotencyKey));
    const destination=new URL(listing.destination); destination.searchParams.set("source",issued.source); return destination;
  }
  async handoffPurchase(buyer:Account,purchaseId:string,idempotencyKey?:string):Promise<URL>{const purchase=await this.purchases?.findById(purchaseId);if(!purchase||purchase.buyerId!==buyer.id||!(purchase.state==="paid"||purchase.state==="completed"))throw new Error("Purchase not found");const entitlement=await this.entitlements?.findByPurchaseId(purchase.id);if(!entitlement?.isActive)throw new Error("Active entitlement not found");const listing=await this.listings.findById(purchase.terms.listingId);if(!listing)throw new Error("Listing not found");const issued=await this.uow.transaction(()=>this.access.issue(buyer.id,listing.id,idempotencyKey));const destination=new URL(listing.destination);destination.searchParams.set("source",issued.source);return destination;}
}
