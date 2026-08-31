import { getContainer } from "@/infrastructure/container";
import { createApiApp } from "@/api/hono";

// The catch-all is the authoritative application API entry point. The more
// specific route files remain compatibility adapters for existing deployments;
// their handler modules are registered by the Hono compatibility dispatcher.
export const runtime = "nodejs";
async function dispatch(request: Request) {
  return createApiApp(getContainer()).fetch(request);
}
export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
