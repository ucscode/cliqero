import { z } from "zod";

export const walletTransferResultSchema = z
  .object({
    id: z.string().uuid(),
    from: z.enum(["funding", "earnings"]),
    to: z.enum(["funding", "earnings"]),
    grossMinor: z.string().regex(/^\d+$/),
    feeMinor: z.string().regex(/^\d+$/),
    netMinor: z.string().regex(/^\d+$/),
  })
  .strict();
