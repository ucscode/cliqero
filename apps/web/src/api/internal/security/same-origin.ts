/**
 * Compare browser Origin with the external request origin. Next's internal
 * request URL may use its bind address (for example 0.0.0.0) behind a proxy,
 * so prefer the forwarded public host/protocol and fall back to Host.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (!host) return false;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || new URL(request.url).protocol.slice(0, -1);
  if (protocol !== "http" && protocol !== "https") return false;

  try {
    if (new URL(origin).origin !== new URL(`${protocol}://${host}`).origin) return false;
  } catch {
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin";
}
