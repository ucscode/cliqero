import { createHash, timingSafeEqual } from "node:crypto";

export type OpenApiSchemaAccess = Readonly<{
  environment: string | undefined;
  key: string | null;
}>;

export function loadOpenApiSchemaAccess(
  environment = process.env.NODE_ENV,
  configuredKey = process.env.OPENAPI_KEY,
): OpenApiSchemaAccess {
  if (environment === "development") return { environment, key: null };
  const key = configuredKey?.trim();
  return { environment, key: key || null };
}

export function canReadOpenApiSchema(access: OpenApiSchemaAccess, supplied: string | undefined) {
  if (access.environment === "development") return true;
  if (!access.key || !supplied) return false;
  const expected = createHash("sha256").update(access.key).digest();
  const candidate = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expected, candidate);
}
