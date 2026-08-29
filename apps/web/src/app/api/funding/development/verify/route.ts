import { z } from "zod";
import { apiError,authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";
const bodySchema=z.object({funding_id:z.uuid()});
export async function POST(request:Request) {const account=await authenticatedAccount(request);if(!account)return Response.json({error:"Unauthorized"},{status:401});try{const body=bodySchema.parse(await request.json());const funding=await getContainer().funding.findById(body.funding_id);if(!funding||funding.accountId!==account.id||funding.providerName!=="development")return Response.json({error:"Not found"},{status:404});const confirmed=await getContainer().fundingVerification.process(funding.id);return Response.json({funding_id:funding.id,state:confirmed?.state??funding.state});}catch(error){return apiError(error);}}
