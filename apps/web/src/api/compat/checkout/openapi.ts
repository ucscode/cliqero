import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import { scalar, uuid, zodSchema } from "@/api/openapi/schema";
import { z } from "zod";
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
    responseSchema: zodSchema(
      z.object({
        items: z.array(
          z.object({
            id: z.uuid(),
            purchase_id: z.uuid(),
            state: z.string(),
            amount_minor: z.string(),
            currency: z.string(),
          }),
        ),
        next_cursor: z.string().nullable(),
      }),
    ),
    parameters: [
      { name: "limit", schema: scalar("integer", { minimum: 1, maximum: 100 }) },
      { name: "cursor", schema: scalar("string", { maxLength: 512 }) },
    ],
  },
});

export const compatibilityExamples: Record<string, unknown> = {
  "GET /api/checkouts query": {
    limit: 2,
    cursor:
      "eyJ2ZXJzaW9uIjoxLCJidXllcklkIjoiNWZhODVmNjQtNTcxNy00NTYyLWIzZmMtMmM5NjNmNjZhZmE2IiwiY3JlYXRlZEF0IjoiMjAyNi0wNC0xMCAxMToyMjozMy4xMjM0NTYrMDAiLCJpZCI6IjZmYTg1ZjY0LTU3MTctNDU2Mi1iM2ZjLTJjOTYzZjY2YWZhNiJ9",
  },
  "GET /api/checkouts response 200": {
    items: [
      {
        id: "5fa85f64-5717-4562-b3fc-2c963f66afa6",
        purchase_id: "6fa85f64-5717-4562-b3fc-2c963f66afa6",
        state: "pending",
        amount_minor: "3100",
        currency: "USD",
      },
    ],
    next_cursor:
      "eyJ2ZXJzaW9uIjoxLCJidXllcklkIjoiNWZhODVmNjQtNTcxNy00NTYyLWIzZmMtMmM5NjNmNjZhZmE2IiwiY3JlYXRlZEF0IjoiMjAyNi0wNC0xMCAxMToyMjozMy4xMjM0NTYrMDAiLCJpZCI6IjZmYTg1ZjY0LTU3MTctNDU2Mi1iM2ZjLTJjOTYzZjY2YWZhNiJ9",
  },
  "POST /api/checkouts request": { listing_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
  "POST /api/checkouts response 201": {
    id: "5fa85f64-5717-4562-b3fc-2c963f66afa6",
    purchase_id: "6fa85f64-5717-4562-b3fc-2c963f66afa6",
    state: "pending",
    required: { amount_minor: "3100", currency: "USD" },
    available: { amount_minor: "2100", currency: "USD" },
    shortfall: { amount_minor: "1000", currency: "USD" },
  },
  "GET /api/checkout-quote response 200": {
    required: { amount_minor: "3100", currency: "USD" },
    available: { amount_minor: "2100", currency: "USD" },
    shortfall: { amount_minor: "1000", currency: "USD" },
  },
  "GET /api/checkouts/{checkoutId} response 200": {
    id: "5fa85f64-5717-4562-b3fc-2c963f66afa6",
    purchase_id: "6fa85f64-5717-4562-b3fc-2c963f66afa6",
    state: "pending",
    amount_minor: "3100",
    currency: "USD",
  },
  "POST /api/checkouts/{checkoutId}/pay response 200": {
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
