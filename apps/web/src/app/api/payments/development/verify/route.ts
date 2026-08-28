import { z } from "zod";
import { apiError,authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";

const bodySchema=z.object({payment_id:z.uuid()});
export async function POST(request:Request) {
  const account=await authenticatedAccount(request); if(!account)return Response.json({error:"Unauthorized"},{status:401});
  try { const body=bodySchema.parse(await request.json()); const payment=await getContainer().payments.findById(body.payment_id);
    if(!payment||payment.buyerId!==account.id)return Response.json({error:"Not found"},{status:404});
    const entitlement=await getContainer().paymentCompletion.complete({paymentId:payment.id,correlationId:newId()});
    return Response.json({completed:true,entitlement_id:entitlement.id,listing_id:entitlement.listingId});
  } catch(error){return apiError(error);}
}

