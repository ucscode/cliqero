import {getContainer} from "@/infrastructure/container";

export const runtime="nodejs";

export async function POST(request:Request){
  const webhook=getContainer().paystackWebhook;
  if(!webhook)return Response.json({error:"Paystack is unavailable"},{status:503});
  const rawBody=new Uint8Array(await request.arrayBuffer());
  try{
    const result=await webhook.ingest(rawBody,request.headers.get("x-paystack-signature"));
    if(!result.authenticated)return Response.json({error:"Unauthorized"},{status:401});
    return new Response(null,{status:200});
  }catch{
    return Response.json({error:"Invalid webhook"},{status:400});
  }
}

