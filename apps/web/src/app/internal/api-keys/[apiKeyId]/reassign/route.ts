import { internalApiKeyReassign } from "@/api/internal/api-keys/handler";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ apiKeyId: string }> }) {
  const { apiKeyId } = await context.params;
  return internalApiKeyReassign(request, apiKeyId);
}
