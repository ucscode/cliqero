import { ApiClientError } from "./errors";

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    let body: { error?: string; code?: string; fields?: Record<string, string> } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // Keep the API error useful even when a protocol route returns no JSON.
    }
    throw new ApiClientError(
      body.error ?? "Something went wrong",
      response.status,
      body.code,
      body.fields,
    );
  }
  return (await response.json()) as T;
}
