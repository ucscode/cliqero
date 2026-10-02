import type { BankTransferConfirmationService } from "@/application/funding/bank-transfer/confirmation";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type { WalletService } from "@/application/wallet/service";
import type { AuditRecorder } from "@/application/shared/audit";
import type { ObjectStorageRegistry } from "@/modules/storage/object-storage";
import { newId } from "@/kernel/ids";
import { PublicApplicationError } from "@/kernel/errors";

export type AdministrativeFundingState = "confirmed" | "failed" | "blocked" | "cancelled";

export interface AdministrativeFundingRepository {
  lockIdempotencyKey(idempotencyKey: string): Promise<void>;
  lockAccount(accountId: string): Promise<void>;
  create(input: {
    id: string;
    accountId: string;
    amountMinor: bigint;
    state: AdministrativeFundingState;
    reason: string;
    reference: string | null;
    idempotencyKey: string;
    actorId: string;
  }): Promise<void>;
  findByIdempotencyKey(idempotencyKey: string): Promise<{
    id: string;
    accountId: string;
    amountMinor: bigint;
    state: AdministrativeFundingState;
    reason: string;
    reference: string | null;
    createdBy: string | null;
  } | null>;
  findForUpdate(id: string): Promise<{
    id: string;
    accountId: string;
    amountMinor: bigint;
    state: AdministrativeFundingState;
    reason: string;
    reference: string | null;
  } | null>;
  update(input: {
    id: string;
    amountMinor: bigint;
    state: AdministrativeFundingState;
    reason: string;
    reference: string | null;
  }): Promise<void>;
  delete(id: string): Promise<void>;
  recordMovement(input: {
    fundingId: string;
    accountId: string;
    amountMinor: bigint;
    reason: string;
    reference: string | null;
    actorId: string;
  }): Promise<void>;
}

export type OperatorFundingState =
  | "initialization_pending"
  | "initializing"
  | "awaiting_payment"
  | "verification_pending"
  | "confirmed"
  | "failed"
  | "blocked"
  | "cancelled"
  | "expired"
  | "reconciliation_pending";

export type OperatorFundingWalletCredit = {
  id: string;
  amountMinor: string;
  currency: string;
  state: "pending" | "available";
  createdAt: string;
  availableAt: string | null;
};
export type OperatorFundingWalletEffect = {
  amountMinor: string;
  currency: string;
  state: "available" | "none";
};

export type OperatorFundingOperation = {
  id: string;
  operation: string;
  outcome: "succeeded" | "failed";
  httpStatus: number | null;
  providerStatus: boolean | null;
  providerMessage: string | null;
  providerCode: string | null;
  failureKind: string | null;
  occurredAt: string;
};

export type OperatorFundingEvent = {
  id: string;
  eventType: string;
  providerReference: string | null;
  amountMinor: string | null;
  currency: string | null;
  state: "received" | "processed" | "rejected" | "ignored";
  lastError: string | null;
  receivedAt: string;
  processedAt: string | null;
  outboxState: string | null;
  outboxLastError: string | null;
};

export type OperatorFundingSummary = {
  id: string;
  account: { id: string; username: string; email: string | null };
  origin: "provider" | "administrative";
  provider: string | null;
  providerReference: string | null;
  providerTransactionId: string | null;
  reason: string | null;
  administrativeReference: string | null;
  createdBy: string | null;
  canonicalAmountMinor: string;
  canonicalCurrency: "USD";
  collectionAmountMinor: string;
  collectionCurrency: string;
  state: OperatorFundingState;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  walletCredit: OperatorFundingWalletCredit | null;
  walletEffect: OperatorFundingWalletEffect | null;
};

export type OperatorFundingDetail = OperatorFundingSummary & {
  conversionSnapshot: {
    fromCurrency: string;
    toCurrency: string;
    rate: string;
    source: string;
    sourceDate: string;
    observedAt: string;
  } | null;
  providerInitialization: {
    authorizationUrl: string | null;
    providerAccountId?: string;
    providerAccountSnapshot?: unknown;
  } | null;
  operations: OperatorFundingOperation[];
  events: OperatorFundingEvent[];
  evidence: {
    id: string;
    transferReference: string | null;
    proof: {
      originalFilename: string | null;
      mimeType: string;
      byteSize: string;
    } | null;
    customerNote: string | null;
    createdAt: string;
  } | null;
};

export type OperatorFundingProofObject = {
  provider: string;
  container: string;
  key: string;
};

export type OperatorFundingListInput = {
  search?: string;
  state?: OperatorFundingState;
  provider?: string;
  cursor?: string;
  limit: number;
  sort?: "created" | "amount";
  direction?: "asc" | "desc";
};

export interface OperatorFundingReader {
  list(input: OperatorFundingListInput): Promise<{
    items: OperatorFundingSummary[];
    nextCursor: string | null;
  }>;
  get(id: string): Promise<OperatorFundingDetail>;
  deleteForRoot(
    id: string,
    actorId: string,
  ): Promise<{
    id: string;
    deleted: true;
    proofObjects: readonly OperatorFundingProofObject[];
  }>;
}

export class OperatorFundingService {
  constructor(
    private readonly reader: OperatorFundingReader,
    private readonly bankTransferConfirmation: BankTransferConfirmationService,
    private readonly administration?: {
      repository: AdministrativeFundingRepository;
      operators: OperatorAuthorizationService;
      wallet: Pick<WalletService, "summary">;
      uow: UnitOfWork;
      storage?: Pick<ObjectStorageRegistry, "get">;
      audit?: AuditRecorder;
    },
  ) {}

  list(input: OperatorFundingListInput) {
    return this.reader.list(input);
  }

  get(id: string) {
    return this.reader.get(id);
  }

  confirmBankTransfer(actorId: string, fundingId: string) {
    return this.bankTransferConfirmation.confirm(actorId, fundingId);
  }

  async createAdministrative(
    actorId: string,
    input: {
      accountId: string;
      amountMinor: string;
      state: AdministrativeFundingState;
      reason: string;
      reference?: string | null;
      idempotencyKey: string;
    },
  ) {
    const { repository, operators, uow } = this.requireAdministration();
    await operators.requireCapability(actorId, "finance.manage");
    const amountMinor = this.positiveMinor(input.amountMinor);
    const reason = this.requiredReason(input.reason);
    const reference = this.normalizeReference(input.reference);
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new PublicApplicationError(
        "A valid Idempotency-Key is required.",
        "invalid_idempotency_key",
        400,
      );
    return uow.transaction(async () => {
      await repository.lockIdempotencyKey(idempotencyKey);
      await repository.lockAccount(input.accountId);
      const existing = await repository.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (
          existing.accountId !== input.accountId ||
          existing.amountMinor !== amountMinor ||
          existing.state !== input.state ||
          existing.reason !== reason ||
          existing.reference !== reference
        )
          throw new PublicApplicationError(
            "Idempotency-Key was already used for a different funding request.",
            "idempotency_conflict",
            409,
          );
        return { ...existing, amountMinor: existing.amountMinor.toString() };
      }
      const id = newId();
      await repository.create({
        ...input,
        id,
        amountMinor,
        reason,
        reference,
        idempotencyKey,
        actorId,
      });
      if (input.state === "confirmed")
        await repository.recordMovement({
          fundingId: id,
          accountId: input.accountId,
          amountMinor,
          reason,
          reference,
          actorId,
        });
      return {
        id,
        accountId: input.accountId,
        amountMinor: amountMinor.toString(),
        state: input.state,
        reason,
        reference,
        createdBy: actorId,
      };
    });
  }

  async updateAdministrative(
    actorId: string,
    id: string,
    input: {
      amountMinor: string;
      state: AdministrativeFundingState;
      reason: string;
      reference?: string | null;
    },
  ) {
    const { repository, operators, wallet, uow } = this.requireAdministration();
    await operators.requireCapability(actorId, "finance.manage");
    const amountMinor = this.positiveMinor(input.amountMinor);
    const reason = this.requiredReason(input.reason);
    const reference = this.normalizeReference(input.reference);
    return uow.transaction(async () => {
      const current = await repository.findForUpdate(id);
      if (!current) throw new Error("Administrative funding not found");
      await repository.lockAccount(current.accountId);
      const currentEffective = current.state === "confirmed" ? current.amountMinor : 0n;
      const nextEffective = input.state === "confirmed" ? amountMinor : 0n;
      const delta = nextEffective - currentEffective;
      if (delta < 0n && (await wallet.summary(current.accountId)).available.minorAmount < -delta)
        throw new PublicApplicationError(
          "This funding cannot be reduced because its balance has already been consumed.",
          "funding_balance_consumed",
          409,
        );
      await repository.update({ id, amountMinor, state: input.state, reason, reference });
      if (delta !== 0n)
        await repository.recordMovement({
          fundingId: id,
          accountId: current.accountId,
          amountMinor: delta,
          reason: delta > 0n ? reason : `Funding correction: ${reason}`,
          reference,
          actorId,
        });
      return {
        ...current,
        amountMinor: amountMinor.toString(),
        state: input.state,
        reason,
        reference,
      };
    });
  }

  async deleteAdministrative(actorId: string, id: string) {
    const { repository, operators, wallet, uow } = this.requireAdministration();
    await operators.requireCapability(actorId, "finance.manage");
    return uow.transaction(async () => {
      const current = await repository.findForUpdate(id);
      if (!current) throw new Error("Administrative funding not found");
      await repository.lockAccount(current.accountId);
      if (
        current.state === "confirmed" &&
        (await wallet.summary(current.accountId)).available.minorAmount < current.amountMinor
      )
        throw new PublicApplicationError(
          "This funding cannot be deleted because its balance has already been consumed.",
          "funding_balance_consumed",
          409,
        );
      if (current.state === "confirmed")
        await repository.recordMovement({
          fundingId: id,
          accountId: current.accountId,
          amountMinor: -current.amountMinor,
          reason: `Funding deleted: ${current.reason}`,
          reference: current.reference,
          actorId,
        });
      await repository.delete(id);
      return { id, deleted: true };
    });
  }

  async deleteByOperator(actorId: string, id: string) {
    const { operators, uow } = this.requireAdministration();
    if (!(await operators.hasCapability(actorId, "system.root")))
      return this.deleteAdministrative(actorId, id);

    const current = await this.reader.get(id);
    if (current.origin === "administrative") return this.deleteAdministrative(actorId, id);
    await operators.requireCapability(actorId, "system.root");
    const deleted = await uow.transaction(() => this.reader.deleteForRoot(id, actorId));
    await this.cleanupProofObjects(actorId, deleted.id, deleted.proofObjects);
    return { id: deleted.id, deleted: true as const };
  }

  async bulkDeleteAdministrative(actorId: string, ids: readonly string[]) {
    await this.requireAdministration().operators.requireCapability(actorId, "finance.manage");
    const results = [];
    for (const id of [...new Set(ids)]) {
      try {
        await this.deleteAdministrative(actorId, id);
        results.push({ id, deleted: true, error: null });
      } catch (error) {
        results.push({
          id,
          deleted: false,
          error: error instanceof Error ? error.message : "Funding could not be deleted.",
        });
      }
    }
    return { results };
  }

  async bulkDeleteByOperator(actorId: string, ids: readonly string[]) {
    const { operators } = this.requireAdministration();
    if (!(await operators.hasCapability(actorId, "system.root")))
      return this.bulkDeleteAdministrative(actorId, ids);

    const results = [];
    for (const id of [...new Set(ids)]) {
      try {
        await this.deleteByOperator(actorId, id);
        results.push({ id, deleted: true, error: null });
      } catch (error) {
        results.push({
          id,
          deleted: false,
          error: error instanceof Error ? error.message : "Funding could not be deleted.",
        });
      }
    }
    return { results };
  }

  private requireAdministration() {
    if (!this.administration) throw new Error("Funding administration is unavailable");
    return this.administration;
  }

  private async cleanupProofObjects(
    actorId: string,
    fundingId: string,
    proofObjects: readonly OperatorFundingProofObject[],
  ) {
    const { storage, audit } = this.requireAdministration();
    if (!storage) return;
    for (const proof of proofObjects) {
      try {
        await storage.get(proof.provider).delete(proof);
      } catch {
        if (!audit) {
          console.error("funding.root_delete.storage_cleanup_unrecorded", {
            funding_id: fundingId,
            storage_provider: proof.provider,
          });
          continue;
        }
        try {
          await audit.record({
            actorId,
            action: "funding.root_delete.storage_cleanup_failed",
            subjectType: "funding_transaction",
            subjectId: fundingId,
            previousState: { storage: proof },
            newState: { cleanup: "pending_retry" },
          });
        } catch {
          console.error("funding.root_delete.storage_cleanup_unrecorded", {
            funding_id: fundingId,
            storage_provider: proof.provider,
          });
        }
      }
    }
  }

  private positiveMinor(value: string) {
    if (!/^\d+$/.test(value) || BigInt(value) <= 0n)
      throw new Error("Funding amount must be positive.");
    return BigInt(value);
  }

  private requiredReason(value: string) {
    const reason = value.trim();
    if (!reason) throw new Error("A reason is required for administrative funding.");
    return reason;
  }

  private normalizeReference(value?: string | null) {
    const reference = value?.trim() || null;
    if (reference && reference.length > 200)
      throw new Error("Reference must be 200 characters or fewer.");
    return reference;
  }
}
