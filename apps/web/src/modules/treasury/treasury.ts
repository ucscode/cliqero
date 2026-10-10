import { newId } from "@/kernel/ids";
import { PublicApplicationError } from "@/kernel/errors";
export type TreasuryDirection = "credit" | "debit";
export type TreasuryActorKind = "customer" | "operator" | "system";
export interface TreasuryEntry {
  id: string;
  direction: TreasuryDirection;
  amountMinor: bigint;
  title: string;
  note: string | null;
  sourceKind: string | null;
  sourceId: string | null;
  idempotencyKey: string;
  actorId: string | null;
  actorKind: TreasuryActorKind | null;
  correlationId: string | null;
  createdAt: Date;
}
export type TreasuryEntryDraft = Omit<
  TreasuryEntry,
  "correlationId" | "actorKind" | "sourceKind" | "sourceId"
> & {
  sourceKind: string;
  sourceId: string;
  correlationId: string;
  actorKind: TreasuryActorKind;
};

export interface TreasuryAdjustmentResult {
  entry: TreasuryEntry;
  created: boolean;
}
export interface TreasuryRepository {
  create(entry: TreasuryEntryDraft): Promise<TreasuryEntry>;
  findById(id: string): Promise<TreasuryEntry | null>;
  findByIdempotencyKey(key: string): Promise<TreasuryEntry | null>;
  sumBySource(input: {
    sourceKind: string;
    sourceId: string;
    direction: TreasuryDirection;
  }): Promise<bigint>;
  list(input: {
    cursor?: string;
    limit: number;
    direction?: TreasuryDirection;
  }): Promise<{ items: readonly TreasuryEntry[]; nextCursor: string | null }>;
  summary(): Promise<{ creditsMinor: bigint; debitsMinor: bigint; balanceMinor: bigint }>;
  createAdjustment(input: {
    id: string;
    amountMinor: bigint;
    reason: string;
    reference: string | null;
    actorId: string;
    idempotencyKey: string;
    correlationId?: string | null;
    createdAt: Date;
  }): Promise<TreasuryAdjustmentResult>;
}
export class TreasuryService {
  constructor(
    private repo: TreasuryRepository,
    private uow?: { transaction<T>(fn: () => Promise<T>): Promise<T> },
    private audit?: {
      record(input: {
        actorId: string;
        correlationId: string;
        action: string;
        subjectType: string;
        subjectId: string;
        previousState: object | null;
        newState: object;
      }): Promise<void>;
    },
  ) {}
  async createAdjustment(input: {
    amountMinor: bigint;
    reason: string;
    reference?: string | null;
    actorId: string;
    idempotencyKey: string;
    correlationId?: string | null;
  }) {
    if (input.amountMinor === 0n)
      throw new PublicApplicationError(
        "Treasury adjustment amount must be non-zero.",
        "invalid_adjustment",
        400,
      );
    const reason = input.reason.trim();
    if (!reason)
      throw new PublicApplicationError(
        "Treasury adjustment reason is required.",
        "reason_required",
        400,
      );
    const create = async () => {
      const result = await this.repo.createAdjustment({
        id: newId(),
        amountMinor: input.amountMinor,
        reason,
        reference: input.reference?.trim() || null,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId ?? null,
        createdAt: new Date(),
      });
      if (result.created)
        await this.audit?.record({
          actorId: input.actorId,
          correlationId: result.entry.correlationId!,
          action: "treasury.adjustment.created",
          subjectType: "treasury_entry",
          subjectId: result.entry.id,
          previousState: null,
          newState: {
            sourceId: result.entry.sourceId,
            sourceKind: result.entry.sourceKind,
            direction: result.entry.direction,
            amountMinor: result.entry.amountMinor.toString(),
            reason,
            reference: input.reference?.trim() || null,
          },
        });
      return result.entry;
    };
    return this.uow ? this.uow.transaction(create) : create();
  }
}
