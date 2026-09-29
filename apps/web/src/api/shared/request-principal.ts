import type { ApiPrincipal } from "@/modules/identity/api/principal";

const principalsByRequest = new WeakMap<Request, ApiPrincipal>();

/** Makes the Hono middleware's resolved identity available to compatibility adapters. */
export async function withRequestPrincipal<T>(
  request: Request,
  principal: ApiPrincipal,
  action: () => Promise<T>,
): Promise<T> {
  const previous = principalsByRequest.get(request);
  principalsByRequest.set(request, principal);
  try {
    return await action();
  } finally {
    if (previous) principalsByRequest.set(request, previous);
    else principalsByRequest.delete(request);
  }
}

export function resolvedRequestPrincipal(request: Request): ApiPrincipal | undefined {
  return principalsByRequest.get(request);
}
