import { PublicApplicationError } from "@/kernel/errors";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { IdempotencyStore } from "@/application/checkout/contracts";
import type { AuditRecorder } from "@/application/shared/audit";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type { FundingRepository } from "@/modules/funding/funding";
import type { WalletCredit, WalletRepository } from "@/modules/wallet/wallet";

export interface FundingCreditWorkflow {
  process(fundingId: string): Promise<WalletCredit | null>;
}

export interface FundingAvailabilityWorkflow {
  process(creditId: string): Promise<boolean>;
}

type FundingCreditRepairResult = {
  fundingId: string;
  creditId: string;
  state: "available";
  applied: boolean;
};

/** Repairs a confirmed funding's missing wallet effect using the normal credit processors. */
export class FundingCreditReconciliationService {
  constructor(
    private readonly funding: FundingRepository,
    private readonly wallet: WalletRepository,
    private readonly creditProcessor: FundingCreditWorkflow,
    private readonly availabilityProcessor: FundingAvailabilityWorkflow,
    private readonly operators: OperatorAuthorizationService,
    private readonly idempotency: IdempotencyStore,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
  ) {}

  async reconcile(input: { actorId: string; fundingId: string; idempotencyKey: string }) {
    await this.operators.requireCapability(input.actorId, "finance.manage");
    const key = input.idempotencyKey.trim();
    if (!key || key.length > 200)
      throw new PublicApplicationError(
        "A valid Idempotency-Key is required.",
        "invalid_idempotency_key",
        400,
      );

    return this.uow.transaction(async () => {
      const scope = "funding-credit-reconciliation";
      if (!(await this.idempotency.begin(scope, key))) {
        const prior = await this.idempotency.findCompleted(scope, key);
        if (!prior || prior.resultReference !== input.fundingId)
          throw new PublicApplicationError(
            "Idempotency key was already used for a different or incomplete reconciliation.",
            "idempotency_conflict",
            409,
          );
        return prior.response as FundingCreditRepairResult;
      }

      const initialFunding = await this.funding.findById(input.fundingId);
      if (!initialFunding) throw new PublicApplicationError("Funding not found.", "not_found", 404);
      // Match reversal and wallet-processor lock order: account economics first,
      // then the funding row. This avoids a funding-row/account-lock cycle.
      await this.wallet.lockAccount(initialFunding.accountId);
      const funding = await this.funding.findById(input.fundingId, { forUpdate: true });
      if (!funding) throw new PublicApplicationError("Funding not found.", "not_found", 404);
      if (funding.state !== "confirmed")
        throw new PublicApplicationError(
          "Only confirmed funding can be reconciled into a wallet credit.",
          "funding_state_conflict",
          409,
        );

      const reversed = await this.wallet.reversedAmountForFunding(funding.id);
      if (reversed >= funding.canonicalAmount.minorAmount)
        throw new PublicApplicationError(
          "Fully reversed funding cannot be reconciled into a wallet credit.",
          "funding_fully_reversed",
          409,
        );

      const existing = await this.wallet.findCreditByFunding(funding.id);
      const credit = existing ?? (await this.creditProcessor.process(funding.id));
      if (!credit)
        throw new PublicApplicationError(
          "The confirmed funding credit could not be created.",
          "funding_credit_unavailable",
          409,
        );
      const availabilityChanged = await this.availabilityProcessor.process(credit.id);
      const persisted = await this.wallet.findCreditByFunding(funding.id);
      if (!persisted || persisted.state !== "available")
        throw new PublicApplicationError(
          "The funding credit is not available after reconciliation.",
          "funding_credit_unavailable",
          409,
        );

      const result: FundingCreditRepairResult = {
        fundingId: funding.id,
        creditId: persisted.id,
        state: "available",
        applied: !existing || availabilityChanged,
      };
      await this.audit.record({
        actorId: input.actorId,
        action: "funding.credit.reconciled",
        subjectType: "funding_transaction",
        subjectId: funding.id,
        previousState: existing ? { creditState: existing.state } : null,
        newState: result,
      });
      await this.idempotency.complete(scope, key, funding.id, result);
      return result;
    });
  }
}
