import type { Account } from "@/modules/identity/account";
import { bearerCredential } from "@/modules/identity/authentication";
import { getContainer } from "@/infrastructure/container";

export async function authenticatedAccount(request:Request):Promise<Account|null> {
  const bearer=bearerCredential(request);
  const cookie=request.headers.get("cookie")?.split(";").map(part=>part.trim()).find(part=>part.startsWith("cliqero_session="))?.slice(16);
  const token=bearer??cookie; return token?getContainer().authentication.authenticate(token):null;
}
export function referralAttributionSource(request:Request):string|undefined {
  return request.headers.get("cookie")?.split(";").map(part=>part.trim())
    .find(part=>part.startsWith("cliqero_attribution="))?.slice("cliqero_attribution=".length);
}
export function apiError(error:unknown):Response {
  const message=error instanceof Error?error.message:"Request failed";
  const status=message==="Forbidden"?403:message.includes("not found")?404:
    message.includes("credentials")||message.includes("Unauthorized")?401:message.includes("already processing")||message.includes("idempotency key already used")?409:400;
  return Response.json({error:message},{status});
}
