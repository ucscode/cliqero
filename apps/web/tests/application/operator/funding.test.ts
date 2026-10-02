import { describe, expect, it, vi } from "vitest";
import { OperatorFundingService } from "@/application/operator/funding";

const fundingId = "00000000-0000-4000-8000-000000000010";

function serviceForRoot(options: {
  deleteForRoot?: (id: string) => Promise<{ id: string; deleted: true }>;
}) {
  let committed = false;
  const reader = {
    get: vi.fn(async () => ({ origin: "provider" })),
    deleteForRoot: vi.fn(
      options.deleteForRoot ?? (async () => ({ id: fundingId, deleted: true as const })),
    ),
  };
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
    } as never,
  );
  return { service, reader, committed: () => committed };
}

describe("provider funding root deletion orchestration", () => {
  it("commits the reader workflow before returning success", async () => {
    const test = serviceForRoot({});

    await expect(test.service.deleteByOperator("root-1", fundingId)).resolves.toEqual({
      id: fundingId,
      deleted: true,
    });
    expect(test.committed()).toBe(true);
    expect(test.reader.deleteForRoot).toHaveBeenCalledWith(fundingId, "root-1");
  });

  it("continues bulk root deletion after an independent item fails", async () => {
    const failedId = "00000000-0000-4000-8000-000000000011";
    const deletedId = "00000000-0000-4000-8000-000000000012";
    const deleteForRoot = vi.fn(async (id: string) => {
      if (id === failedId) throw new Error("simulated database failure");
      return { id, deleted: true as const };
    });
    const test = serviceForRoot({ deleteForRoot });

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
