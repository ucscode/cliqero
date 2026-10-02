import { describe, expect, it, vi } from "vitest";
import { OperatorFundingService } from "@/application/operator/funding";

const fundingId = "00000000-0000-4000-8000-000000000010";
type ProofObject = {
  provider: string;
  container: string;
  key: string;
};
const proof: ProofObject = {
  provider: "private-proof",
  container: "evidence",
  key: "funding/receipt.png",
};

function serviceForRoot(options: {
  deleteObject: (proof: ProofObject, committed: () => boolean) => Promise<void>;
  audit?: { record: ReturnType<typeof vi.fn> };
  deleteForRoot?: (id: string) => Promise<{
    id: string;
    deleted: true;
    proofObjects: readonly ProofObject[];
  }>;
}) {
  let committed = false;
  const reader = {
    get: vi.fn(async () => ({ origin: "provider" })),
    deleteForRoot: vi.fn(
      options.deleteForRoot ??
        (async () => ({ id: fundingId, deleted: true as const, proofObjects: [proof] })),
    ),
  };
  const audit = options.audit ?? { record: vi.fn(async () => undefined) };
  const service = new OperatorFundingService(
    reader as never,
    { confirm: vi.fn() } as never,
    {
      repository: {},
      operators: {
        hasCapability: vi.fn(async () => true),
        requireCapability: vi.fn(async () => undefined),
      },
      wallet: { summary: vi.fn() },
      uow: {
        transaction: async (operation: () => Promise<unknown>) => {
          const result = await operation();
          committed = true;
          return result;
        },
      },
      storage: {
        get: vi.fn(() => ({
          delete: (locator: ProofObject) => options.deleteObject(locator, () => committed),
        })),
      },
      audit,
    } as never,
  );
  return { service, reader, audit, committed: () => committed };
}

describe("provider funding root deletion cleanup", () => {
  it("deletes stored proof objects after the database transaction commits", async () => {
    const deleteObject = vi.fn(async (locator: ProofObject, committed: () => boolean) => {
      expect(locator).toEqual(proof);
      expect(committed()).toBe(true);
    });
    const test = serviceForRoot({ deleteObject });

    await expect(test.service.deleteByOperator("root-1", fundingId)).resolves.toEqual({
      id: fundingId,
      deleted: true,
    });
    expect(test.committed()).toBe(true);
    expect(test.reader.deleteForRoot).toHaveBeenCalledWith(fundingId, "root-1");
    expect(deleteObject).toHaveBeenCalledOnce();
    expect(deleteObject).toHaveBeenCalledWith(proof, expect.any(Function));
    expect(test.audit.record).not.toHaveBeenCalled();
  });

  it("keeps committed deletion and records cleanup failure for retry", async () => {
    const deleteObject = vi.fn(async () => {
      throw new Error("private storage unavailable");
    });
    const audit = { record: vi.fn(async () => undefined) };
    const test = serviceForRoot({ deleteObject, audit });

    await expect(test.service.deleteByOperator("root-1", fundingId)).resolves.toEqual({
      id: fundingId,
      deleted: true,
    });
    expect(test.committed()).toBe(true);
    expect(audit.record).toHaveBeenCalledWith({
      actorId: "root-1",
      action: "funding.root_delete.storage_cleanup_failed",
      subjectType: "funding_transaction",
      subjectId: fundingId,
      previousState: { storage: proof },
      newState: { cleanup: "pending_retry" },
    });
  });

  it("continues bulk root deletion after an independent item fails", async () => {
    const failedId = "00000000-0000-4000-8000-000000000011";
    const deletedId = "00000000-0000-4000-8000-000000000012";
    const deleteForRoot = vi.fn(async (id: string) => {
      if (id === failedId) throw new Error("simulated database failure");
      return { id, deleted: true as const, proofObjects: [] };
    });
    const test = serviceForRoot({
      deleteObject: vi.fn(async () => undefined),
      deleteForRoot,
    });

    await expect(
      test.service.bulkDeleteByOperator("root-1", [failedId, deletedId]),
    ).resolves.toEqual({
      results: [
        { id: failedId, deleted: false, error: "simulated database failure" },
        { id: deletedId, deleted: true, error: null },
      ],
    });
    expect(deleteForRoot).toHaveBeenCalledTimes(2);
  });
});
