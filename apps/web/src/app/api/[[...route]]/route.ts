import { getContainer } from "@/infrastructure/container";
import { createApiApp } from "@/api/hono";
export const runtime = "nodejs";
async function dispatch(request: Request) {
  return createApiApp(getContainer()).fetch(request);
}
export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
