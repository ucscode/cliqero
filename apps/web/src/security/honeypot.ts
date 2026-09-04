export function isHoneypotValueFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function requestHasHoneypot(request: Request): Promise<boolean> {
  if (!["POST", "PUT", "PATCH"].includes(request.method)) return false;
  if (isHoneypotValueFilled(request.headers.get("x-cliqero-honeypot"))) return true;
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    try {
      return isHoneypotValueFilled((await request.clone().formData()).get("website"));
    } catch {
      return false;
    }
  }
  if (!contentType.includes("application/json")) return false;
  try {
    const body = (await request.clone().json()) as { website?: unknown };
    return isHoneypotValueFilled(body.website);
  } catch {
    return false;
  }
}
