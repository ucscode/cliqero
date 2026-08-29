import {getContainer} from "@/infrastructure/container";

export const runtime="nodejs";

export async function POST(request:Request){
  const container=getContainer(); const webhook=container.paystackWebhook; const payoutWebhook=container.paystackPayoutWebhook;
  if(!webhook&&!payoutWebhook)return Response.json({error:"Paystack is unavailable"},{status:503});
  const rawBody=new Uint8Array(await request.arrayBuffer());
  try{
    const signature=request.headers.get("x-paystack-signature");
    const results=await Promise.all([webhook?.ingest(rawBody,signature),payoutWebhook?.ingest(rawBody,signature)]);
    if(!results.some(result=>result?.authenticated))return Response.json({error:"Unauthorized"},{status:401});
    return new Response(null,{status:200});
  }catch{
    return Response.json({error:"Invalid webhook"},{status:400});
  }
}
