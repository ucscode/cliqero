import { ApiClientError, apiErrorMessage, presentFormApiError } from "@/lib/api-client";

export function FormErrorSummary({
  error,
  visibleFields,
  fallback = "Please check the form and try again.",
}: {
  error: unknown;
  visibleFields?: readonly string[];
  fallback?: string;
}) {
  if (!error) return null;
  const presentation =
    error instanceof ApiClientError && visibleFields
      ? presentFormApiError(error, visibleFields, fallback)
      : null;
  const message = presentation
    ? presentation.message
    : apiErrorMessage(error, typeof error === "string" ? error : fallback);
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
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
