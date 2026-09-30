import { internalApiKeyItem } from "@/api/internal/api-keys/handler";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ apiKeyId: string }> }) {
  const { apiKeyId } = await context.params;
  return internalApiKeyItem(request, apiKeyId);
}

export async function PATCH(request: Request, context: { params: Promise<{ apiKeyId: string }> }) {
  const { apiKeyId } = await context.params;
  return internalApiKeyItem(request, apiKeyId);
}

export async function DELETE(request: Request, context: { params: Promise<{ apiKeyId: string }> }) {
  const { apiKeyId } = await context.params;
  return internalApiKeyItem(request, apiKeyId);
}
