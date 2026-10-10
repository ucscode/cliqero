import type { Account } from "@/modules/identity/account";
import { isAuthenticatedPrincipal, type ApiPrincipal } from "@/modules/identity/api/principal";
import { getContainer } from "@/infrastructure/container";
import { apiErrorResult, requestCorrelationId } from "./error";
import { logApiBoundaryError } from "@/infrastructure/development-log";
import { resolvedRequestPrincipal } from "./shared/request-principal";
import type { ApplicationContainer } from "@/infrastructure/container";

/** Shared authentication boundary for capability routes migrating to Hono. */
export async function authenticatedPrincipal(
  request: Request,
  container?: Pick<ApplicationContainer, "principalResolver">,
): Promise<ApiPrincipal> {
  const resolved = resolvedRequestPrincipal(request);
  if (resolved) return resolved;
  return (container ?? getContainer()).principalResolver.resolve(request);
}

export async function authenticatedAccount(request: Request): Promise<Account | null> {
  const principal = await authenticatedPrincipal(request);
  return isAuthenticatedPrincipal(principal) ? principal.account : null;
}

/** Browser navigation endpoints must not treat API credentials as user sessions. */
export async function authenticatedSessionAccount(request: Request): Promise<Account | null> {
  const principal = await authenticatedPrincipal(request);
  return principal.kind === "user_session" ? principal.account : null;
}

export function referralAttributionSource(request: Request): string | undefined {
  return cookieSource(request, "cliqero_attribution");
}

export function accountReferralSource(request: Request): string | undefined {
  return cookieSource(request, "cliqero_referrer");
}

function cookieSource(request: Request, name: string): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function apiError(error: unknown, request?: Request): Response {
  const requestId = requestCorrelationId(request);
  const result = apiErrorResult(error, requestId);
  logApiBoundaryError(
    error,
    {
      event: "api.error",
      ...(request ? { method: request.method, path: new URL(request.url).pathname } : {}),
      publicCode: result.payload.code,
      requestId,
    },
    result.status >= 500
      ? "error"
      : result.status === 401 || result.status === 403
        ? "warn"
        : "info",
  );
  return Response.json(result.payload, {
    status: result.status,
    headers: { "x-request-id": requestId },
  });
}
