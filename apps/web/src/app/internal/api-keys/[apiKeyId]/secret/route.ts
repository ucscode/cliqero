import { internalApiKeySecret } from "@/api/internal/api-keys/handler";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ apiKeyId: string }> }) {
  const { apiKeyId } = await context.params;
  return internalApiKeySecret(request, apiKeyId);
}
