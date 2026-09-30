import { internalApiKeyBulkDelete } from "@/api/internal/api-keys/handler";

export const runtime = "nodejs";

export function POST(request: Request) {
  return internalApiKeyBulkDelete(request);
}
