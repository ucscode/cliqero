import { z } from "zod";
import { apiError,authenticatedAccount,referralAttributionSource } from "../http";
import { getContainer } from "@/infrastructure/container";

const bodySchema=z.object({listing_id:z.uuid(),provider:z.string().default("development"),collection_currency:z.string().length(3).optional()});
export async function POST(request:Request) {
  const account=await authenticatedAccount(request); if(!account)return Response.json({error:"Unauthorized"},{status:401});
  const idempotencyKey=request.headers.get("idempotency-key"); if(!idempotencyKey)return Response.json({error:"Idempotency-Key is required"},{status:400});
  try { const body=bodySchema.parse(await request.json());
    return Response.json(await getContainer().checkout.initiate({buyerId:account.id,buyerEmail:account.email,listingId:body.listing_id,
      providerName:body.provider,idempotencyKey,collectionCurrency:body.collection_currency,attributionSource:referralAttributionSource(request)}),{status:201});
  } catch(error){return apiError(error);}
}
