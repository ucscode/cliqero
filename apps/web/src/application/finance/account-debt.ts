import { newId } from "@/kernel/ids";
import { Buffer } from "node:buffer";
import { PublicApplicationError } from "@/kernel/errors";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type {
  AccountDebtActor,
  AccountDebtDraft,
  AccountDebtEntry,
  AccountDebtKind,
  AccountDebtRepository,
  AccountDebtWallet,
  AccountDebtPosition,
} from "@/modules/ledger/account-debt";

type DebtCursorPayload = { v: 1; accountId: string; createdAt: string; id: string };

export class AccountDebtCursor {
  static encode(accountId: string, position: AccountDebtPosition) {
    return Buffer.from(
      JSON.stringify({
        v: 1,
        accountId,
        createdAt: position.createdAt,
        id: position.id,
      } satisfies DebtCursorPayload),
    ).toString("base64url");
  }

  static decode(value: string | undefined, accountId: string): AccountDebtPosition | undefined {
    if (value === undefined) return undefined;
    try {
      if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid cursor");
      const decoded = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      ) as Partial<DebtCursorPayload>;
      if (
        Object.keys(decoded).sort().join(",") !== "accountId,createdAt,id,v" ||
        decoded.v !== 1 ||
        decoded.accountId !== accountId ||
        typeof decoded.createdAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}Z$/.test(decoded.createdAt) ||
        !Number.isFinite(Date.parse(decoded.createdAt)) ||
        typeof decoded.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          decoded.id,
        )
      )
        throw new Error("invalid cursor");
      return { createdAt: decoded.createdAt, id: decoded.id };
    } catch {
      throw new PublicApplicationError(
        "Invalid or stale account debt cursor.",
        "invalid_cursor",
        400,
      );
    }
  }
}

export class AccountDebtService {
  constructor(
    private readonly repository: AccountDebtRepository,
    private readonly operators: OperatorAuthorizationService,
    private readonly uow: UnitOfWork,
  ) {}

  async balance(actorId: string, accountId: string) {
    await this.operators.requireCapability(actorId, "finance.read");
    return (await this.repository.balance(accountId)).toString();
  }

  /** Internal policy check used by value-out workflows; it does not expose debt to the caller. */
  async requireNoOutstanding(accountId: string, operation: "purchase" | "withdrawal" | "transfer") {
    if ((await this.repository.balance(accountId)) > 0n)
      throw new PublicApplicationError(
        `This ${operation} is unavailable while the account has outstanding debt.`,
        "account_debt_blocks_operation",
        409,
      );
  }

  async history(actorId: string, accountId: string, limit = 50, cursor?: string) {
    await this.operators.requireCapability(actorId, "finance.read");
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    const page = await this.repository.list(
      accountId,
      boundedLimit,
      AccountDebtCursor.decode(cursor, accountId),
    );
    return {
      items: page.items.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        amountMinor: entry.amountMinor.toString(),
        wallet: entry.wallet,
        source: { kind: entry.sourceKind, id: entry.sourceId },
        reason: entry.reason,
        actor: entry.actor,
        correlationId: entry.correlationId,
        idempotencyKey: entry.idempotencyKey,
        createdAt: entry.createdAt.toISOString(),
      })),
      nextCursor:
        page.hasMore && page.items.length
          ? AccountDebtCursor.encode(accountId, page.nextPosition!)
          : null,
    };
  }

  /** Records the part of an incoming credit that must satisfy account debt first. */
  settleInflow(input: {
    accountId: string;
    incomingMinor: bigint;
    wallet: Exclude<AccountDebtWallet, "account">;
    sourceKind: string;
    sourceId: string;
    reason: string;
    actor: AccountDebtActor;
    correlationId: string;
    idempotencyKey: string;
  }) {
    return this.record({ ...input, kind: "settlement", capByOutstanding: true });
  }

  /** Records unrecovered exposure after the owning recovery workflow has reclaimed available value. */
  increase(input: {
    accountId: string;
    amountMinor: bigint;
    wallet: AccountDebtWallet;
    sourceKind: string;
    sourceId: string;
    reason: string;
    actor: AccountDebtActor;
    correlationId: string;
    idempotencyKey: string;
  }) {
    const { amountMinor, ...details } = input;
    return this.record({ ...details, incomingMinor: amountMinor, kind: "increase" });
  }

  async writeOff(
    actorId: string,
    input: {
      accountId: string;
      amountMinor: bigint;
      sourceKind: string;
      sourceId: string;
      reason: string;
      correlationId: string;
      idempotencyKey: string;
    },
  ) {
    await this.operators.requireCapability(actorId, "system.root");
    const { amountMinor, ...details } = input;
    return this.record({
      ...details,
      incomingMinor: amountMinor,
      kind: "write_off",
      wallet: "account",
      actor: { kind: "operator", id: actorId },
      capByOutstanding: false,
    });
  }

  private async record(input: {
    accountId: string;
    incomingMinor: bigint;
    wallet: AccountDebtWallet;
    sourceKind: string;
    sourceId: string;
    reason: string;
    actor: AccountDebtActor;
    correlationId: string;
    idempotencyKey: string;
    kind: AccountDebtKind;
    capByOutstanding?: boolean;
  }): Promise<{ entry: AccountDebtEntry | null; changed: boolean; settledMinor: bigint }> {
    const reason = input.reason.trim();
    const sourceKind = input.sourceKind.trim();
    const sourceId = input.sourceId.trim();
    const key = input.idempotencyKey.trim();
    if (input.incomingMinor <= 0n)
      throw new PublicApplicationError("Amount must be positive.", "invalid_amount", 400);
    if (
      !reason ||
      reason.length > 1000 ||
      !sourceKind ||
      sourceKind.length > 100 ||
      !sourceId ||
      sourceId.length > 200
    )
      throw new PublicApplicationError(
        "A reason and source reference are required.",
        "invalid_debt_entry",
        400,
      );
    if (!key || key.length > 200 || !input.correlationId.trim())
      throw new PublicApplicationError(
        "A valid idempotency key and correlation ID are required.",
        "invalid_idempotency_key",
        400,
      );

    return this.uow.transaction(async () => {
      await this.repository.lockAccount(input.accountId);
      const requestFingerprint = JSON.stringify([
        input.accountId,
        input.kind,
        input.incomingMinor.toString(),
        input.wallet,
        sourceKind,
        sourceId,
        reason,
        input.actor.kind,
        input.actor.id,
        input.correlationId,
      ]);
      const previous = await this.repository.findByIdempotencyKey(key);
      if (previous) {
        if (previous.requestFingerprint !== requestFingerprint)
          throw new PublicApplicationError(
            "Idempotency key was used for a different debt operation.",
            "idempotency_conflict",
            409,
          );
        const entry = { ...previous };
        Reflect.deleteProperty(entry, "requestFingerprint");
        return {
          entry: entry as AccountDebtEntry,
          changed: false,
          settledMinor: previous.amountMinor,
        };
      }
      const outstanding = await this.repository.balance(input.accountId);
      const amount = input.capByOutstanding
        ? input.incomingMinor < outstanding
          ? input.incomingMinor
          : outstanding
        : input.incomingMinor;
      if (amount === 0n) return { entry: null, changed: false, settledMinor: 0n };
      if (input.kind !== "increase" && amount > outstanding)
        throw new PublicApplicationError(
          "Amount exceeds outstanding account debt.",
          "debt_amount_exceeds_balance",
          409,
        );
      const draft: AccountDebtDraft = {
        id: newId(),
        accountId: input.accountId,
        kind: input.kind,
        amountMinor: amount,
        wallet: input.wallet,
        sourceKind,
        sourceId,
        reason,
        actor: input.actor,
        correlationId: input.correlationId,
        idempotencyKey: key,
        requestFingerprint,
      };
      const entry = await this.repository.append(draft);
      return { entry, changed: true, settledMinor: amount };
    });
  }
}
