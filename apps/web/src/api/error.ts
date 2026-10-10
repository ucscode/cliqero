import { z } from "zod";
import { DOMAIN_INVARIANT_ERROR, PUBLIC_APPLICATION_ERROR } from "@/kernel/errors";

export type ValidationErrorPayload = {
  error: string;
  code: "validation_error";
  fields?: Record<string, string>;
};

/** Turns Zod's developer-oriented issue array into a stable public API error. */
export function validationErrorPayload(error: unknown): ValidationErrorPayload | null {
  if (!(error instanceof z.ZodError)) return null;
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".");
    if (path && !fields[path]) fields[path] = issue.message;
  }
  const message = Object.values(fields)[0] ?? error.issues[0]?.message ?? "Invalid request";
  return {
    error: message,
    code: "validation_error",
    ...(Object.keys(fields).length ? { fields } : {}),
  };
}

/** A domain invariant is a known business rule, not an unexpected server failure. */
export function domainInvariantErrorPayload(error: unknown): ValidationErrorPayload | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    [DOMAIN_INVARIANT_ERROR]?: unknown;
    message?: unknown;
    fields?: unknown;
  };
  if (
    candidate[DOMAIN_INVARIANT_ERROR] !== true ||
    typeof candidate.message !== "string" ||
    !candidate.fields ||
    typeof candidate.fields !== "object" ||
    Array.isArray(candidate.fields) ||
    Object.values(candidate.fields).some((value) => typeof value !== "string")
  )
    return null;
  return {
    error: candidate.message,
    code: "validation_error",
    ...(Object.keys(candidate.fields).length
      ? { fields: candidate.fields as Record<string, string> }
      : {}),
  };
}

export type PublicErrorPayload = {
  error: string;
  code: string;
  fields?: Record<string, string>;
  request_id?: string;
};

export function publicErrorPayload(
  error: unknown,
): { payload: PublicErrorPayload; status: number } | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    [PUBLIC_APPLICATION_ERROR]?: unknown;
    message?: unknown;
    code?: unknown;
    status?: unknown;
    fields?: unknown;
  };
  if (
    candidate[PUBLIC_APPLICATION_ERROR] !== true ||
    typeof candidate.message !== "string" ||
    typeof candidate.code !== "string" ||
    !Number.isInteger(candidate.status) ||
    (candidate.status as number) < 400 ||
    (candidate.status as number) > 599 ||
    !candidate.fields ||
    typeof candidate.fields !== "object" ||
    Array.isArray(candidate.fields) ||
    Object.values(candidate.fields).some((value) => typeof value !== "string")
  )
    return null;
  return {
    status: candidate.status as number,
    payload: {
      error: candidate.message,
      code: candidate.code,
      ...(Object.keys(candidate.fields).length
        ? { fields: candidate.fields as Record<string, string> }
        : {}),
    },
  };
}

export type ApiErrorResult = {
  status: number;
  payload: PublicErrorPayload;
};

/** Only explicitly classified errors may expose their message to API callers. */
export function apiErrorResult(error: unknown, requestId?: string): ApiErrorResult {
  const publicError = publicErrorPayload(error);
  if (publicError)
    return {
      status: publicError.status as ApiErrorResult["status"],
      payload: { ...publicError.payload, ...(requestId ? { request_id: requestId } : {}) },
    };

  const validation = validationErrorPayload(error);
  if (validation)
    return {
      status: 400,
      payload: { ...validation, ...(requestId ? { request_id: requestId } : {}) },
    };

  const invariant = domainInvariantErrorPayload(error);
  if (invariant)
    return {
      status: 400,
      payload: { ...invariant, ...(requestId ? { request_id: requestId } : {}) },
    };

  return {
    status: 500,
    payload: {
      error: "Internal server error",
      code: "internal_error",
      ...(requestId ? { request_id: requestId } : {}),
    },
  };
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/** Reuse a safe caller-provided trace ID or create one for server/client correlation. */
export function requestCorrelationId(request?: Request): string {
  const supplied = request?.headers.get("x-request-id") ?? request?.headers.get("x-correlation-id");
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}
