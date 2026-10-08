import { newId } from "@/kernel/ids";
import { PublicApplicationError } from "@/kernel/errors";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AuditRecorder } from "@/application/shared/audit";
import type { AccountValueRecoveryService } from "@/application/finance/account-value-recovery";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type { FundingRepository } from "@/modules/funding/funding";
import type { FundingReversal, FundingReversalRepository } from "@/modules/funding/reversals";

export type NormalizedFundingReversalEvent = {
  eventId: string;
  providerName: string;
  providerReference: string;
  providerTransactionId?: string | null;
  amountMinor: string;
  currency: string;
  providerReversalReference: string | null;
  reason: string;
};

export class FundingReversalService {
  constructor(
    private readonly reversals: FundingReversalRepository,
    private readonly funding: FundingRepository,
    private readonly valueRecovery: AccountValueRecoveryService,
    private readonly operators: OperatorAuthorizationService,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
  ) {}

  async createByOperator(input: {
    actorId: string;
    fundingId: string;
    amountMinor: string;
    reason: string;
    providerReference?: string | null;
    idempotencyKey: string;
  }) {
    await this.operators.requireCapability(input.actorId, "finance.manage");
    const amount = parseAmount(input.amountMinor);
    const reason = input.reason.trim();
    const providerReference = input.providerReference?.trim() || null;
    const key = input.idempotencyKey.trim();
    if (!reason || reason.length > 1000 || (providerReference?.length ?? 0) > 200)
      throw new PublicApplicationError("Invalid funding reversal details.", "invalid_input", 400);
    if (!key || key.length > 200)
      throw new PublicApplicationError(
        "A valid Idempotency-Key is required.",
        "invalid_idempotency_key",
        400,
      );
    return this.apply({
      fundingId: input.fundingId,
      amountMinor: amount,
      reason,
      source: "operator",
      providerReference,
      providerEventId: null,
      idempotencyKey: key,
      createdBy: input.actorId,
      actorSystem: null,
    });
  }

  async applyProviderEvent(input: NormalizedFundingReversalEvent) {
    const providerName = input.providerName.trim();
    const providerReference = input.providerReference.trim();
    const reason = input.reason.trim();
    if (!providerName || !providerReference || !reason || reason.length > 1000)
      throw new PublicApplicationError(
        "Provider reversal event facts are invalid.",
        "provider_reversal_invalid",
        409,
      );
    if (!/^[1-9][0-9]*$/.test(input.amountMinor))
      throw new PublicApplicationError(
        "Provider reversal amount facts are invalid.",
        "provider_reversal_amount_invalid",
        409,
      );
    const funding =
      (await this.funding.findByProviderReference(providerName, providerReference)) ??
      (input.providerTransactionId
        ? await this.funding.findByProviderTransactionId(providerName, input.providerTransactionId)
        : null);
    if (!funding)
      throw new PublicApplicationError(
        "Provider reversal does not match a funding transaction.",
        "funding_not_found",
        404,
      );
    return this.apply({
      fundingId: funding.id,
      amountMinor: null,
      providerCollectionAmountMinor: parseProviderAmount(input.amountMinor),
      providerCollectionCurrency: input.currency,
      reason,
      source: "provider_event",
      providerReference: input.providerReversalReference,
      providerEventId: input.eventId,
      idempotencyKey: `funding-reversal:provider-event:${input.providerName}:${input.eventId}`,
      createdBy: null,
      actorSystem: providerName,
    });
  }

  private async apply(input: {
    fundingId: string;
    amountMinor: bigint | null;
    providerCollectionAmountMinor?: bigint;
    providerCollectionCurrency?: string;
    reason: string;
    source: "operator" | "provider_event";
    providerReference: string | null;
    providerEventId: string | null;
    idempotencyKey: string;
    createdBy: string | null;
    actorSystem: string | null;
  }): Promise<FundingReversal> {
    return this.uow.transaction(async () => {
      await this.reversals.lockIdempotencyKey(input.idempotencyKey);
      const prior = await this.reversals.findByIdempotencyKey(input.idempotencyKey);
      if (prior) {
        const sameProviderEvent =
          input.source === "provider_event" &&
          prior.source === "provider_event" &&
          prior.providerEventId === input.providerEventId &&
          prior.fundingId === input.fundingId &&
          prior.providerCollectionAmountMinor === input.providerCollectionAmountMinor?.toString() &&
          prior.providerCollectionCurrency === input.providerCollectionCurrency &&
          prior.reason === input.reason &&
          prior.providerReference === input.providerReference;
        const sameManualIntent =
          input.source === "operator" &&
          prior.source === "operator" &&
          prior.fundingId === input.fundingId &&
          prior.amountMinor === input.amountMinor?.toString() &&
          prior.reason === input.reason &&
          prior.providerReference === input.providerReference;
        if (!sameProviderEvent && !sameManualIntent)
          throw new PublicApplicationError(
            "Idempotency key conflicts with prior reversal intent.",
            "idempotency_conflict",
            409,
          );
        return prior;
      }
      const funding = await this.funding.findById(input.fundingId);
      if (!funding) {
        const origin = await this.funding.findOriginById(input.fundingId);
        if (origin === "administrative")
          throw new PublicApplicationError(
            "Funding reversals require provider-origin funding.",
            "provider_funding_required",
            409,
          );
        throw new PublicApplicationError("Funding not found.", "not_found", 404);
      }
      const locked = await this.reversals.lockForReversal(funding.id, funding.accountId);
      if (locked.state === "missing")
        throw new PublicApplicationError("Funding not found.", "not_found", 404);
      if (!locked.providerOrigin)
        throw new PublicApplicationError(
          "Funding reversals require provider-origin funding.",
          "provider_funding_required",
          409,
        );
      if (locked.state !== "confirmed")
        throw new PublicApplicationError(
          "Only confirmed provider funding can be reversed.",
          "funding_state_conflict",
          409,
        );
      const remaining = await this.reversals.remaining(funding.id);
      let amountMinor = input.amountMinor;
      if (input.source === "provider_event") {
        if (
          input.providerCollectionCurrency !== locked.collectionCurrency ||
          input.providerCollectionAmountMinor === undefined
        )
          throw new PublicApplicationError(
            "Provider reversal currency does not match persisted funding facts.",
            "provider_reversal_amount_invalid",
            409,
          );
        const previousCollection = await this.reversals.providerRefundedCollection(
          funding.id,
          locked.collectionCurrency,
        );
        const nextCollection = previousCollection + input.providerCollectionAmountMinor;
        if (nextCollection > locked.collectionAmountMinor)
          throw new PublicApplicationError(
            "Cumulative provider refunds exceed the original collection amount.",
            "funding_reversal_exceeds_remaining",
            409,
          );
        const priorCanonical = canonicalFromCollection(
          previousCollection,
          locked.collectionAmountMinor,
          locked.fundingAmountMinor,
        );
        const nextCanonical = canonicalFromCollection(
          nextCollection,
          locked.collectionAmountMinor,
          locked.fundingAmountMinor,
        );
        const providerDelta = nextCanonical - priorCanonical;
        amountMinor = min(providerDelta, remaining);
      }
      if (
        amountMinor === null ||
        amountMinor < 0n ||
        amountMinor > remaining ||
        (input.source === "operator" && amountMinor === 0n)
      )
        throw new PublicApplicationError(
          "Reversal exceeds the remaining reversible amount.",
          "funding_reversal_exceeds_remaining",
          409,
        );
      let remainingToAllocate = amountMinor;
      const pendingCreditMinor =
        locked.creditState === "pending"
          ? min(remainingToAllocate, locked.creditAmountMinor)
          : locked.creditState === null
            ? min(remainingToAllocate, remaining)
            : 0n;
      if (pendingCreditMinor > 0n) {
        remainingToAllocate -= pendingCreditMinor;
        if (locked.creditState === "pending")
          await this.reversals.reducePendingCredit(
            funding.id,
            locked.creditAmountMinor - pendingCreditMinor,
          );
      }
      const id = newId();
      const correlationId = newId();
      const availableRecovery = await this.valueRecovery.recover({
        accountId: funding.accountId,
        amountMinor: remainingToAllocate,
        sourceId: id,
        reason: input.reason,
        actor: input.createdBy
          ? { kind: "account", id: input.createdBy }
          : { kind: "system", id: input.actorSystem! },
        correlationId,
      });
      const reversal = await this.reversals.create({
        id,
        fundingId: funding.id,
        accountId: funding.accountId,
        amountMinor: amountMinor.toString(),
        currency: "USD",
        providerCollectionAmountMinor: input.providerCollectionAmountMinor?.toString() ?? null,
        providerCollectionCurrency: input.providerCollectionCurrency ?? null,
        source: input.source,
        reason: input.reason,
        providerReference: input.providerReference,
        providerEventId: input.providerEventId,
        idempotencyKey: input.idempotencyKey,
        correlationId,
        createdBy: input.createdBy,
        actorSystem: input.actorSystem,
        recovery: {
          pendingCreditMinor: pendingCreditMinor.toString(),
          fundingWalletMinor: availableRecovery.fundingWalletMinor.toString(),
          earningsWalletMinor: availableRecovery.earningsWalletMinor.toString(),
          debtMinor: availableRecovery.debtMinor.toString(),
        },
      });
      if (input.createdBy)
        await this.audit.record({
          actorId: input.createdBy,
          action: "funding.reversal.created",
          subjectType: "funding_reversal",
          subjectId: reversal.id,
          previousState: null,
          newState: reversal,
        });
      return reversal;
    });
  }

  get(id: string) {
    return this.reversals.findById(id);
  }
  list(input: Parameters<FundingReversalRepository["list"]>[0]) {
    return this.reversals.list(input);
  }
  summary(fundingId: string) {
    return this.reversals.summary(fundingId);
  }
}

function parseAmount(value: string) {
  if (!/^[1-9][0-9]{0,29}$/.test(value))
    throw new PublicApplicationError(
      "amount_minor must be a positive USD minor-unit integer.",
      "invalid_amount",
      400,
    );
  return BigInt(value);
}
function parseProviderAmount(value: string) {
  if (!/^[1-9][0-9]{0,29}$/.test(value))
    throw new PublicApplicationError(
      "Provider reversal amount facts are invalid.",
      "provider_reversal_amount_invalid",
      409,
    );
  const amount = BigInt(value);
  if (amount > 9_223_372_036_854_775_807n)
    throw new PublicApplicationError(
      "Provider reversal amount facts exceed the supported integer range.",
      "provider_reversal_amount_invalid",
      409,
    );
  return amount;
}
function min(a: bigint, b: bigint) {
  return a < b ? a : b;
}
function canonicalFromCollection(collectionRefund: bigint, collection: bigint, canonical: bigint) {
  if (collection <= 0n)
    throw new PublicApplicationError(
      "Provider reversal cannot be converted safely from persisted funding facts.",
      "provider_reversal_conversion_unsafe",
      409,
    );
  if (collectionRefund === collection) return canonical;
  return (collectionRefund * canonical + collection / 2n) / collection;
}
