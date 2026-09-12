import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../http";
import { getContainer } from "@/infrastructure/container";

const querySchema = z.object({
  amount_minor: z.string().regex(/^[1-9][0-9]*$/),
  provider: z.string().min(1),
  collection_currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  payment_currency: z.string().min(1).optional(),
  bank_account_id: z.string().min(1).optional(),
});

export async function GET(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const prepared = await getContainer().fundingService.prepare({
      accountId: account.id,
      amountMinor: BigInt(query.amount_minor),
      providerName: query.provider,
      collectionCurrency: query.collection_currency,
      paymentCurrency: query.payment_currency,
      fundingOptionId: query.bank_account_id,
    });
    return Response.json({
      provider: prepared.provider,
      amount_minor: prepared.canonicalAmount.minorAmount.toString(),
      currency: prepared.canonicalAmount.currency,
      collection_amount_minor: prepared.collectionAmount.minorAmount.toString(),
      collection_currency: prepared.collectionAmount.currency,
      payment_currency: prepared.paymentCurrency?.toUpperCase() ?? null,
      funding_options: (prepared.fundingOptions ?? []).map((option) => ({
        id: option.id,
        collection_currency: option.collectionCurrency,
        fields: option.fields,
      })),
      conversion: prepared.conversionSnapshot
        ? {
            from_currency: prepared.conversionSnapshot.fromCurrency,
            to_currency: prepared.conversionSnapshot.toCurrency,
            rate: prepared.conversionSnapshot.rate,
            observed_at: prepared.conversionSnapshot.observedAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    return apiError(error);
  }
}
