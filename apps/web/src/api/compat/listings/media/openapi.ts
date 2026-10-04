import { defineCompatibilityContracts, jsonBody, multipartBody } from "@/api/openapi/compatibility";
import { scalar, text, uuid, dateTime, nullable, list, object } from "@/api/openapi/schema";

const listingMedia = object({
  id: uuid,
  listing_id: uuid,
  url: text,
  mime_type: scalar("string", { enum: ["image/png", "image/jpeg", "image/gif", "image/webp"] }),
  original_filename: text,
  byte_size: text,
  width: scalar("integer"),
  height: scalar("integer"),
  position: scalar("integer"),
  alt_text: nullable(text),
  state: scalar("string", { enum: ["active", "deletion_pending", "deleted"] }),
  created_at: dateTime,
});

export const compatibilityContracts = defineCompatibilityContracts({
  "GET /api/listings/{listingId}/media": {
    responseSchema: object({ items: list(listingMedia) }),
  },
  "GET /api/listings/{listingId}/media/{mediaId}": {
    responseSchema: listingMedia,
  },
  "POST /api/listings/{listingId}/media": {
    responseSchema: listingMedia,
    successStatus: "201",
    requestBody: multipartBody(
      {
        file: scalar("string", { format: "binary" }),
        position: scalar("integer", { minimum: 0 }),
        alt_text: scalar("string", { maxLength: 500 }),
      },
      ["file"],
    ),
  },
  "PATCH /api/listings/{listingId}/media/{mediaId}": {
    responseSchema: listingMedia,
    requestBody: jsonBody(
      object({
        alt_text: scalar("string", { maxLength: 500 }),
        position: scalar("integer", { minimum: 0 }),
      }),
    ),
  },
  "DELETE /api/listings/{listingId}/media/{mediaId}": {
    responseSchema: object({ id: uuid, state: text }),
    successStatus: "202",
  },
});

export const compatibilityExamples: Record<string, unknown> = {
  "POST /api/listings/{listingId}/media request": {
    file: "example-image.png",
    position: 0,
    alt_text: "Product image",
  },
};
