import {apiError,authenticatedAccount} from "../../http";
import {getContainer} from "@/infrastructure/container";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const account=await authenticatedAccount(request);if(!account)return Response.json({error:"Unauthorized"},{status:401});try{return Response.json(await getContainer().withdrawals.get(account.id,(await params).id));}catch(error){return apiError(error);}}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){const account=await authenticatedAccount(request);if(!account)return Response.json({error:"Unauthorized"},{status:401});try{return Response.json(await getContainer().withdrawals.cancel(account.id,(await params).id));}catch(error){return apiError(error);}}
