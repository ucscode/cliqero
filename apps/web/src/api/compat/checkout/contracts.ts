import { z } from "zod";

export const checkoutMoneySchema = z
  .object({ amount_minor: z.string().regex(/^\d+$/), currency: z.string() })
  .strict();

export const checkoutQuoteSchema = z
  .object({
    required: checkoutMoneySchema,
    available: checkoutMoneySchema,
    shortfall: checkoutMoneySchema,
  })
  .strict();

export const checkoutCreateSchema = z
  .object({
    id: z.string().uuid(),
    purchase_id: z.string().uuid(),
    state: z.enum(["pending", "paid", "failed"]),
    required: checkoutMoneySchema,
    available: checkoutMoneySchema,
    shortfall: checkoutMoneySchema,
  })
  .strict();

export const checkoutDetailSchema = z
  .object({
    id: z.string().uuid(),
    purchase_id: z.string().uuid(),
    state: z.enum(["pending", "paid", "failed"]),
    amount_minor: z.string().regex(/^\d+$/),
    currency: z.string(),
  })
  .strict();

export const checkoutPaymentSchema = checkoutDetailSchema
  .extend({
    available: checkoutMoneySchema,
    pending: checkoutMoneySchema,
    shortfall: checkoutMoneySchema,
  })
  .strict();

export const checkoutCreateRequestSchema = z.object({ listing_id: z.string().uuid() }).strict();
