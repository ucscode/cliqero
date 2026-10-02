import { describe, expect, it, vi } from "vitest";
import { FUNDING_PROOF_CLEANUP_EVENT } from "@/kernel/events";
import { FundingProofCleanupHandler } from "@/workers/outbox/handlers";

const event = {
  id: "00000000-0000-4000-8000-000000000001",
  name: FUNDING_PROOF_CLEANUP_EVENT,
  aggregateId: "00000000-0000-4000-8000-000000000010",
  correlationId: "00000000-0000-4000-8000-000000000002",
  occurredAt: new Date("2026-10-02T00:00:00.000Z"),
  attemptCount: 1,
  payload: {
    fundingId: "00000000-0000-4000-8000-000000000010",
    storageProvider: "private-proof",
    container: "evidence",
    key: "funding/receipt.png",
  },
};

describe("FundingProofCleanupHandler", () => {
  it("deletes only the persisted locator and is safe to process repeatedly", async () => {
    const remove = vi.fn(async () => undefined);
    const handler = new FundingProofCleanupHandler({
      get: vi.fn((name: string) => ({
        name,
        put: async () => ({
          provider: "private-proof",
          container: "evidence",
          key: "unused",
          byteSize: 0,
          mimeType: "application/octet-stream",
        }),
        delete: remove,
      })),
    });

    await handler.handle(event);
    await handler.handle({ ...event, attemptCount: 2 });

    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenNthCalledWith(1, {
      provider: "private-proof",
      container: "evidence",
      key: "funding/receipt.png",
    });
    expect(JSON.stringify(remove.mock.calls)).not.toContain("proofContents");
  });

  it("propagates storage failure so the outbox can retry it", async () => {
    const remove = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce(undefined);
    const handler = new FundingProofCleanupHandler({
      get: vi.fn((name: string) => ({
        name,
        put: async () => ({
          provider: "private-proof",
          container: "evidence",
          key: "unused",
          byteSize: 0,
          mimeType: "application/octet-stream",
        }),
        delete: remove,
      })),
    });

    await expect(handler.handle(event)).rejects.toThrow("storage unavailable");
    await expect(handler.handle({ ...event, attemptCount: 2 })).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
