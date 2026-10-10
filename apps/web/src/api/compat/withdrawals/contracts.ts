import { z } from "zod";

export const withdrawalCreateSchema = z
  .object({
    amount_minor: z.string().regex(/^\d+$/),
    currency: z.string().length(3),
    destination_id: z.string().uuid(),
    transaction_pin: z.string().regex(/^\d{6}$/),
  })
  .strict();

export const withdrawalResponseSchema = z
  .object({
    id: z.string().uuid(),
    amount_minor: z.string().regex(/^\d+$/),
    fee_minor: z.string().regex(/^\d+$/),
    net_amount_minor: z.string().regex(/^\d+$/),
    currency: z.string(),
    destination: z
      .object({ method: z.string(), method_name: z.string(), name: z.string() })
      .strict(),
    state: z.enum(["requested", "approved", "rejected", "cancelled", "completed", "failed"]),
    reason: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
