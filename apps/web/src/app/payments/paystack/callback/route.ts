import {getContainer} from "@/infrastructure/container";
import {newId} from "@/kernel/ids";

export const runtime="nodejs";
function page(title:string,message:string,status=200){return new Response(`<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`,{status,headers:{"content-type":"text/html; charset=utf-8"}});}
export async function GET(request:Request){
  const query=new URL(request.url).searchParams; const reference=query.get("reference")??query.get("trxref");
  if(!reference||reference.length>200)return page("Payment unavailable","This payment callback is invalid.",400);
  try{
    const container=getContainer(); const payment=await container.payments.findByProviderReference("paystack",reference);
    if(!payment)return page("Payment unavailable","We could not find this payment.",404);
    if(payment.state==="verified")return page("Payment confirmed","Your payment has already been confirmed.");
    await container.paymentCompletion.complete({paymentId:payment.id,correlationId:newId()});
    return page("Payment confirmed","Your payment was confirmed successfully.");
  }catch(error){
    if(error instanceof Error&&/verification failed|mismatch/i.test(error.message))return page("Payment pending","Payment has not been confirmed yet. You may safely close this page while we continue verification.");
    return page("Payment unavailable","We could not complete this payment callback.",400);
  }
}
