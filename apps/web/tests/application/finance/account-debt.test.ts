import { describe, expect, it } from "vitest";
import { AccountDebtService } from "@/application/finance/account-debt";
import type {
  AccountDebtDraft,
  AccountDebtEntry,
  AccountDebtRepository,
} from "@/modules/ledger/account-debt";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";

class MemoryAccountDebtRepository implements AccountDebtRepository {
  readonly entries: Array<AccountDebtEntry & { requestFingerprint: string }> = [];
  async lockAccount() {}
  async balance(accountId: string) {
    return this.entries
      .filter((entry) => entry.accountId === accountId)
      .reduce(
        (sum, entry) => sum + (entry.kind === "increase" ? entry.amountMinor : -entry.amountMinor),
        0n,
      );
  }
  async findByIdempotencyKey(key: string) {
    return this.entries.find((entry) => entry.idempotencyKey === key) ?? null;
  }
  async append(entry: AccountDebtDraft) {
    if (entry.kind !== "increase" && entry.amountMinor > (await this.balance(entry.accountId)))
      throw new Error("over-settlement");
    const created = {
      ...entry,
      createdAt: new Date(),
      requestFingerprint: entry.requestFingerprint,
    };
    this.entries.push(created);
    return created;
  }
  async list(accountId: string) {
    return this.entries.filter((entry) => entry.accountId === accountId);
  }
}

function harness() {
  const repository = new MemoryAccountDebtRepository();
  const operators = {
    requireCapability: async (_accountId: string, capability: string) => {
      if (capability === "system.root") return;
    },
  } as OperatorAuthorizationService;
  const service = new AccountDebtService(repository, operators, {
    transaction: async (operation) => operation(),
  });
  const increase = (amountMinor: bigint, key = "reversal-1") =>
    service.increase({
      accountId: "account-1",
      amountMinor,
      wallet: "funding",
      sourceKind: "funding_reversal",
      sourceId: "funding-1",
      reason: "Chargeback exceeded available balance",
      actor: { kind: "system", id: "funding-reversal" },
      correlationId: "correlation-1",
      idempotencyKey: key,
    });
  return { repository, service, increase };
}

describe("AccountDebtService", () => {
  it("derives the account receivable from increases and inflow settlements", async () => {
    const { service, increase, repository } = harness();
    await increase(900n);
    const settled = await service.settleInflow({
      accountId: "account-1",
      incomingMinor: 350n,
      wallet: "earnings",
      sourceKind: "earning_entry",
      sourceId: "earning-1",
      reason: "Future earnings settle outstanding debt",
      actor: { kind: "system", id: "purchase-distribution" },
      correlationId: "correlation-2",
      idempotencyKey: "earning-settlement-1",
    });
    expect(settled.settledMinor).toBe(350n);
    expect(await repository.balance("account-1")).toBe(550n);
  });

  it("makes same-intent retries idempotent and rejects conflicting key reuse", async () => {
    const { increase, repository } = harness();
    const first = await increase(900n);
    const retry = await increase(900n);
    expect(first.changed).toBe(true);
    expect(retry.changed).toBe(false);
    expect(repository.entries).toHaveLength(1);
    await expect(increase(901n)).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("does not over-settle and limits write-offs to outstanding debt", async () => {
    const { service, increase, repository } = harness();
    await increase(200n);
    const settlement = await service.settleInflow({
      accountId: "account-1",
      incomingMinor: 500n,
      wallet: "funding",
      sourceKind: "funding_credit",
      sourceId: "credit-1",
      reason: "Funding settles debt first",
      actor: { kind: "system", id: "wallet-credit" },
      correlationId: "correlation-2",
      idempotencyKey: "credit-settlement-1",
    });
    expect(settlement.settledMinor).toBe(200n);
    expect(await repository.balance("account-1")).toBe(0n);
    await expect(
      service.writeOff("root-1", {
        accountId: "account-1",
        amountMinor: 1n,
        sourceKind: "operator_write_off",
        sourceId: "case-1",
        reason: "Test write-off",
        correlationId: "correlation-3",
        idempotencyKey: "writeoff-1",
      }),
    ).rejects.toMatchObject({ code: "debt_amount_exceeds_balance" });
    expect(repository.entries.filter((entry) => entry.kind === "write_off")).toHaveLength(0);
  });

  it("blocks new value-out operations while preserving the derived account balance", async () => {
    const { service, increase } = harness();
    await expect(service.requireNoOutstanding("account-1", "purchase")).resolves.toBeUndefined();
    await increase(12n);
    for (const operation of ["purchase", "withdrawal", "transfer"] as const)
      await expect(service.requireNoOutstanding("account-1", operation)).rejects.toMatchObject({
        code: "account_debt_blocks_operation",
        status: 409,
      });
  });
});
