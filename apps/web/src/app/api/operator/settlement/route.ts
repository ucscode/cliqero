import {z} from "zod";
import {apiError,authenticatedAccount} from "../../http";
import {getContainer} from "@/infrastructure/container";
export async function POST(request:Request){const account=await authenticatedAccount(request);if(!account)return Response.json({error:"Unauthorized"},{status:401});
  try{const body=z.object({batch_size:z.coerce.number().int().min(1).max(1000).default(100)}).parse(await request.json().catch(()=>({})));
    await getContainer().operators.requireOperator(account.id);return Response.json(await getContainer().settlement.settle({batchSize:body.batch_size}));}catch(error){return apiError(error);}}
