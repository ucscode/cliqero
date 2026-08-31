import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const gatewayPath = "/api/gateway";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/") || pathname === gatewayPath) return NextResponse.next();
  if (
    (pathname.startsWith("/api/auth/") && pathname !== "/api/auth/sessions") ||
    pathname.startsWith("/api/webhooks/")
  )
    return NextResponse.next();
  if (/^\/api\/listings\/[^/]+\/access\/?$/.test(pathname)) return NextResponse.next();

  const rewrite = request.nextUrl.clone();
  rewrite.pathname = gatewayPath;
  rewrite.search = "";
  const headers = new Headers(request.headers);
  headers.set("x-cliqero-hono-path", pathname);
  headers.set("x-cliqero-hono-query", request.nextUrl.search);
  return NextResponse.rewrite(rewrite, { request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
