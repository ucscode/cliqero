import { z } from "zod";
import { apiError,authenticatedAccount } from "../http";
import { getContainer } from "@/infrastructure/container";
import { listingView } from "@/application/listings";

const listingSchema=z.object({title:z.string().min(1),description:z.string().default(""),price_minor:z.string().regex(/^\d+$/),
 currency:z.string().length(3),destination:z.url(),metadata:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).optional()});
export async function POST(request:Request) {
  const account=await authenticatedAccount(request); if(!account)return Response.json({error:"Unauthorized"},{status:401});
  try { const body=listingSchema.parse(await request.json());
    const listing=await getContainer().listingService.create(account,{title:body.title,description:body.description,
      priceMinor:body.price_minor,currency:body.currency,destination:body.destination,metadata:body.metadata});
    return Response.json(listingView(listing),{status:201}); } catch(error){return apiError(error);}
}

