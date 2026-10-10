import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import { zodSchema } from "@/api/openapi/schema";
import {
  withdrawalResponseSchema,
  withdrawalCreateSchema,
} from "@/api/compat/withdrawals/contracts";

export const compatibilityContracts = defineCompatibilityContracts({
  "POST /api/withdrawals": {
    responseSchema: zodSchema(withdrawalResponseSchema),
    successStatus: "201",
    requestBody: jsonBody(zodSchema(withdrawalCreateSchema)),
  },
});

export const compatibilityExamples: Record<string, unknown> = {
  "POST /api/withdrawals response 201": {
    id: "8fa85f64-5717-4562-b3fc-2c963f66afa6",
    amount_minor: "3100",
    fee_minor: "0",
    net_amount_minor: "3100",
    currency: "USD",
    destination: { method: "bank_transfer", method_name: "Bank Transfer", name: "Primary bank" },
    state: "requested",
    reason: null,
    created_at: "2026-10-04T00:00:00.000Z",
    updated_at: "2026-10-04T00:00:00.000Z",
  },
};
