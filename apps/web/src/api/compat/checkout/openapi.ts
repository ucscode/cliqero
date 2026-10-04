import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import { scalar, uuid, zodSchema } from "@/api/openapi/schema";
import {
  checkoutCreateRequestSchema,
  checkoutCreateSchema,
  checkoutDetailSchema,
  checkoutPaymentSchema,
  checkoutQuoteSchema,
} from "@/api/compat/checkout/contracts";

export const compatibilityContracts = defineCompatibilityContracts({
  "POST /api/checkouts": {
    responseSchema: zodSchema(checkoutCreateSchema),
    successStatus: "201",
    requestBody: jsonBody(zodSchema(checkoutCreateRequestSchema)),
  },
  "GET /api/checkouts/{checkoutId}": {
    responseSchema: zodSchema(checkoutDetailSchema),
  },
  "POST /api/checkouts/{checkoutId}/pay": {
    responseSchema: zodSchema(checkoutPaymentSchema),
  },
  "GET /api/checkout-quote": {
    responseSchema: zodSchema(checkoutQuoteSchema),
    parameters: [{ name: "listing_id", schema: uuid, required: true }],
  },
  "GET /api/checkouts": {
    parameters: [{ name: "limit", schema: scalar("integer", { minimum: 1, maximum: 100 }) }],
  },
});

export const compatibilityExamples: Record<string, unknown> = {
  "POST /api/checkout request": { listing_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
  "POST /api/checkout response 201": {
    id: "5fa85f64-5717-4562-b3fc-2c963f66afa6",
    purchase_id: "6fa85f64-5717-4562-b3fc-2c963f66afa6",
    state: "pending",
    required: { amount_minor: "3100", currency: "USD" },
    available: { amount_minor: "2100", currency: "USD" },
    shortfall: { amount_minor: "1000", currency: "USD" },
  },
  "GET /api/checkout response 200": {
    required: { amount_minor: "3100", currency: "USD" },
    available: { amount_minor: "2100", currency: "USD" },
    shortfall: { amount_minor: "1000", currency: "USD" },
  },
  "GET /api/checkout/{checkoutId} response 200": {
    id: "5fa85f64-5717-4562-b3fc-2c963f66afa6",
    purchase_id: "6fa85f64-5717-4562-b3fc-2c963f66afa6",
    state: "pending",
    amount_minor: "3100",
    currency: "USD",
  },
  "POST /api/checkout/{checkoutId}/pay response 200": {
    id: "5fa85f64-5717-4562-b3fc-2c963f66afa6",
    purchase_id: "6fa85f64-5717-4562-b3fc-2c963f66afa6",
    state: "paid",
    amount_minor: "3100",
    currency: "USD",
    available: { amount_minor: "0", currency: "USD" },
    pending: { amount_minor: "0", currency: "USD" },
    shortfall: { amount_minor: "0", currency: "USD" },
  },
};
