import type { Account } from "@/modules/identity/account";
import { isAuthenticatedPrincipal, type ApiPrincipal } from "@/modules/identity/api/principal";
import { getContainer } from "@/infrastructure/container";
import { apiErrorResult, publicErrorPayload, validationErrorPayload } from "./error";
import { logDevelopmentError } from "@/infrastructure/development-log";
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
  const publicError = publicErrorPayload(error);
  const validation = validationErrorPayload(error);
  logDevelopmentError(
    error,
    {
      event: "api.error",
      ...(request ? { method: request.method, path: new URL(request.url).pathname } : {}),
      ...(publicError
        ? { publicCode: publicError.payload.code }
        : validation
          ? { publicCode: validation.code }
          : {}),
    },
    publicError || validation
      ? publicError?.status === 401 || publicError?.status === 403
        ? "warn"
        : "info"
      : "error",
  );
  if (publicError) return Response.json(publicError.payload, { status: publicError.status });
  if (validation) return Response.json(validation, { status: 400 });
  const result = apiErrorResult(error);
  return Response.json(result.payload, { status: result.status });
}
