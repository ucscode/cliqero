import { useEffect } from "react";
import { ApiClientError, apiErrorMessage, presentFormApiError } from "@/lib/api-client";

export function focusFirstInvalidField(
  fields: Readonly<Record<string, string>>,
  visibleFields: readonly string[],
  documentRef: Document,
): string | null {
  const namedControls = Array.from(
    documentRef.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input[name], textarea[name], select[name]",
    ),
  );
  for (const field of visibleFields) {
    if (!fields[field]) continue;
    const target =
      namedControls.find((element) => element.name === field) ??
      documentRef.querySelector<HTMLElement>(
        `[data-form-field="${field}"] [contenteditable="true"]`,
      );
    if (!target) continue;
    target.scrollIntoView?.({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
    return field;
  }
  return null;
}

export function FormErrorSummary({
  error,
  visibleFields,
  fallback = "Please check the form and try again.",
}: {
  error: unknown;
  visibleFields?: readonly string[];
  fallback?: string;
}) {
  const formFields =
    visibleFields ?? (error instanceof ApiClientError ? Object.keys(error.fields ?? {}) : []);
  const presentation =
    error instanceof ApiClientError ? presentFormApiError(error, formFields, fallback) : null;
  const message = presentation
    ? presentation.message
    : apiErrorMessage(error, typeof error === "string" ? error : fallback);
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  const invalidFields = presentation
    ? formFields.filter((field) => presentation.fields[field])
    : [];
  const invalidFieldSignature = invalidFields.join("|");
  useEffect(() => {
    if (!invalidFieldSignature || typeof document === "undefined") return;
    const sourceFields = error instanceof ApiClientError ? (error.fields ?? {}) : {};
    focusFirstInvalidField(sourceFields, invalidFieldSignature.split("|"), document);
  }, [error, invalidFieldSignature]);
  if (!error) return null;
  if (!message && !requestId) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
    >
      {message && <p>{message}</p>}
      {requestId && <p className="mt-1 text-xs text-rose-800">Reference: {requestId}</p>}
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-rose-800">
      {message}
    </p>
  );
}
