import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { Account } from "@/modules/identity/account";
import type { ListingRepository } from "@/modules/listing/listing";
import { AccessService } from "@/modules/access/access";

export class BuyerAccessService {
  constructor(private readonly access:AccessService,private readonly listings:ListingRepository,private readonly uow:UnitOfWork) {}
  async handoff(buyer:Account,listingId:string,idempotencyKey?:string):Promise<URL> {
    const listing=await this.listings.findById(listingId); if(!listing||listing.state!=="published")throw new Error("Listing not found");
    const issued=await this.uow.transaction(()=>this.access.issue(buyer.id,listing.id,idempotencyKey));
    const destination=new URL(listing.destination); destination.searchParams.set("source",issued.source); return destination;
  }
}

