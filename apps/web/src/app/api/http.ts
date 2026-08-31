import type { Account } from "@/modules/identity/account";
import { getContainer } from "@/infrastructure/container";

export async function authenticatedAccount(request:Request):Promise<Account|null> {
  return getContainer().authentication.authenticateRequest(request);
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
