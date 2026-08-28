import { z } from "zod";
import { apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";

const bodySchema=z.object({email:z.email(),password:z.string().min(1)});
export async function POST(request:Request) {
  try { const body=bodySchema.parse(await request.json()); const result=await getContainer().authentication.login(body.email,body.password);
    return Response.json({account:{id:result.account.id,email:result.account.email,handle:result.account.handle},token:result.token},{headers:{
      "Set-Cookie":`cliqero_session=${result.token}; HttpOnly; SameSite=Lax; Path=/${process.env.NODE_ENV==="production"?"; Secure":""}`}}); }
  catch(error){return apiError(error);}
}
