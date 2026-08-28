import { z } from "zod";
import { bearerCredential } from "@/modules/identity/authentication";
import { getContainer } from "@/infrastructure/container";

const bodySchema=z.object({source:z.string().min(1).max(512)});
export async function POST(request:Request) {
  const credential=bearerCredential(request); if(!credential)return Response.json({error:"Unauthorized"},{status:401});
  const integration=await getContainer().integrations.authenticate(credential);
  if(!integration)return Response.json({error:"Unauthorized"},{status:401});
  const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({authorized:false});
  const result=await getContainer().access.verify(parsed.data.source,integration);
  return Response.json(result.authorized?{authorized:true,entitlement_id:result.entitlementId,listing_id:result.listingId,buyer_id:result.buyerId}:{authorized:false});
}

