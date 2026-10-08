import { describe, expect, it } from "vitest";
import { EarningsCorrectionService } from "@/application/finance/earnings-corrections";
import type { AuditRecorder } from "@/application/shared/audit";
import type { AccountDebtService } from "@/application/finance/account-debt";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type {
  CorrectableEarningSource,
  EarningsCorrectionRepository,
} from "@/modules/ledger/earnings-corrections";

describe("EarningsCorrectionService lock ordering", () => {
  it("locks the earning source before the shared account lock used by settlement", async () => {
    const source: CorrectableEarningSource = {
      id: "source-1",
      accountId: "account-1",
      purchaseId: "purchase-1",
      distributionId: "distribution-1",
      amountMinor: 100n,
      remainingMinor: 100n,
      balanceState: "available",
      maturityAt: null,
      recipientRole: "seller",
      referralLevel: null,
      settled: true,
      reversed: false,
    };
    const events: string[] = [];
    const repository: EarningsCorrectionRepository = {
      findSource: async () => source,
      lockPurchase: async () => {
        events.push("purchase");
        return true;
      },
      lockSource: async () => {
        events.push("source");
        return source;
      },
      lockAccount: async () => {
        events.push("account");
      },
      lockIdempotencyKey: async () => {
        events.push("idempotency");
      },
      findByIdempotencyKey: async () => null,
      availableEarnings: async () => 100n,
      create: async () => {
        events.push("create");
        return {
          id: "correction-1",
          accountId: "account-1",
          accountUsername: "seller",
          sourceEntryId: "source-1",
          purchaseId: "purchase-1",
          distributionId: "distribution-1",
          amountMinor: "50",
          pendingMinor: "0",
          availableMinor: "50",
          debtMinor: "0",
          reason: "Correction",
          createdBy: "operator-1",
          createdByUsername: "operator",
          correlationId: "correction-1",
          idempotencyKey: "key-1",
          createdAt: new Date().toISOString(),
        };
      },
      appendDebit: async () => undefined,
      list: async () => ({ items: [], nextCursor: null }),
      get: async () => null,
    };
    const service = new EarningsCorrectionService(
      repository,
      { requireCapability: async () => undefined } as unknown as OperatorAuthorizationService,
      { increase: async () => undefined } as unknown as AccountDebtService,
      { record: async () => undefined } as AuditRecorder,
      { transaction: async (operation) => operation() },
    );

    await service.create("operator-1", {
      sourceEntryId: source.id,
      amountMinor: "50",
      reason: "Correction",
      idempotencyKey: "key-1",
    });

    expect(events.slice(0, 4)).toEqual(["purchase", "source", "account", "idempotency"]);
  });
});
