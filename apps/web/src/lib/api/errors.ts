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
