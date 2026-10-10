import { ApiClientError, normalizeApiError } from "./errors";

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
  const text = response.status === 204 || response.status === 205 ? "" : await response.text();
  let body: unknown;
  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const error = normalizeApiError(body);
    const requestId = error.requestId ?? response.headers.get("x-request-id") ?? undefined;
    throw new ApiClientError(error.message, response.status, error.code, error.fields, requestId);
  }
  return body as T;
}
