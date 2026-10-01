import { internalPurchases } from "@/api/internal/purchases/handler";

export const runtime = "nodejs";

export function GET(request: Request) {
  return internalPurchases(request);
}
