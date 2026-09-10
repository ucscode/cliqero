import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import type {
  PaymentInitialization,
  PaymentProvider,
  PaymentVerification,
} from "@/modules/payment/payment";

export interface BankTransferConfiguration {
  accountName: string;
  accountNumber: string;
  bankName: string;
  instructions?: string;
}

/** Manual bank transfer funding. Confirmation is deliberately never inferred from submission. */
export class BankTransferProvider implements PaymentProvider {
  readonly name = "bank_transfer";
  readonly collectionCurrencies = ["USD"] as const;

  constructor(private readonly config: BankTransferConfiguration) {}

  referenceFor(input: { paymentId: Id; idempotencyKey: string }) {
    return `bank-${input.paymentId}`;
  }

  async initiate(input: {
    paymentId: Id;
    amount: Money;
    idempotencyKey: string;
    buyerEmail: string;
  }): Promise<PaymentInitialization> {
    return {
      reference: this.referenceFor(input),
      metadata: {
        paymentCurrency: input.amount.currency,
        instructions: [
          `Transfer ${input.amount.minorAmount / 100n}.${(input.amount.minorAmount % 100n).toString().padStart(2, "0")} ${input.amount.currency}`,
          `Bank: ${this.config.bankName}`,
          `Account name: ${this.config.accountName}`,
          `Account number: ${this.config.accountNumber}`,
          `Use reference: ${this.referenceFor(input)}`,
          this.config.instructions,
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
