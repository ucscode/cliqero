import { z } from "zod";
import { apiError,authenticatedAccount } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { listingView } from "@/application/listings";

const listingSchema=z.object({title:z.string().min(1),description:z.string(),price_minor:z.string().regex(/^\d+$/),currency:z.string().length(3),
 destination:z.url(),metadata:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()]))});
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) {
  const listing=await getContainer().listingService.getPublic((await params).id);
  return listing?Response.json(listingView(listing)):Response.json({error:"Not found"},{status:404});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  const account=await authenticatedAccount(request); if(!account)return Response.json({error:"Unauthorized"},{status:401});
  try { const body=listingSchema.parse(await request.json()); const listing=await getContainer().listingService.update(account,(await params).id,
    {title:body.title,description:body.description,priceMinor:body.price_minor,currency:body.currency,destination:body.destination,metadata:body.metadata});
    return Response.json(listingView(listing)); } catch(error){return apiError(error);}
}

