import type { FundingMethod } from "@/lib/api-client";
import { Label } from "./ui/label";

/** Provider-owned preparation controls, rendered only after a provider is selected. */
export function FundingProviderPreparation({
  method,
  fundingOptions = [],
  fundingOptionId,
  onFundingOptionChange,
  collectionCurrency,
  onCollectionCurrencyChange,
  paymentCurrency,
  onPaymentCurrencyChange,
  disabled,
}: {
  method: FundingMethod;
  fundingOptions?: FundingPreparationOption[];
  fundingOptionId: string;
  onFundingOptionChange: (value: string) => void;
  collectionCurrency: string;
  onCollectionCurrencyChange: (value: string) => void;
  paymentCurrency: string;
  onPaymentCurrencyChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      {method.id === "bank_transfer" ? (
        <>
          {fundingOptions.length > 0 ? (
            <>
              <Label htmlFor="funding-bank-account">Receiving bank</Label>
              <select
                id="funding-bank-account"
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={fundingOptionId}
                onChange={(event) => onFundingOptionChange(event.target.value)}
                disabled={disabled}
                required
              >
                <option value="">Choose a receiving bank</option>
                {fundingOptions.map((option) => (
                  <option value={option.id} key={`${option.id}:${option.collection_currency}`}>
                    {option.fields.find((field) => field.key === "bank_name")?.value ?? option.id} (
                    {option.collection_currency})
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className="text-sm text-slate-600" role="status">
              Loading eligible receiving banks…
            </p>
          )}
          {fundingOptionId && fundingOptions.length > 0 && (
            <p className="text-sm text-slate-600">
              The receiving account details will be shown after you proceed.
            </p>
          )}
        </>
      ) : method.collection_currencies.length > 1 ? (
        <>
          <Label htmlFor="funding-collection-currency">Collection currency</Label>
          <select
            id="funding-collection-currency"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={collectionCurrency}
            onChange={(event) => onCollectionCurrencyChange(event.target.value)}
            disabled={disabled}
          >
            {method.collection_currencies.map((currency) => (
              <option value={currency} key={currency}>
                {currency}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {method.payment_currencies.length > 0 && (
        <>
          <Label htmlFor="funding-payment-currency">Payment currency</Label>
          <select
            id="funding-payment-currency"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={paymentCurrency}
            onChange={(event) => onPaymentCurrencyChange(event.target.value)}
            disabled={disabled}
          >
            {method.payment_currencies.map((currency) => (
              <option value={currency.code} key={currency.code}>
                {currency.label ?? currency.code.toUpperCase()}
                {currency.network ? ` (${currency.network})` : ""}
              </option>
            ))}
          </select>
        </>
      )}
    </>
  );
}

export type FundingPreparationOption = {
  id: string;
  collection_currency: string;
  fields: Array<{ key: string; label: string; value: string }>;
};
