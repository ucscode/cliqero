import { z } from "zod";
import { PublicApplicationError } from "@/kernel/errors";

export type ValidationErrorPayload = {
  error: string;
  code: "validation_error";
  fields: Record<string, string>;
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
  return { error: message, code: "validation_error", fields };
}

export type PublicErrorPayload = {
  error: string;
  code: string;
  fields?: Record<string, string>;
};

export function publicErrorPayload(
  error: unknown,
): { payload: PublicErrorPayload; status: number } | null {
  if (!(error instanceof PublicApplicationError)) return null;
  return {
    status: error.status,
    payload: {
      error: error.message,
      code: error.code,
      ...(Object.keys(error.fields).length ? { fields: error.fields } : {}),
    },
  };
}
