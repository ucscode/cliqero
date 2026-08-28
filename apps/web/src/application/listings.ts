import { newId,type Id } from "@/kernel/ids";
import { Listing,type ListingMetadata,type ListingRepository } from "@/modules/listing/listing";
import { Money } from "@/modules/money/money";
import type { Account } from "@/modules/identity/account";
import { AuthorizationPolicy } from "@/modules/identity/authorization";

export class ListingService {
  constructor(private readonly listings:ListingRepository,private readonly authorization:AuthorizationPolicy) {}
  async create(seller:Account,input:{title:string;description:string;priceMinor:string;currency:string;destination:string;metadata?:ListingMetadata}) {
    const listing=Listing.create({id:newId(),sellerId:seller.id,title:input.title,description:input.description,
      price:Money.of(BigInt(input.priceMinor),input.currency),destination:input.destination,metadata:input.metadata});
    listing.publish(); await this.listings.save(listing); return listing;
  }
  async update(actor:Account,id:Id,input:{title:string;description:string;priceMinor:string;currency:string;destination:string;metadata:ListingMetadata}) {
    const listing=await this.listings.findById(id); if(!listing)throw new Error("Listing not found");
    if(!this.authorization.canModifyListing(actor,listing))throw new Error("Forbidden");
    listing.update({...input,price:Money.of(BigInt(input.priceMinor),input.currency)}); await this.listings.save(listing); return listing;
  }
  async getPublic(id:Id) { const listing=await this.listings.findById(id); return listing?.state==="published"?listing:null; }
}

export function listingView(listing:Listing) {
  return {id:listing.id,seller_id:listing.sellerId,title:listing.title,description:listing.description,
    price:{minor_amount:listing.price.minorAmount.toString(),currency:listing.price.currency},metadata:listing.metadata,state:listing.state};
}

