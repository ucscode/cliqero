import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import { InvalidDirectTrc20TransactionError } from "./errors";
import { AbstractPaymentProvider } from "@/modules/payment";
import type {
  PaymentInitialization,
  PaymentInitializationMetadata,
  PaymentResult,
  PaymentVerificationObservation,
  ProviderRequestContext,
} from "@/modules/payment";
import { normalizeTronAddress, type DirectTrc20Verifier } from "./verifier";

export interface DirectTrc20Configuration {
  walletAddress: string;
  confirmationsRequired: number;
  maxTransactionAgeSeconds: number;
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

export class DirectTrc20Provider extends AbstractPaymentProvider {
  readonly name = "usdt_trc20";
  readonly displayName: string;
  readonly imageUrl: string;
  readonly description: string;
  readonly customerActionLabel = "Create payment";
  readonly collectionCurrencies = ["USD"] as const;
  constructor(
    private readonly config: DirectTrc20Configuration,
    private readonly verifier: DirectTrc20Verifier,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
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
        instructions: `Send exactly **${amount} USDT** on **TRC20** to **${this.config.walletAddress}**.`,
      },
    } satisfies PaymentInitialization;
  }

  async prepareFunding(input: { canonicalAmount: Money }) {
    const amount = formatAmount(input.canonicalAmount);
    return {
      collectionAmount: input.canonicalAmount,
      initializationMetadata: {
        paymentAddress: this.config.walletAddress,
        paymentAmount: amount,
        paymentCurrency: "USDT",
        asset: "USDT",
        network: "TRC20",
        instructions: `Send exactly **${amount} USDT** on **TRC20** to **${this.config.walletAddress}**.`,
      },
    };
  }

  async handleRequest(input: unknown, context: ProviderRequestContext): Promise<PaymentResult> {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new InvalidDirectTrc20TransactionError();
    const transactionId = (input as { transaction_hash?: unknown }).transaction_hash;
    if (typeof transactionId !== "string") throw new InvalidDirectTrc20TransactionError();
    const normalized = transactionId.trim();
    if (!/^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64})$/.test(normalized))
      throw new InvalidDirectTrc20TransactionError();
    return this.verify({
      reference: context.reference,
      expectedAmount: context.expectedAmount,
      providerTransactionId: normalized,
      initialization: context.initialization,
    });
  }

  async verify(input: {
    reference: string;
    expectedAmount: Money;
    providerTransactionId?: string;
    initialization?: PaymentInitializationMetadata;
  }): Promise<PaymentResult> {
    const hash = input.providerTransactionId;
    if (!hash)
      return {
        state: "pending",
        reference: input.reference,
        amount: input.expectedAmount,
        observation: {
          status: "awaiting_transaction",
          message: "Submit the blockchain transaction hash to begin verification.",
          level: "info",
        },
      };
    const transfer = await this.verifier.verify({
      transactionHash: hash,
      network: "TRC20",
      destination: this.config.walletAddress,
      tokenContract: this.config.tokenContract,
    });
    if (transfer.status === "not_found")
      return rejectedVerification(input, {
        status: "not_found",
        message:
          "Transaction not found on TRON yet. Check the transaction hash or wait a moment if it was just submitted.",
        level: "error",
      });
    if (transfer.issue)
      return rejectedVerification(
        input,
        directTrc20MismatchObservation(transfer.issue, input.expectedAmount),
      );
    if (!transfer.timestamp)
      return rejectedVerification(input, {
        status: "mismatch",
        message:
          "Transaction details are not available yet. Try again once the transfer has propagated.",
        level: "error",
      });
    if (this.clock().getTime() - transfer.timestamp > this.config.maxTransactionAgeSeconds * 1000)
      return rejectedVerification(input, {
        status: "mismatch",
        message: "This transaction is too old to fund this wallet.",
        level: "error",
      });
    if (transfer.network !== "TRC20" || transfer.asset !== "USDT")
      return rejectedVerification(input, {
        status: "mismatch",
        message: "This transaction does not contain the required USDT transfer.",
        level: "error",
      });
    if (!transfer.destination)
      return rejectedVerification(input, {
        status: "mismatch",
        message: "Transaction transfer details are not available yet. Try again shortly.",
        level: "error",
      });
    if (
      normalizeTronAddress(transfer.destination) !== normalizeTronAddress(this.config.walletAddress)
    )
      return rejectedVerification(input, {
        status: "mismatch",
        message: "This transaction does not send USDT to the required payment address.",
        level: "error",
      });
    const expectedUnits = input.expectedAmount.minorAmount * 10_000n;
    const accepted = {
      reference: input.reference,
      amount: input.expectedAmount,
      providerTransactionId: hash,
    };
    if (transfer.amountBaseUnits < expectedUnits)
      return {
        state: "failed",
        ...accepted,
        observation: {
          status: "mismatch",
          message: `The transaction was found, but the received amount is below the required ${formatAmount(input.expectedAmount)} USDT.`,
          level: "error" as const,
        },
      };
    if (transfer.status === "failed")
      return {
        state: "failed",
        ...accepted,
        observation: {
          status: "failed",
          message: "This blockchain transaction failed and cannot fund your wallet.",
          level: "error" as const,
        },
      };
    if (
      transfer.status !== "confirmed" ||
      transfer.confirmations < this.config.confirmationsRequired
    )
      return {
        state: "pending",
        ...accepted,
        observation: {
          status: "confirming",
          message:
            transfer.status !== "confirmed"
              ? "Transaction found. Waiting for the transfer to confirm."
              : `Transaction found. Waiting for ${this.config.confirmationsRequired - transfer.confirmations} more confirmations.`,
          level: "info",
          confirmations: transfer.confirmations,
          confirmationsRequired: this.config.confirmationsRequired,
        },
      };
    return {
      state: "confirmed",
      ...accepted,
      observation: {
        status: "success",
        message: "Payment verified successfully.",
        level: "success",
        confirmations: transfer.confirmations,
        confirmationsRequired: this.config.confirmationsRequired,
      },
    };
  }
}

function rejectedVerification(
  input: { reference: string; expectedAmount: Money },
  observation: PaymentVerificationObservation,
): PaymentResult {
  return {
    state:
      observation.status === "awaiting_transaction" || observation.status === "not_found"
        ? "pending"
        : "failed",
    reference: input.reference,
    amount: input.expectedAmount,
    observation,
  };
}

function directTrc20MismatchObservation(
  issue: NonNullable<Awaited<ReturnType<DirectTrc20Verifier["verify"]>>["issue"]>,
  expectedAmount: Money,
): PaymentVerificationObservation {
  if (issue === "wrong_destination")
    return {
      status: "mismatch",
      message: "This transaction does not send USDT to the required payment address.",
      level: "error",
    };
  if (issue === "wrong_token_contract")
    return {
      status: "mismatch",
      message: "This transaction does not use the required USDT token contract.",
      level: "error",
    };
  if (issue === "missing_transfer")
    return {
      status: "mismatch",
      message: "This transaction does not contain the required USDT transfer.",
      level: "error",
    };
  return {
    status: "mismatch",
    message: `The transaction was found, but the received amount is below the required ${formatAmount(expectedAmount)} USDT.`,
    level: "error",
  };
}

function formatAmount(amount: Money) {
  const whole = amount.minorAmount / 100n;
  const fraction = (amount.minorAmount % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}
