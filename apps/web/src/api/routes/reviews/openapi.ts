import { defineCompatibilityContracts } from "@/api/openapi/compatibility";

export const compatibilityContracts = defineCompatibilityContracts({});

export const compatibilityExamples: Record<string, unknown> = {
  "GET /api/reviews response 200": {
    items: [
      {
        id: "7fa85f64-5717-4562-b3fc-2c963f66afa6",
        listing_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        rating: 5,
        body: "Useful and clear.",
        status: "approved",
        created_at: "2026-10-04T00:00:00.000Z",
        updated_at: "2026-10-04T00:00:00.000Z",
        moderated_at: null,
        reviewer: "example_user",
        is_mine: false,
        listing_title: "Example listing",
      },
    ],
    next_cursor: null,
  },
};
