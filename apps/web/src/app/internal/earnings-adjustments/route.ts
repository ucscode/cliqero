import {
  internalEarningsAdjustmentCollection,
  internalEarningsAdjustmentCreate,
} from "@/api/internal/earnings-adjustments/handler";

export const runtime = "nodejs";
export const GET = internalEarningsAdjustmentCollection;
export const POST = internalEarningsAdjustmentCreate;
