import { describe, expect, it, vi } from "vitest";
import { TreasuryProcessor } from "@/processors/treasury/processor";
import type { TreasuryEntry, TreasuryRepository } from "@/modules/treasury/treasury";

describe("Treasury distribution projection", () => {
  it("uses the persisted distribution correlation and system attribution", async () => {
    const create = vi.fn(async (entry: Parameters<TreasuryRepository["create"]>[0]) => entry);
    const findByIdempotencyKey = vi.fn(async () => null);
    const processor = new TreasuryProcessor(
      {
        findWork: async () => [],
        findAmount: async () => ({
          id: "distribution-id",
          amountMinor: "250",
          correlationId: "purchase-operation-correlation",
        }),
      },
      { create, findByIdempotencyKey } as unknown as TreasuryRepository,
    );

    await processor.process("distribution-id");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKind: "distribution",
        sourceId: "distribution-id",
        actorId: null,
        actorKind: "system",
        correlationId: "purchase-operation-correlation",
      }),
    );
  });

  it("refuses to infer correlation for historical distributions without one", async () => {
    const create = vi.fn();
    const findByIdempotencyKey = vi.fn(async () => null);
    const processor = new TreasuryProcessor(
      {
        findWork: async () => [],
        findAmount: async () => ({
          id: "legacy-distribution",
          amountMinor: "250",
          correlationId: null,
        }),
      },
      { create, findByIdempotencyKey } as unknown as TreasuryRepository,
    );

    await expect(processor.process("legacy-distribution")).rejects.toThrow(
      "correlation ID; Treasury attribution cannot be inferred safely",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps historical retries idempotent when an entry already exists", async () => {
    const existing: TreasuryEntry = {
      id: "existing-entry",
      direction: "credit",
      amountMinor: 250n,
      title: "Platform allocation",
      note: null,
      sourceKind: "distribution",
      sourceId: "legacy-distribution",
      idempotencyKey: "treasury:distribution:legacy-distribution:platform",
      actorId: null,
      actorKind: null,
      correlationId: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    const create = vi.fn();
    const findByIdempotencyKey = vi.fn(async () => existing);
    const processor = new TreasuryProcessor(
      {
        findWork: async () => [],
        findAmount: async () => ({
          id: "legacy-distribution",
          amountMinor: "250",
          correlationId: null,
        }),
      },
      { create, findByIdempotencyKey } as unknown as TreasuryRepository,
    );

    await expect(processor.process("legacy-distribution")).resolves.toBe(existing);
    expect(create).not.toHaveBeenCalled();
  });
});
