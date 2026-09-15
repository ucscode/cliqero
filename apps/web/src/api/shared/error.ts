import { logDevelopmentError } from "@/infrastructure/development-log";
import { publicErrorPayload, validationErrorPayload } from "../error";
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
  const message = error instanceof Error ? error.message : "Request failed";
  const status =
    message === "Forbidden"
      ? 403
      : message.toLowerCase().includes("not found")
        ? 404
        : message.toLowerCase().includes("already")
          ? 409
          : 400;
  return c.json(
    {
      error: message,
      code:
        status === 403
          ? "forbidden"
          : status === 404
            ? "not_found"
            : status === 409
              ? "conflict"
              : "invalid_request",
    },
    status,
  ) as never;
}
