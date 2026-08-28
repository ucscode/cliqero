import {z} from "zod";
import {apiError,authenticatedAccount} from "../../http";
import {getContainer} from "@/infrastructure/container";

const schema=z.coerce.number().int().min(1).max(32).default(10);
export async function GET(request:Request){const account=await authenticatedAccount(request);if(!account)return Response.json({error:"Unauthorized"},{status:401});
  try{const depth=schema.parse(new URL(request.url).searchParams.get("max_depth")??undefined);return Response.json({uplines:await getContainer().referralGraph.getUplines(account.id,depth)});}
  catch(error){return apiError(error);}}

