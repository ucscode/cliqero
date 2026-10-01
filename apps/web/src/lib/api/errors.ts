export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type NormalizedApiError = {
  message: string;
  code?: string;
  fields?: Record<string, string>;
};

function readable(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const messages = value.map(readable).filter((item): item is string => Boolean(item));
    return messages.length ? messages.join("; ") : undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["message", "error", "detail", "details", "issues", "fields"]) {
    const message = readable(record[key]);
    if (message) return message;
  }
  const fieldMessages = Object.entries(record)
    .filter(([key]) => !["code", "status", "path"].includes(key))
    .map(([key, message]) => {
      const text = readable(message);
      return text ? `${key}: ${text}` : undefined;
    })
    .filter((item): item is string => Boolean(item));
  return fieldMessages.length ? fieldMessages.join("; ") : undefined;
}

export function normalizeApiError(value: unknown): NormalizedApiError {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const fieldsValue = record.fields;
  const fields =
    fieldsValue && typeof fieldsValue === "object" && !Array.isArray(fieldsValue)
      ? Object.fromEntries(
          Object.entries(fieldsValue).flatMap(([key, fieldValue]) => {
            const message = readable(fieldValue);
            return message ? [[key, message]] : [];
          }),
        )
      : undefined;
  return {
    message: readable(value) ?? "Something went wrong",
    ...(typeof record.code === "string" ? { code: record.code } : {}),
    ...(fields && Object.keys(fields).length ? { fields } : {}),
  };
}

export function presentFormApiError(
  error: ApiClientError,
  visibleFields: readonly string[],
  fallback = "Please check your details and try again.",
): { fields: Record<string, string>; message: string | null } {
  const sourceFields = error.fields ?? {};
  const fields = Object.fromEntries(
    Object.entries(sourceFields).filter(([field]) => visibleFields.includes(field)),
  );
  const hasUnmappedFields = Object.keys(sourceFields).some(
    (field) => !visibleFields.includes(field),
  );
  return {
    fields,
    message: hasUnmappedFields ? fallback : Object.keys(fields).length ? null : error.message,
  };
}
