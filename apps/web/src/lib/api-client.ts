export type ListingMedia = {
  id: string;
  url: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  position: number;
  alt_text: string | null;
};

export type Listing = {
  id: string;
  title: string;
  description: string;
  price: { minor_amount: string; currency: string };
  metadata: Record<string, unknown>;
  state?: "draft" | "published" | "archived";
  media: ListingMedia[];
};

export type ListingPage = { items: Listing[]; next_cursor: string | null };

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // Keep the API error useful even when a protocol route returns no JSON.
    }
    throw new ApiClientError(body.error ?? "Something went wrong", response.status, body.code);
  }
  return (await response.json()) as T;
}

export function safeContinuation(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  return value;
}

export function formatMinorUsd(minor: string | bigint): string {
  const value = typeof minor === "bigint" ? minor : BigInt(minor);
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const dollars = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}$${dollars.toLocaleString("en-US")}.${cents}`;
}
