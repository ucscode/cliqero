import { z } from "@hono/zod-openapi";
import { z as baseZod } from "zod";

export const errorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  request_id: z.string().optional(),
});

/** Keep runtime validation opaque; the final OAS 3.0 document expands this marker to JSON values. */
export const opaqueJsonSchema = baseZod.unknown().openapi({ "x-cliqero-opaque-json": true });
