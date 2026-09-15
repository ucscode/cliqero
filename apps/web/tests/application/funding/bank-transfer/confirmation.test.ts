import { describe, expect, it } from "vitest";
import { BankTransferConfirmationService } from "@/application/funding/bank-transfer/confirmation";
import type { AuditRecordInput, AuditRecorder } from "@/application/shared/audit";
import type { FundingRepository, FundingTransaction } from "@/modules/funding/funding";
import { Money } from "@/modules/money/money";

const fundingId = "00000000-0000-4000-8000-000000000010";
const actorId = "00000000-0000-4000-8000-000000000001";

function transaction(
  state: FundingTransaction["state"] = "awaiting_payment",
  providerName = "bank_transfer",
): FundingTransaction {
  return {
    id: fundingId,
    accountId: actorId,
    providerName,
    providerReference: "bank-ref",
    providerTransactionId: null,
    canonicalAmount: Money.of(1000n, "USD"),
    collectionAmount: Money.of(1000n, "USD"),
    state,
    idempotencyKey: "funding-key",
    ...(state === "confirmed" ? { confirmedAt: new Date("2026-01-01T00:01:00.000Z") } : {}),
  };
}

function makeService(current: FundingTransaction) {
  const saved: FundingTransaction[] = [];
  const audits: AuditRecordInput[] = [];
  const funding = {
    findById: async () => current,
    save: async (value: FundingTransaction) => void saved.push(value),
  } as unknown as FundingRepository;
  const audit: AuditRecorder = { record: async (input) => void audits.push(input) };
  return {
    saved,
    audits,
    service: new BankTransferConfirmationService(funding, audit, {
      transaction: async (operation) => operation(),
    }),
  };
}

describe("BankTransferConfirmationService", () => {
  it("confirms eligible bank funding and audits the transition", async () => {
    const { service, saved, audits } = makeService(transaction());
    await expect(service.confirm(actorId, fundingId)).resolves.toMatchObject({
      id: fundingId,
      state: "confirmed",
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].state).toBe("confirmed");
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("funding.bank_transfer.confirmed");
  });

  it("makes repeated confirmation a no-op", async () => {
    const { service, saved, audits } = makeService(transaction("confirmed"));
    await expect(service.confirm(actorId, fundingId)).resolves.toMatchObject({
      state: "confirmed",
      confirmedAt: "2026-01-01T00:01:00.000Z",
    });
    expect(saved).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("rejects confirmation for a non-bank provider", async () => {
    const { service } = makeService(transaction("awaiting_payment", "paystack"));
    await expect(service.confirm(actorId, fundingId)).rejects.toThrow("Funding provider mismatch");
  });
});
