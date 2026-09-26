import { createApiApp } from "@/api/hono";
import { getContainer } from "@/infrastructure/container";
import type { ApplicationContainer } from "@/infrastructure/container";

const lazyContainer = new Proxy({} as ApplicationContainer, {
  get: (_target, property) => Reflect.get(getContainer(), property),
});

/** Loads the same generated, access-checked schema used by /api/openapi.json. */
export function getApiOpenApiDocument(request: Request, schemaKey?: string) {
  const app = createApiApp(lazyContainer);
  return app.fetch(
    new Request(new URL("/api/openapi.json", request.url), {
      headers: schemaKey ? { "x-openapi-key": schemaKey } : undefined,
    }),
  );
}
