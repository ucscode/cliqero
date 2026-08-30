import { z } from "zod";
import { apiError,authenticatedAccount } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { ownerListingView,listingWithMediaView } from "@/application/listings";

const listingSchema=z.object({title:z.string().min(1),description:z.string(),price_minor:z.string().regex(/^\d+$/),currency:z.string().length(3),destination:z.url(),metadata:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()]))}).partial().strict();
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const id=(await params).id,c=getContainer();const account=await authenticatedAccount(request);if(account){try{const listing=await c.listingService.getOwner(account,id);return Response.json(listingWithMediaView(listing,await c.listingMediaRepository.listByListing(id),c.listingMedia,true));}catch{/* Authenticated non-owners still receive the public projection when the listing is published. */}}
  const listing=await c.listingService.getPublic(id);return listing?Response.json(listingWithMediaView(listing,await c.listingMediaRepository.listByListing(id),c.listingMedia)):Response.json({error:"Not found"},{status:404});
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){const account=await authenticatedAccount(request);if(!account)return Response.json({error:"Unauthorized"},{status:401});try{return Response.json(ownerListingView(await getContainer().listingService.archive(account,(await params).id)));}catch(error){return apiError(error);}}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  const account=await authenticatedAccount(request); if(!account)return Response.json({error:"Unauthorized"},{status:401});
  try { const body=listingSchema.parse(await request.json()); const listing=await getContainer().listingService.update(account,(await params).id,
    {title:body.title,description:body.description,priceMinor:body.price_minor,currency:body.currency,destination:body.destination,metadata:body.metadata});
    return Response.json(ownerListingView(listing)); } catch(error){return apiError(error);}
}
