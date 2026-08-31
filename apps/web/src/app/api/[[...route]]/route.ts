import { handle } from "hono/vercel";
import { createApiApp } from "@/api/hono";
import { getContainer } from "@/infrastructure/container";
import type { ApplicationContainer } from "@/infrastructure/container";

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
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
