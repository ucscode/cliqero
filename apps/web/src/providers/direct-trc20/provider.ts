import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import type {
  PaymentInitialization,
  PaymentProvider,
  PaymentVerification,
  PaymentVerificationObservation,
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
  readonly customerActionLabel = "Create payment";
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
    const amount = formatAmount(input.amount);
    return {
      reference,
      metadata: {
        paymentAddress: this.config.walletAddress,
        paymentAmount: amount,
        paymentCurrency: "USDT",
        asset: "USDT",
        network: "TRC20",
        instructions: `Send exactly **${amount} USDT** on **TRC20** to **${this.config.walletAddress}**.

**Submit the blockchain transaction hash after sending.**`,
      },
    } satisfies PaymentInitialization;
  }

  async verify(input: {
    reference: string;
    expectedAmount: Money;
    providerTransactionId?: string;
  }): Promise<PaymentVerification> {
    const hash = input.providerTransactionId;
    if (!hash)
      return {
        verified: false,
        status: "awaiting_transaction",
        reference: input.reference,
        amount: input.expectedAmount,
        observation: {
          status: "awaiting_transaction",
          message: "Submit the blockchain transaction hash to begin verification.",
        },
      };
    const transfer = await this.verifier.verify({
      transactionHash: hash,
      network: "TRC20",
      destination: this.config.walletAddress,
      tokenContract: this.config.tokenContract,
    });
    const expectedUnits = input.expectedAmount.minorAmount * 10_000n;
    const mismatchStatus = transfer.issue
      ? directTrc20MismatchObservation(transfer.issue, input.expectedAmount)
      : transfer.network !== "TRC20" || transfer.asset !== "USDT"
        ? {
            status: "mismatch" as const,
            message: "This transaction does not contain the required USDT transfer.",
          }
        : transfer.destination.toLowerCase() !== this.config.walletAddress.toLowerCase()
          ? {
              status: "mismatch" as const,
              message: "This transaction does not send USDT to the required payment address.",
            }
          : transfer.amountBaseUnits < expectedUnits
            ? {
                status: "mismatch" as const,
                message: `The transaction was found, but the received amount is below the required ${formatAmount(input.expectedAmount)} USDT.`,
              }
            : undefined;
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
        observation: {
          status: "failed",
          message: "This blockchain transaction failed and cannot fund your wallet.",
        },
      };
    if (mismatchStatus && transfer.status === "confirmed")
      return {
        verified: false,
        status: "mismatch",
        reference: input.reference,
        amount: input.expectedAmount,
        providerTransactionId: hash,
        observation: mismatchStatus,
      };
    if (transfer.status === "not_found")
      return {
        verified: false,
        status: "not_found",
        reference: input.reference,
        amount: input.expectedAmount,
        providerTransactionId: hash,
        observation: {
          status: "not_found",
          message:
            "Transaction not found on TRON yet. Check the transaction hash or wait a moment if it was just submitted.",
        },
      };
    if (!matches)
      return {
        verified: false,
        status: "confirming",
        reference: input.reference,
        amount: input.expectedAmount,
        providerTransactionId: hash,
        observation: {
          status: "confirming",
          message: "Transaction found. Waiting for the transfer details to finalize.",
        },
      };
    if (transfer.confirmations < this.config.confirmationsRequired)
      return {
        verified: false,
        status: "confirming",
        reference: input.reference,
        amount: input.expectedAmount,
        providerTransactionId: hash,
        observation: {
          status: "confirming",
          message: `Transaction found. Waiting for ${this.config.confirmationsRequired - transfer.confirmations} more confirmations.`,
          confirmations: transfer.confirmations,
          confirmationsRequired: this.config.confirmationsRequired,
        },
      };
    return {
      verified: success,
      status: "success",
      reference: input.reference,
      amount: input.expectedAmount,
      providerTransactionId: hash,
      observation: {
        status: "success",
        message: "Payment verified successfully.",
        confirmations: transfer.confirmations,
        confirmationsRequired: this.config.confirmationsRequired,
      },
    };
  }
}

function directTrc20MismatchObservation(
  issue: NonNullable<Awaited<ReturnType<DirectTrc20Verifier["verify"]>>["issue"]>,
  expectedAmount: Money,
): PaymentVerificationObservation {
  if (issue === "wrong_destination")
    return {
      status: "mismatch",
      message: "This transaction does not send USDT to the required payment address.",
    };
  if (issue === "wrong_token_contract")
    return {
      status: "mismatch",
      message: "This transaction does not use the required USDT token contract.",
    };
  if (issue === "missing_transfer")
    return {
      status: "mismatch",
      message: "This transaction does not contain the required USDT transfer.",
    };
  return {
    status: "mismatch",
    message: `The transaction was found, but the received amount is below the required ${formatAmount(expectedAmount)} USDT.`,
  };
}

function formatAmount(amount: Money) {
  const whole = amount.minorAmount / 100n;
  const fraction = (amount.minorAmount % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}
