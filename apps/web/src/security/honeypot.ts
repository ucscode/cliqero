import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";

export type HoneypotSource = "header" | "form" | "json";

export function isHoneypotValueFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function honeypotRejectionResponse(): Response {
  return Response.json(
    { error: "Something went wrong. Please try again.", code: "request_rejected" },
    { status: 400 },
  );
}

export async function requestHoneypotSource(request: Request): Promise<HoneypotSource | null> {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return null;
  if (isHoneypotValueFilled(request.headers.get(HONEYPOT_HEADER_NAME))) return "header";
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    try {
      const form = await request.clone().formData();
      return [form.get(HONEYPOT_FIELD_NAME), form.get("website")].some(isHoneypotValueFilled)
        ? "form"
        : null;
    } catch {
      return null;
    }
  }
  if (!contentType.includes("application/json")) return null;
  try {
    const body = (await request.clone().json()) as Record<string, unknown>;
    return [body[HONEYPOT_FIELD_NAME], body.website].some(isHoneypotValueFilled) ? "json" : null;
  } catch {
    return null;
  }
}

export async function requestHasHoneypot(request: Request): Promise<boolean> {
  return (await requestHoneypotSource(request)) !== null;
}
