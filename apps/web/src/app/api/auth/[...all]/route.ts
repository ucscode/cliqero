import { toNextJsHandler } from "better-auth/next-js";
import { getContainer } from "@/infrastructure/container";

// Resolve the application container per request. Keeping construction out of
// module evaluation allows `next build` to collect route configuration without
// requiring runtime database credentials.
function route(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", request: Request) {
  const handler = toNextJsHandler(getContainer().authentication.auth);
  return handler[method](request);
}
export const GET = (request: Request) => route("GET", request);
export const POST = (request: Request) => route("POST", request);
export const PATCH = (request: Request) => route("PATCH", request);
export const PUT = (request: Request) => route("PUT", request);
export const DELETE = (request: Request) => route("DELETE", request);
