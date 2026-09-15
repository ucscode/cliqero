import { createHash } from "node:crypto";
import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import { AbstractPaymentProvider } from "@/modules/payment";

export class DevelopmentPaymentProvider extends AbstractPaymentProvider {
  readonly name = "development";
  readonly environmentOnly = "development" as const;
  readonly displayName = "Development";
  readonly imageUrl = "/images/payment/development.svg";
  readonly description = "Development-only funding for local testing.";
  readonly collectionCurrencies = ["USD"] as const;

  referenceFor(input: { paymentId: Id; idempotencyKey: string }) {
    const digest = createHash("sha256")
      .update(`${input.paymentId}:${input.idempotencyKey}`)
      .digest("hex")
      .slice(0, 24);
    return `dev_${digest}`;
  }

  async initiate(input: {
    paymentId: Id;
    amount: Money;
    idempotencyKey: string;
    buyerEmail: string;
  }) {
    return { reference: this.referenceFor(input) };
  }

  async verify(input: { reference: string; expectedAmount: Money }) {
    const confirmed = input.reference.startsWith("dev_") && input.expectedAmount.minorAmount >= 0n;
    return {
      state: confirmed ? ("confirmed" as const) : ("failed" as const),
      reference: input.reference,
      amount: input.expectedAmount,
      observation: {
        status: confirmed ? ("success" as const) : ("failed" as const),
        message: confirmed ? "Payment verified successfully." : "Development payment failed.",
        level: confirmed ? ("success" as const) : ("error" as const),
      },
    };
  }
}
