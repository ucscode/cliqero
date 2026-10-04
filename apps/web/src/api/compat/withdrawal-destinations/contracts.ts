import { z } from "zod";

export const withdrawalDestinationValuesSchema = z.record(z.string(), z.string());
export const withdrawalDestinationPatchSchema = z.union([
  z.object({ status: z.literal("archived") }).strict(),
  z
    .object({
      name: z.string().min(1).max(100).optional(),
      values: withdrawalDestinationValuesSchema.optional(),
    })
    .strict()
    .refine((body) => body.name !== undefined || body.values !== undefined),
]);
