import { z } from "@hono/zod-openapi";
import { z as baseZod } from "zod";

export const errorSchema = z.object({ error: z.string(), code: z.string().optional() });

/** Keep runtime acceptance opaque while avoiding a bare nullable marker in OAS 3.0. */
export const opaqueJsonSchema = baseZod.unknown().openapi({ nullable: false } as never);
