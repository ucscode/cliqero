export type EarningsAdjustment = {
  id: string;
  accountId: string;
  accountUsername: string;
  amountMinor: string;
  reason: string;
  reference: string | null;
  createdBy: string;
  createdAt: string;
};

export interface EarningsAdjustmentRepository {
  lockIdempotencyKey(idempotencyKey: string): Promise<void>;
  findByIdempotencyKey(idempotencyKey: string): Promise<EarningsAdjustment | null>;
  create(input: {
    accountId: string;
    amountMinor: bigint;
    reason: string;
    reference: string | null;
    actorId: string;
    idempotencyKey: string;
    correlationId?: string | null;
  }): Promise<EarningsAdjustment>;
  list(input: { search?: string; cursor?: string; limit: number }): Promise<{
    items: EarningsAdjustment[];
    nextCursor: string | null;
  }>;
  get(id: string): Promise<EarningsAdjustment | null>;
  deleteForRoot(id: string, actorId: string): Promise<boolean>;
}
