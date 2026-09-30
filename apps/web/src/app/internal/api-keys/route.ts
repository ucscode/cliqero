import { internalApiKeyCollection, internalApiKeyCreate } from "@/api/internal/api-keys/handler";

export const runtime = "nodejs";

export function GET(request: Request) {
  return internalApiKeyCollection(request);
}

export function POST(request: Request) {
  return internalApiKeyCreate(request);
}
