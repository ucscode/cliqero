import { z } from "zod";
import type { PaymentProviderFilters } from "./payment";

/** Shared top-level payment-provider eligibility configuration. */
export const paymentProviderFiltersSchema = z
  .object({
    countries: z.array(z.string()).nullable().default(null),
  })
  .strict();

export function parsePaymentProviderFilters(value: unknown, path: string) {
  const filters = paymentProviderFiltersSchema.parse(value ?? { countries: null });
  for (const code of filters.countries ?? [])
    if (!/^[A-Z]{2}$/.test(code))
      throw new Error(`${path} filters.countries must use uppercase ISO alpha-2 codes`);
  return filters satisfies PaymentProviderFilters;
}
