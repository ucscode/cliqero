import { defineCompatibilityContracts, jsonBody } from "@/api/openapi/compatibility";
import { scalar, text, uuid, list, object, nullableUnion, zodSchema } from "@/api/openapi/schema";
import {
  listingCreateSchema,
  listingPageSchema,
  listingPatchSchema,
  listingWithMediaViewSchema,
  ownerListingViewSchema,
} from "@/api/compat/listings/contracts";

const importRecordResult = object(
  {
    index: scalar("integer"),
    status: scalar("string", { enum: ["created", "updated", "skipped", "failed"] }),
    listing_id: uuid,
    retry_identity: text,
    code: text,
    message: text,
    retryable: scalar("boolean"),
  },
  ["index", "status", "retryable"],
);
const listingTransferInputRecord = object(
  {
    id: uuid,
    retry_identity: text,
    external_key: text,
    title: text,
    short_description: text,
    long_description: text,
    price_minor: text,
    currency: text,
    destination: scalar("string", { format: "uri" }),
    metadata: scalar("object", {
      additionalProperties: {
        ...nullableUnion(["string", "number", "boolean"]),
      },
    }),
    state: scalar("string", { enum: ["draft", "published", "archived"] }),
    media: list(
      object(
        {
          media_id: uuid,
          transfer_identity: text,
          url: scalar("string", { format: "uri" }),
          alt_text: text,
          position: scalar("integer"),
        },
        ["url", "position"],
      ),
    ),
  },
  [
    "title",
    "short_description",
    "long_description",
    "price_minor",
    "currency",
    "destination",
    "metadata",
    "state",
    "media",
  ],
);
const listingTransferOutputRecord = object(
  {
    id: uuid,
    external_key: text,
    title: text,
    short_description: text,
    long_description: text,
    price_minor: text,
    currency: text,
    destination: scalar("string", { format: "uri" }),
    metadata: scalar("object", {
      additionalProperties: {
        ...nullableUnion(["string", "number", "boolean"]),
      },
    }),
    state: scalar("string", { enum: ["draft", "published", "archived"] }),
    media: list(
      object({
        media_id: uuid,
        transfer_identity: text,
        url: scalar("string", { format: "uri" }),
        alt_text: text,
        position: scalar("integer"),
      }),
    ),
  },
  [
    "id",
    "title",
    "short_description",
    "long_description",
    "price_minor",
    "currency",
    "destination",
    "metadata",
    "state",
    "media",
  ],
);

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/listings": {
    responseSchema: zodSchema(listingPageSchema),
    parameters: [
      { name: "featured", schema: scalar("boolean") },
      { name: "owner", schema: scalar("string", { enum: ["me"] }) },
      {
        name: "state",
        schema: scalar("string", { enum: ["draft", "published", "archived", "all"] }),
      },
      { name: "visibility", schema: scalar("string", { enum: ["public", "authenticated"] }) },
      { name: "search", schema: scalar("string", { maxLength: 200 }) },
      { name: "cursor", schema: scalar("string") },
      { name: "sort", schema: scalar("string", { enum: ["date", "price", "title", "rating"] }) },
      { name: "direction", schema: scalar("string", { enum: ["asc", "desc"] }) },
      { name: "limit", schema: scalar("integer", { minimum: 1 }) },
    ],
  },
  "GET /api/listings/{listingId}": {
    responseSchema: zodSchema(listingWithMediaViewSchema),
  },
  "POST /api/listings": {
    responseSchema: zodSchema(ownerListingViewSchema),
    successStatus: "201",
    requestBody: jsonBody(zodSchema(listingCreateSchema)),
  },
  "PATCH /api/listings/{listingId}": {
    responseSchema: zodSchema(listingWithMediaViewSchema),
    requestBody: jsonBody(zodSchema(listingPatchSchema)),
  },
  "GET /api/listings/{listingId}/access": {
    responseSchema: object({
      access_url: text,
    }),
  },
  "GET /api/listings/{listingId}/referral-url": {
    responseSchema: object({ listing_id: uuid, url: text }),
  },
  "GET /api/listings/export": {
    responseSchema: list(listingTransferOutputRecord),
    responseDescription: "Listing catalogue export in the requested format",
    responseContent: {
      "application/json": { schema: list(listingTransferOutputRecord) },
      "text/csv": {
        schema: text,
        example:
          'id,retry_identity,external_key,title,short_description,long_description,price_minor,currency,destination,metadata,state,media\n"3fa85f64-5717-4562-b3fc-2c963f66afa6","listing:3fa85f64-5717-4562-b3fc-2c963f66afa6","catalogue-item-1","Example listing","A useful summary","","3100","USD","https://example.test/listing",{},"draft",[]',
      },
      "application/yaml": {
        schema: text,
        example:
          '- id: 3fa85f64-5717-4562-b3fc-2c963f66afa6\n  retry_identity: listing:3fa85f64-5717-4562-b3fc-2c963f66afa6\n  external_key: catalogue-item-1\n  title: Example listing\n  short_description: A useful summary\n  long_description: ""\n  price_minor: "3100"\n  currency: USD\n  destination: https://example.test/listing\n  metadata: {}\n  state: draft\n  media: []',
      },
    },
    parameters: [
      {
        name: "format",
        schema: scalar("string", { enum: ["json", "csv", "yaml"], default: "json" }),
      },
    ],
  },
  "POST /api/listings/import": {
    responseSchema: object({
      total: scalar("integer"),
      created: scalar("integer"),
      updated: scalar("integer"),
      skipped: scalar("integer"),
      failed: scalar("integer"),
      records: list(importRecordResult),
    }),
    successStatus: "207",
    requestBody: {
      required: true,
      content: {
        "application/json": { schema: list(listingTransferInputRecord) },
        "text/csv": {
          schema: text,
          example:
            'id,retry_identity,external_key,title,short_description,long_description,price_minor,currency,destination,metadata,state,media\n"3fa85f64-5717-4562-b3fc-2c963f66afa6","listing:3fa85f64-5717-4562-b3fc-2c963f66afa6","catalogue-item-1","Example listing","A useful summary","","3100","USD","https://example.test/listing",{},"draft",[]',
        },
        "application/yaml": {
          schema: text,
          example:
            '- id: 3fa85f64-5717-4562-b3fc-2c963f66afa6\n  retry_identity: listing:3fa85f64-5717-4562-b3fc-2c963f66afa6\n  external_key: catalogue-item-1\n  title: Example listing\n  short_description: A useful summary\n  long_description: ""\n  price_minor: "3100"\n  currency: USD\n  destination: https://example.test/listing\n  metadata: {}\n  state: draft\n  media: []',
        },
      },
    },
    parameters: [
      { name: "format", schema: scalar("string", { enum: ["json", "csv", "yaml"] }) },
      { name: "mode", schema: scalar("string", { enum: ["create", "upsert"], default: "create" }) },
    ],
  },
  "DELETE /api/listings/{listingId}": {
    successStatus: "204",
  },
});

export const compatibilityExamples: Record<string, unknown> = {
  "POST /api/listings request": {
    title: "Example listing",
    short_description: "A useful summary",
    long_description: "Details for the example listing.",
    price_minor: "3100",
    currency: "USD",
    destination: "https://example.test/listing",
    metadata: { featured: true, rank: 2, note: null },
  },
  "GET /api/listings/{listingId} response 200": {
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    managed_by: "4fa85f64-5717-4562-b3fc-2c963f66afa6",
    title: "Example listing",
    short_description: "A useful summary",
    long_description: "Details for the example listing.",
    price: { minor_amount: "3100", currency: "USD" },
    compare_at_price: null,
    visibility: "public",
    categories: [],
    metadata: { featured: true, rank: 2, note: null },
    state: "published",
    featured_position: null,
    media: [],
    rating: null,
  },
};
