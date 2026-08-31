import { getContainer } from "@/infrastructure/container";
import { createApiApp } from "@/api/hono";

export const runtime = "nodejs";

async function dispatch(request: Request) {
  const incoming = new URL(request.url);
  const path = request.headers.get("x-cliqero-hono-path");
  if (!path || !path.startsWith("/api/") || path === "/api/gateway")
    return Response.json({ error: "Not found", code: "not_found" }, { status: 404 });
  const target = new URL(path, incoming.origin);
  target.search = request.headers.get("x-cliqero-hono-query") ?? "";
  return createApiApp(getContainer()).fetch(new Request(target, request));
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
