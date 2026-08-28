import { z } from "zod";
import { apiError,authenticatedAccount } from "../http";
import { getContainer } from "@/infrastructure/container";

const bodySchema=z.object({name:z.string().min(1).max(100),listing_id:z.uuid()});
export async function POST(request:Request) {
  const account=await authenticatedAccount(request); if(!account)return Response.json({error:"Unauthorized"},{status:401});
  try { const body=bodySchema.parse(await request.json()); const listing=await getContainer().listings.findById(body.listing_id);
    if(!listing)throw new Error("Listing not found"); if(listing.sellerId!==account.id)throw new Error("Forbidden");
    const created=await getContainer().database.transaction(()=>getContainer().integrations.create(account.id,body.name,listing.id));
    return Response.json({integration_id:created.id,credential:created.credential},{status:201});
  } catch(error){return apiError(error);}
}

