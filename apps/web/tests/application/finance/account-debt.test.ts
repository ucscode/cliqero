import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { AccountDebtService } from "@/application/finance/account-debt";
import type {
  AccountDebtDraft,
  AccountDebtEntry,
  AccountDebtRepository,
  AccountDebtPosition,
} from "@/modules/ledger/account-debt";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";

class MemoryAccountDebtRepository implements AccountDebtRepository {
  readonly entries: Array<AccountDebtEntry & { requestFingerprint: string }> = [];
  readonly operations: string[] = [];
  async lockAccount() {
    this.operations.push("lock");
  }
  async balance(accountId: string) {
    this.operations.push("balance");
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
  async list(accountId: string, limit: number, cursor?: AccountDebtPosition) {
    const ordered = this.entries
      .filter((entry) => entry.accountId === accountId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .filter(
        (entry) =>
          !cursor ||
          entry.createdAt.toISOString() < cursor.createdAt ||
          (entry.createdAt.toISOString() === cursor.createdAt && entry.id < cursor.id),
      );
    const page = ordered.slice(0, limit + 1);
    return {
      items: page.slice(0, limit),
      hasMore: page.length > limit,
      nextPosition:
        page.length > limit && page.length
          ? { createdAt: page[limit - 1]!.createdAt.toISOString(), id: page[limit - 1]!.id }
          : null,
    };
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

  it("attributes debt write-offs to the authorized operator", async () => {
    const { service, increase, repository } = harness();
    await increase(200n);

    const result = await service.writeOff("root-1", {
      accountId: "account-1",
      amountMinor: 200n,
      sourceKind: "operator_write_off",
      sourceId: "case-2",
      reason: "Approved unrecoverable balance write-off",
      correlationId: "correlation-write-off",
      idempotencyKey: "writeoff-2",
    });

    expect(result.entry?.actor).toEqual({ kind: "operator", id: "root-1" });
    expect(repository.entries.at(-1)?.actor).toEqual({ kind: "operator", id: "root-1" });
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

  it("serializes debt checks with account debt writes", async () => {
    const { service, increase, repository } = harness();
    await increase(1n);
    repository.operations.length = 0;
    await expect(
      service.requireNoOutstandingUnderLock("account-1", "withdrawal"),
    ).rejects.toMatchObject({ code: "account_debt_blocks_operation", status: 409 });
    expect(repository.operations.slice(0, 2)).toEqual(["lock", "balance"]);
  });

  it("uses account-bound versioned opaque cursors with deterministic pages", async () => {
    const { service, increase } = harness();
    for (let i = 0; i < 5; i++) await increase(BigInt(i + 1), `page-${i}`);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.history("actor", "account-1", 2, cursor);
      seen.push(...page.items.map((entry) => entry.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    const first = await service.history("actor", "account-1", 2);
    expect(first.nextCursor).toBeTruthy();
    const payload = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString("utf8"));
    expect(payload).toMatchObject({ v: 1, accountId: "account-1" });
    expect(first.nextCursor).not.toMatch(/^\d+$/);
    await expect(service.history("actor", "account-2", 2, first.nextCursor!)).rejects.toMatchObject(
      {
        code: "invalid_cursor",
        status: 400,
      },
    );
    await expect(service.history("actor", "account-1", 2, "not-a-cursor")).rejects.toMatchObject({
      code: "invalid_cursor",
      status: 400,
    });
    payload.v = 2;
    const stale = Buffer.from(JSON.stringify(payload)).toString("base64url");
    await expect(service.history("actor", "account-1", 2, stale)).rejects.toMatchObject({
      code: "invalid_cursor",
      status: 400,
    });
  });
});
