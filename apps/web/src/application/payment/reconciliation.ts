import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type { PaymentRecord, PaymentRepository } from "@/modules/payment";
import { PublicApplicationError } from "@/kernel/errors";
import type { ReconciliationAttempt, ReconciliationOperations } from "./reconciliation-contracts";

export interface ReconciliationPaymentRepository extends PaymentRepository {
  findPendingByProviderOlderThan(
    provider: string | undefined,
    olderThan: Date,
    limit: number,
  ): Promise<readonly PaymentRecord[]>;
}

export interface PaymentVerificationUseCase {
  process(paymentId: string): Promise<unknown>;
}

/** Reconciles a persisted payment through its registered provider adapter. */
export class PaymentReconciliationService {
  constructor(
    private readonly payments: ReconciliationPaymentRepository,
    private readonly verification: PaymentVerificationUseCase,
    private readonly operations: ReconciliationOperations,
    private readonly operators: OperatorAuthorizationService,
  ) {}

  async reconcile(input: {
    actorId: string;
    paymentId: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<ReconciliationAttempt> {
    await this.operators.requireCapability(input.actorId, "finance.manage");
    const payment = await this.payments.findById(input.paymentId);
    if (!payment) throw new PublicApplicationError("Payment not found.", "not_found", 404);
    const begun = await this.operations.begin(input);
    if (!begun.created) return begun.attempt;
    if (payment.state === "verified") {
      await this.operations.finish(begun.attempt.id, "skipped", { reason: "already-completed" });
      return { ...begun.attempt, state: "skipped", result: { reason: "already-completed" } };
    }
    try {
      payment.state = "verification_pending";
      await this.payments.save(payment);
      await this.verification.process(payment.id);
      const verified = await this.payments.findById(payment.id);
      if (verified?.state !== "verified") throw new Error("Payment verification mismatch");
      await this.operations.finish(begun.attempt.id, "completed", { paymentState: "verified" });
      return { ...begun.attempt, state: "completed", result: { paymentState: "verified" } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reconciliation failed";
      const mismatch = /mismatch/i.test(message);
      await this.operations.finish(
        begun.attempt.id,
        mismatch ? "mismatch" : "failed",
        { completed: false },
        message,
      );
      throw error;
    }
  }

  async eligible(input: {
    actorId: string;
    olderThanMinutes: number;
    limit: number;
    provider?: string;
  }) {
    await this.operators.requireCapability(input.actorId, "finance.manage");
    return this.payments.findPendingByProviderOlderThan(
      input.provider,
      new Date(Date.now() - input.olderThanMinutes * 60_000),
      input.limit,
    );
  }
}
