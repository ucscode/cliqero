import {z} from "zod";
import {apiError,authenticatedAccount} from "../../http";
import {getContainer} from "@/infrastructure/container";

const depthSchema=z.coerce.number().int().min(1);const limitSchema=z.coerce.number().int().min(1).max(100).default(25);
export async function GET(request:Request){const account=await authenticatedAccount(request);if(!account)return Response.json({error:"Unauthorized"},{status:401});
  try{const search=new URL(request.url).searchParams;const depth=depthSchema.parse(search.get("depth"));const limit=limitSchema.parse(search.get("limit")??undefined);
    return Response.json(await getContainer().referralGraph.getDownlineAtDepth(account.id,depth,{after:search.get("after")??undefined,limit}));}
  catch(error){return apiError(error);}}
