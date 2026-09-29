import { z } from "@hono/zod-openapi";

export const fundingStateSchema = z.enum([
  "initialization_pending",
  "initializing",
  "awaiting_payment",
  "verification_pending",
  "confirmed",
  "failed",
  "blocked",
  "expired",
  "reconciliation_pending",
]);
export const operatorFundingWalletCreditSchema = z.object({
  id: z.string().uuid(),
  amountMinor: z.string(),
  currency: z.string(),
  state: z.enum(["pending", "available"]),
  createdAt: z.string(),
  availableAt: z.string().nullable(),
});
export const operatorFundingSummarySchema = z.object({
  id: z.string().uuid(),
  account: z.object({ id: z.string().uuid(), username: z.string(), email: z.string().nullable() }),
  provider: z.string(),
  providerReference: z.string(),
  providerTransactionId: z.string().nullable(),
  canonicalAmountMinor: z.string(),
  canonicalCurrency: z.literal("USD"),
  collectionAmountMinor: z.string(),
  collectionCurrency: z.string(),
  state: fundingStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  confirmedAt: z.string().nullable(),
  walletCredit: operatorFundingWalletCreditSchema.nullable(),
});
export const operatorFundingDetailSchema = operatorFundingSummarySchema.extend({
  conversionSnapshot: z
    .object({
      fromCurrency: z.string(),
      toCurrency: z.string(),
      rate: z.string(),
      source: z.string(),
      sourceDate: z.string(),
      observedAt: z.string(),
    })
    .nullable(),
  providerInitialization: z
    .object({
      authorizationUrl: z.string().nullable(),
      providerAccountId: z.string().optional(),
      providerAccountSnapshot: z.unknown().optional(),
    })
    .nullable(),
  operations: z.array(
    z.object({
      id: z.string().uuid(),
      operation: z.string(),
      outcome: z.enum(["succeeded", "failed"]),
      httpStatus: z.number().int().nullable(),
      providerStatus: z.boolean().nullable(),
      providerMessage: z.string().nullable(),
      providerCode: z.string().nullable(),
      failureKind: z.string().nullable(),
      occurredAt: z.string(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string().uuid(),
      eventType: z.string(),
      providerReference: z.string().nullable(),
      amountMinor: z.string().nullable(),
      currency: z.string().nullable(),
      state: z.enum(["received", "processed", "rejected", "ignored"]),
      lastError: z.string().nullable(),
      receivedAt: z.string(),
      processedAt: z.string().nullable(),
      outboxState: z.string().nullable(),
      outboxLastError: z.string().nullable(),
    }),
  ),
  evidence: z
    .object({
      id: z.string().uuid(),
      transferReference: z.string().nullable(),
      proof: z
        .object({
          originalFilename: z.string().nullable(),
          mimeType: z.string(),
          byteSize: z.string(),
        })
        .nullable(),
      customerNote: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
});
