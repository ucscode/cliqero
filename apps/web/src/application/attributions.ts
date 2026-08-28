import {createHash,randomBytes} from "node:crypto";
import {newId} from "@/kernel/ids";
import type {ListingRepository} from "@/modules/listing/listing";
import type {PurchaseAttributionResolver,ReferralAttributionRepository} from "@/modules/referral/attribution";

const hash=(source:string)=>createHash("sha256").update(source,"utf8").digest();
export class ReferralAttributionService implements PurchaseAttributionResolver {
  static readonly lifetimeSeconds=30*24*60*60;
  constructor(private readonly attributions:ReferralAttributionRepository,private readonly listings:ListingRepository){}
  async createLink(referrerAccountId:string,listingId:string){
    const listing=await this.listings.findById(listingId);if(!listing||listing.state!=="published")throw new Error("Listing not found");
    return this.attributions.createOrGetLink({id:newId(),code:randomBytes(18).toString("base64url"),listingId,referrerAccountId});
  }
  async visit(code:string):Promise<{listingId:string;source:string}|null>{
    const link=await this.attributions.findActiveLinkByCode(code);if(!link)return null;
    const listing=await this.listings.findById(link.listingId);if(!listing||listing.state!=="published")return null;
    const source=randomBytes(32).toString("base64url");
    await this.attributions.createAttribution({id:newId(),link,tokenHash:hash(source),expiresAt:new Date(Date.now()+ReferralAttributionService.lifetimeSeconds*1000)});
    return {listingId:link.listingId,source};
  }
  resolve(source:string|undefined,listingId:string){if(!source||source.length>200)return Promise.resolve(null);return this.attributions.resolveActive(hash(source),listingId);}
}

