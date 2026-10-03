import { newId } from "@/kernel/ids";
import { PublicApplicationError } from "@/kernel/errors";
export type TreasuryDirection = "credit" | "debit";
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
  correlationId: string | null;
  createdAt: Date;
}
export interface TreasuryRepository {
  create(entry: TreasuryEntry): Promise<TreasuryEntry>;
  findById(id: string): Promise<TreasuryEntry | null>;
  findByIdempotencyKey(key: string): Promise<TreasuryEntry | null>;
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
    correlationId: string;
    createdAt: Date;
  }): Promise<TreasuryEntry>;
}
export class TreasuryService {
  constructor(
    private repo: TreasuryRepository,
    private uow?: { transaction<T>(fn: () => Promise<T>): Promise<T> },
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
    return this.uow
      ? this.uow.transaction(() =>
          this.repo.createAdjustment({
            id: newId(),
            amountMinor: input.amountMinor,
            reason,
            reference: input.reference?.trim() || null,
            actorId: input.actorId,
            idempotencyKey: input.idempotencyKey,
            correlationId: input.correlationId ?? newId(),
            createdAt: new Date(),
          }),
        )
      : this.repo.createAdjustment({
          id: newId(),
          amountMinor: input.amountMinor,
          reason,
          reference: input.reference?.trim() || null,
          actorId: input.actorId,
          idempotencyKey: input.idempotencyKey,
          correlationId: input.correlationId ?? newId(),
          createdAt: new Date(),
        });
  }
}
