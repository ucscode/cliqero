import { z } from "zod";

export const fundingStateSchema = z.enum([
  "initialization_pending",
  "initializing",
  "awaiting_payment",
  "verification_pending",
  "confirmed",
  "failed",
  "blocked",
  "cancelled",
  "expired",
  "reconciliation_pending",
]);

const snapshotFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  value: z.string(),
  displayValue: z.string().optional(),
  type: z.enum(["text", "select", "textarea", "fixed", "hidden"]),
  copyable: z.boolean(),
});

export const providerAccountSnapshotSchema = z.object({
  id: z.string(),
  collectionCurrency: z.string(),
  fields: z.array(snapshotFieldSchema),
});

export const fundingDetailSchema = z.object({
  id: z.string().uuid(),
  state: fundingStateSchema,
  provider: z.string(),
  provider_display_name: z.string(),
  customer_action: z.string().nullable(),
  funding_reference: z.string(),
  provider_transaction_id: z.string().nullable(),
  amount_minor: z.string(),
  currency: z.string(),
  collection_amount_minor: z.string(),
  collection_currency: z.string(),
  conversion: z
    .object({
      from_currency: z.string(),
      to_currency: z.string(),
      rate: z.string(),
      observed_at: z.string(),
    })
    .nullable(),
  provider_account_id: z.string().nullable(),
  provider_account_snapshot: providerAccountSnapshotSchema.nullable(),
  authorization_url: z.string().nullable(),
  payment_address: z.string().nullable(),
  payment_amount: z.string().nullable(),
  payment_currency: z.string().nullable(),
  asset: z.string().nullable(),
  network: z.string().nullable(),
  instructions: z.string().nullable(),
  expires_at: z.string().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  verification: z
    .object({
      status: z.string(),
      message: z.string(),
      level: z.string(),
      resolved: z.boolean(),
      checked_at: z.string().nullable(),
      confirmations: z.number().int().nonnegative().optional(),
      confirmations_required: z.number().int().nonnegative().optional(),
    })
    .nullable(),
  confirmed_at: z.string().nullable(),
  wallet_credit_state: z.string().nullable(),
  evidence: z
    .object({
      id: z.string().uuid(),
      transfer_reference: z.string().nullable(),
      customer_note: z.string().nullable(),
      proof: z
        .object({
          original_filename: z.string().nullable(),
          mime_type: z.string(),
          byte_size: z.string(),
        })
        .nullable(),
      created_at: z.string(),
    })
    .nullable(),
});

export const fundingStatusSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  provider_display_name: z.string(),
  funding_reference: z.string(),
  provider_transaction_id: z.string().nullable(),
  state: fundingStateSchema,
  amount_minor: z.string(),
  currency: z.string(),
  collection_amount_minor: z.string(),
  collection_currency: z.string(),
  created_at: z.string().nullable(),
  confirmed_at: z.string().nullable(),
});
