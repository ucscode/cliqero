import { newId } from "@/kernel/ids";
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
}
export class TreasuryService {
  constructor(private repo: TreasuryRepository) {}
  async createManual(input: {
    direction: TreasuryDirection;
    amountMinor: bigint;
    title: string;
    note?: string | null;
    actorId: string;
    idempotencyKey: string;
  }) {
    if (input.amountMinor <= 0n) throw new Error("Treasury amount must be positive");
    const title = input.title.trim();
    if (!title) throw new Error("Treasury title is required");
    const note = input.note?.trim() || null;
    const draft = {
      id: newId(),
      direction: input.direction,
      amountMinor: input.amountMinor,
      title,
      note,
      sourceKind: null,
      sourceId: null,
      idempotencyKey: input.idempotencyKey,
      actorId: input.actorId,
      createdAt: new Date(),
    };
    const entry = await this.repo.create(draft);
    if (
      entry.direction !== draft.direction ||
      entry.amountMinor !== draft.amountMinor ||
      entry.title !== draft.title ||
      entry.note !== draft.note ||
      entry.actorId !== draft.actorId ||
      entry.sourceKind !== null ||
      entry.sourceId !== null
    )
      throw new Error("Treasury idempotency key already used for a different entry");
    return entry;
  }
}
