import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";

export function isHoneypotValueFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function honeypotRejectionResponse(): Response {
  return Response.json(
    { error: "Something went wrong. Please try again.", code: "request_rejected" },
    { status: 400 },
  );
}

export async function requestHasHoneypot(request: Request): Promise<boolean> {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return false;
  if (isHoneypotValueFilled(request.headers.get(HONEYPOT_HEADER_NAME))) return true;
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    try {
      const form = await request.clone().formData();
      return [form.get(HONEYPOT_FIELD_NAME), form.get("website")].some(isHoneypotValueFilled);
    } catch {
      return false;
    }
  }
  if (!contentType.includes("application/json")) return false;
  try {
    const body = (await request.clone().json()) as Record<string, unknown>;
    return [body[HONEYPOT_FIELD_NAME], body.website].some(isHoneypotValueFilled);
  } catch {
    return false;
  }
}
