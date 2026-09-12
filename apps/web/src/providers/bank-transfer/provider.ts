import type { Id } from "@/kernel/ids";
import {
  CountryCurrencyResolver,
  loadCountryCurrencyResolver,
  type CurrencyMappingConfig,
} from "@/modules/money/country-currency";
import { Money } from "@/modules/money/money";
import type {
  PaymentInitialization,
  PaymentFundingOption,
  PaymentProvider,
  PaymentVerification,
} from "@/modules/payment/payment";

export interface BankTransferConfiguration {
  accounts: readonly BankTransferAccount[];
  currencyMapping?: CurrencyMappingConfig;
  displayName?: string;
  imageUrl?: string;
  description?: string;
}

export interface BankTransferField {
  key: string;
  label: string;
  value: string;
}

export interface BankTransferAccount {
  id: string;
  fields: readonly BankTransferField[];
  filters: { countries: string[] | null };
  currencyMapping?: CurrencyMappingConfig;
}

/** Manual bank transfer funding. Confirmation is deliberately never inferred from submission. */
export class BankTransferProvider implements PaymentProvider {
  readonly name = "bank_transfer";
  readonly displayName: string;
  readonly imageUrl: string;
  readonly description: string;
  readonly collectionCurrencies: readonly string[];

  constructor(
    private readonly config: BankTransferConfiguration,
    private readonly countryCurrencies: CountryCurrencyResolver = loadCountryCurrencyResolver(),
  ) {
    this.displayName = config.displayName ?? "Bank transfer";
    this.imageUrl = config.imageUrl ?? "/images/payment/bank-transfer.svg";
    this.description = config.description ?? "Transfer funds from your bank account.";
    this.collectionCurrencies = ["USD"];
  }

  eligibleAccounts(input: { country: string | null }) {
    const country = input.country?.toUpperCase() ?? null;
    return this.config.accounts.filter((account) => {
      const filters = account.filters;
      return !filters?.countries || (country !== null && filters.countries.includes(country));
    });
  }

  fundingOptions(input: { country: string | null }): readonly PaymentFundingOption[] {
    const country = input.country?.toUpperCase() ?? null;
    return this.config.accounts
      .filter((account) => {
        const countries = account.filters?.countries;
        return !countries || (country !== null && countries.includes(country));
      })
      .map((account) => ({
        id: account.id,
        collectionCurrency: this.countryCurrencies.resolve(country, {
          provider: this.config.currencyMapping,
          account: account.currencyMapping,
        }),
        fields: account.fields,
      }));
  }

  collectionCurrenciesFor(input: { country: string | null }) {
    return [...new Set(this.fundingOptions(input).map((option) => option.collectionCurrency))];
  }

  isEligible(input: { country: string | null }) {
    return this.eligibleAccounts(input).length > 0;
  }

  referenceFor(input: { paymentId: Id; idempotencyKey: string }) {
    return `bank-${input.paymentId}`;
  }

  async initiate(input: {
    paymentId: Id;
    amount: Money;
    idempotencyKey: string;
    buyerEmail: string;
    country?: string | null;
    fundingOptionId?: string;
  }): Promise<PaymentInitialization> {
    const eligible = this.eligibleAccounts({
      country: input.country ?? null,
    });
    const account = input.fundingOptionId
      ? eligible.find((candidate) => candidate.id === input.fundingOptionId)
      : eligible.length === 1
        ? eligible[0]
        : undefined;
    if (!account) throw new Error("No eligible bank-transfer account is configured");
    const option = this.fundingOptions({ country: input.country ?? null }).find(
      (candidate) => candidate.id === account.id,
    );
    if (!option || option.collectionCurrency !== input.amount.currency)
      throw new Error("The selected receiving account controls the collection currency");
    const reference = this.referenceFor(input);
    return {
      reference,
      metadata: {
        providerAccountId: account.id,
        providerAccountSnapshot: {
          id: account.id,
          collectionCurrency: input.amount.currency,
          fields: account.fields,
        },
        paymentCurrency: input.amount.currency,
        instructions: [
          `Transfer ${input.amount.minorAmount / 100n}.${(input.amount.minorAmount % 100n).toString().padStart(2, "0")} ${input.amount.currency}`,
          ...account.fields.map((field) => `${field.label}: ${field.value}`),
          `Funding reference: ${reference}`,
          "When making the transfer, enter this funding reference in your bank's narration or reference field.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    };
  }

  async verify(input: { reference: string; expectedAmount: Money }): Promise<PaymentVerification> {
    return {
      verified: false,
      status: "awaiting_manual_confirmation",
      reference: input.reference,
      amount: input.expectedAmount,
    };
  }
}
