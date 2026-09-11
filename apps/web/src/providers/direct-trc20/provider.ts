import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import type {
  PaymentInitialization,
  PaymentProvider,
  PaymentVerification,
} from "@/modules/payment/payment";
import type { DirectTrc20Verifier } from "./verifier";

export interface DirectTrc20Configuration {
  walletAddress: string;
  confirmationsRequired: number;
  tokenContract: string;
  verification: {
    provider: "trongrid";
    apiKey?: string;
    apiBaseUrl: string;
    chainId?: number;
  };
  displayName?: string;
  imageUrl?: string;
  description?: string;
}

export class DirectTrc20Provider implements PaymentProvider {
  readonly name = "usdt_trc20";
  readonly displayName: string;
  readonly imageUrl: string;
  readonly description: string;
  readonly collectionCurrencies = ["USD"] as const;
  constructor(
    private readonly config: DirectTrc20Configuration,
    private readonly verifier: DirectTrc20Verifier,
  ) {
    this.displayName = config.displayName ?? "Direct USDT TRC20";
    this.imageUrl = config.imageUrl ?? "/images/payment/usdt-trc20.svg";
    this.description = config.description ?? "Send USDT on the TRON TRC20 network directly.";
  }

  referenceFor(input: { paymentId: Id }) {
    return `usdt-${input.paymentId}`;
  }

  async initiate(input: {
    paymentId: Id;
    amount: Money;
    idempotencyKey: string;
    buyerEmail: string;
  }) {
    const reference = this.referenceFor(input);
    return {
      reference,
      metadata: {
        paymentAddress: this.config.walletAddress,
        paymentAmount: formatAmount(input.amount),
        paymentCurrency: "USDT",
        asset: "USDT",
        network: "TRC20",
        instructions: `Send exactly ${formatAmount(input.amount)} USDT on TRC20 to ${this.config.walletAddress}. Submit the blockchain transaction hash after sending.`,
      },
    } satisfies PaymentInitialization;
  }

  async verify(input: {
    reference: string;
    expectedAmount: Money;
    initialization?: any;
  }): Promise<PaymentVerification> {
    const hash = input.initialization?.transactionHash;
    if (!hash)
      return {
        verified: false,
        status: "awaiting_transaction",
        reference: input.reference,
        amount: input.expectedAmount,
      };
    const transfer = await this.verifier.verify({
      transactionHash: hash,
      network: "TRC20",
      destination: this.config.walletAddress,
      tokenContract: this.config.tokenContract,
    });
    const expectedUnits = input.expectedAmount.minorAmount * 10_000n;
    const matches =
      transfer.network === "TRC20" &&
      transfer.asset === "USDT" &&
      transfer.destination.toLowerCase() === this.config.walletAddress.toLowerCase() &&
      transfer.amountBaseUnits >= expectedUnits;
    const success =
      matches &&
      transfer.status === "confirmed" &&
      transfer.confirmations >= this.config.confirmationsRequired;
    if (transfer.status === "failed")
      return {
        verified: false,
        status: "failed",
        reference: input.reference,
        amount: input.expectedAmount,
        providerTransactionId: hash,
      };
    if (!matches && transfer.status === "confirmed")
      return {
        verified: false,
        status: "mismatch",
        reference: input.reference,
        amount: input.expectedAmount,
        providerTransactionId: hash,
      };
    return {
      verified: success,
      status: success ? "success" : transfer.status === "not_found" ? "not_found" : "confirming",
      reference: input.reference,
      amount: input.expectedAmount,
      providerTransactionId: hash,
    };
  }
}

function formatAmount(amount: Money) {
  const whole = amount.minorAmount / 100n;
  const fraction = (amount.minorAmount % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}
