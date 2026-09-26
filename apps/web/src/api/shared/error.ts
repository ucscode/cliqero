import { logDevelopmentError } from "@/infrastructure/development-log";
import { apiErrorResult, publicErrorPayload, validationErrorPayload } from "../error";
import type { ApiContext } from "./context";

export function domainError(c: ApiContext, error: unknown): never {
  const publicError = publicErrorPayload(error);
  const validation = validationErrorPayload(error);
  logDevelopmentError(error, {
    event: "api.error",
    method: c.req.raw.method,
    path: new URL(c.req.raw.url).pathname,
    ...(publicError
      ? { publicCode: publicError.payload.code }
      : validation
        ? { publicCode: validation.code }
        : {}),
  });
  if (publicError)
    return c.json(
      publicError.payload,
      publicError.status as 400 | 401 | 403 | 404 | 409 | 429 | 500,
    ) as never;
  if (validation) return c.json(validation, 400) as never;
  const result = apiErrorResult(error);
  return c.json(result.payload, result.status) as never;
}
