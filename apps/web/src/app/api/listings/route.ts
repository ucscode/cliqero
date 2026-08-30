import { z } from "zod";
import { apiError,authenticatedAccount } from "../http";
import { getContainer } from "@/infrastructure/container";
import { listingView,listingWithMediaView } from "@/application/listings";

const listingSchema=z.object({title:z.string().min(1),description:z.string().default(""),price_minor:z.string().regex(/^\d+$/),
 currency:z.string().length(3),destination:z.url(),metadata:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).optional(),external_key:z.string().max(128).optional()}).strict();
export async function POST(request:Request) {
  const account=await authenticatedAccount(request); if(!account)return Response.json({error:"Unauthorized"},{status:401});
  try { await getContainer().operators.requireCatalogueManager(account.id); const body=listingSchema.parse(await request.json());
    const listing=await getContainer().listingService.create(account,{title:body.title,description:body.description,
      priceMinor:body.price_minor,currency:body.currency,destination:body.destination,metadata:body.metadata,externalKey:body.external_key});
    return Response.json((await import("@/application/listings")).ownerListingView(listing),{status:201}); } catch(error){return apiError(error);}
}
export async function GET(request:Request){const url=new URL(request.url);const limit=Math.min(Number(url.searchParams.get("limit")??20),100);try{const c=getContainer(),page=await c.listingService.queryPublic({search:url.searchParams.get("search")??undefined,cursor:url.searchParams.get("cursor")??undefined,limit}),media=await c.listingMediaRepository.listByListings(page.items.map(item=>item.id));return Response.json({items:page.items.map(item=>listingWithMediaView(item,media.get(item.id)??[],c.listingMedia)),next_cursor:page.nextCursor});}catch(error){return apiError(error);}}
