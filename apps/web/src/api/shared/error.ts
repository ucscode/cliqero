import { logApiBoundaryError } from "@/infrastructure/development-log";
import { apiErrorResult, requestCorrelationId } from "../error";
import type { ApiContext } from "./context";

export function domainError(c: ApiContext, error: unknown): never {
  const requestId = requestCorrelationId(c.req.raw);
  const result = apiErrorResult(error, requestId);
  logApiBoundaryError(
    error,
    {
      event: "api.error",
      method: c.req.raw.method,
      path: new URL(c.req.raw.url).pathname,
      publicCode: result.payload.code,
      requestId,
    },
    result.status >= 500
      ? "error"
      : result.status === 401 || result.status === 403
        ? "warn"
        : "info",
  );
  c.header("x-request-id", requestId);
  return c.json(result.payload, result.status as never) as never;
}
