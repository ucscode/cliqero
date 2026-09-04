import { handle } from "hono/vercel";
import { createApiApp } from "@/api/hono";
import { getContainer } from "@/infrastructure/container";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requestHasHoneypot } from "@/security/honeypot";

export const runtime = "nodejs";
// Keep container composition request-lazy so Next.js can collect route
// configuration during builds that do not provide runtime database settings.
const lazyContainer = new Proxy({} as ApplicationContainer, {
  get: (_target, property) => Reflect.get(getContainer(), property),
});
const app = createApiApp(lazyContainer);

export const GET = handle(app);
export const HEAD = handle(app);
export const OPTIONS = handle(app);
async function guarded(request: Request) {
  if (await requestHasHoneypot(request))
    return Response.json({ error: "Request rejected" }, { status: 400 });
  return handle(app)(request);
}
export const POST = guarded;
export const PUT = guarded;
export const PATCH = guarded;
export const DELETE = guarded;
