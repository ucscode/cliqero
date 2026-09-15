import type { FundingRepository } from "@/modules/funding/funding";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AuditRecorder } from "@/application/shared/audit";

export class BankTransferConfirmationService {
  constructor(
    private readonly funding: FundingRepository,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
  ) {}

  async confirm(actorId: string, fundingId: string) {
    return this.uow.transaction(async () => {
      const current = await this.funding.findById(fundingId, { forUpdate: true });
      if (!current) throw new Error("Funding not found");
      if (current.providerName !== "bank_transfer") throw new Error("Funding provider mismatch");
      if (current.state === "confirmed")
        return {
          id: current.id,
          state: current.state,
          confirmedAt: current.confirmedAt?.toISOString() ?? null,
        };
      if (current.state !== "awaiting_payment" && current.state !== "verification_pending")
        throw new Error("Funding is not awaiting manual confirmation");

      const confirmedAt = new Date();
      await this.funding.save({ ...current, state: "confirmed", confirmedAt });
      await this.audit.record({
        actorId,
        action: "funding.bank_transfer.confirmed",
        subjectType: "funding_transaction",
        subjectId: fundingId,
        previousState: {
          provider: current.providerName,
          providerReference: current.providerReference,
          state: current.state,
        },
        newState: {
          provider: current.providerName,
          providerReference: current.providerReference,
          amountMinor: current.collectionAmount.minorAmount.toString(),
          currency: current.collectionAmount.currency,
          state: "confirmed",
        },
      });
      return { id: current.id, state: "confirmed" as const, confirmedAt: confirmedAt.toISOString() };
    });
  }
}
