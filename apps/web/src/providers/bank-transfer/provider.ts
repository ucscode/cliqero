import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import type {
  PaymentInitialization,
  PaymentProvider,
  PaymentVerification,
} from "@/modules/payment/payment";

export interface BankTransferConfiguration {
  accounts: readonly BankTransferAccount[];
}

export interface BankTransferField {
  key: string;
  label: string;
  value: string;
}

export interface BankTransferAccount {
  id: string;
  fields: readonly BankTransferField[];
  filters: { countries: string[] | null; currencies: string[] | null };
}

/** Manual bank transfer funding. Confirmation is deliberately never inferred from submission. */
export class BankTransferProvider implements PaymentProvider {
  readonly name = "bank_transfer";
  readonly collectionCurrencies: readonly string[];

  constructor(private readonly config: BankTransferConfiguration) {
    this.collectionCurrencies = [
      ...new Set(config.accounts.flatMap((account) => account.filters?.currencies ?? ["USD"])),
    ];
  }

  eligibleAccounts(input: { country?: string | null; currency: string }) {
    const country = input.country?.toUpperCase() ?? null;
    const currency = input.currency.toUpperCase();
    return this.config.accounts.filter((account) => {
      const filters = account.filters;
      return (
        (!filters?.countries || (country !== null && filters.countries.includes(country))) &&
        (!filters?.currencies || filters.currencies.includes(currency))
      );
    });
  }

  isEligible(input: { country: string | null; currency: string }) {
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
  }): Promise<PaymentInitialization> {
    const account = this.eligibleAccounts({
      country: input.country,
      currency: input.amount.currency,
    })[0];
    if (!account) throw new Error("No eligible bank-transfer account is configured");
    const reference = this.referenceFor(input);
    return {
      reference,
      metadata: {
        providerAccountId: account.id,
        paymentCurrency: input.amount.currency,
        instructions: [
          `Transfer ${input.amount.minorAmount / 100n}.${(input.amount.minorAmount % 100n).toString().padStart(2, "0")} ${input.amount.currency}`,
          ...account.fields.map((field) => `${field.label}: ${field.value}`),
          `Use reference: ${reference}`,
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
