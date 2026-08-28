import {getContainer} from "@/infrastructure/container";

export async function GET(request:Request,{params}:{params:Promise<{code:string}>}){
  const visit=await getContainer().referralAttribution.visit((await params).code);if(!visit)return Response.json({error:"Not found"},{status:404});
  const destination=new URL(`/listings/${visit.listingId}`,request.url);return new Response(null,{status:307,headers:{location:destination.toString(),
    "Set-Cookie":`cliqero_attribution=${visit.source}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30*24*60*60}${process.env.NODE_ENV==="production"?"; Secure":""}`}});
}

