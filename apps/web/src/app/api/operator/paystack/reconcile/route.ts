import {z} from "zod";
import {newId} from "@/kernel/ids";
import {apiError,authenticatedAccount} from "../../../http";
import {getContainer} from "@/infrastructure/container";

const schema=z.object({payment_id:z.uuid()});
export async function POST(request:Request){const account=await authenticatedAccount(request);if(!account)return Response.json({error:"Unauthorized"},{status:401});
  try{const key=request.headers.get("idempotency-key");if(!key||key.length>200)throw new Error("A valid Idempotency-Key is required");const body=schema.parse(await request.json());
    return Response.json({attempt:await getContainer().paymentReconciliation.reconcile({actorId:account.id,paymentId:body.payment_id,idempotencyKey:key,correlationId:newId()})});}
  catch(error){return apiError(error);}}

export async function GET(request:Request){const account=await authenticatedAccount(request);if(!account)return Response.json({error:"Unauthorized"},{status:401});
  try{const search=new URL(request.url).searchParams;const older=z.coerce.number().int().min(1).max(10080).default(15).parse(search.get("older_than_minutes")??undefined);
    const limit=z.coerce.number().int().min(1).max(100).default(50).parse(search.get("limit")??undefined);
    const payments=await getContainer().paymentReconciliation.eligible({actorId:account.id,olderThanMinutes:older,limit});return Response.json({payments:payments.map(p=>{const amount=p.collectionAmount??p.amount;return {id:p.id,reference:p.providerReference,state:p.state,amount_minor:amount.minorAmount.toString(),currency:amount.currency};})});}
  catch(error){return apiError(error);}}
