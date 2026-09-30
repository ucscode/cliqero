import { describe, expect, it, vi } from "vitest";
import { OperatorBulkWorkflow } from "@/application/operator/bulk-workflow";
import { Account } from "@/modules/identity/account";

const actor = new Account("00000000-0000-4000-8000-000000000001", "operator");

describe("OperatorBulkWorkflow", () => {
  it("authorizes before work and reports partial per-record outcomes", async () => {
    const update = vi.fn(async (_account: Account, id: string) => {
      if (id.endsWith("2")) throw new Error("Review is no longer available.");
    });
    const moderate = vi.fn();
    const requireCapability = vi.fn(async () => undefined);
    const workflow = new OperatorBulkWorkflow({
      operators: { requireCapability },
      listingReviews: { moderate, update },
    } as never);

    await expect(
      workflow.execute(actor, {
        resource: "reviews",
        action: "moderate",
        status: "approved",
        ids: ["review-1", "review-2", "review-1"],
      }),
    ).resolves.toEqual({
      succeeded: ["review-1"],
      failed: [{ id: "review-2", message: "Review is no longer available." }],
    });
    expect(requireCapability).toHaveBeenCalledWith(actor.id, "reviews.moderate");
    expect(moderate).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(actor, "review-1", { status: "approved" });
  });

  it("does not execute any records when capability authorization fails", async () => {
    const moderate = vi.fn();
    const workflow = new OperatorBulkWorkflow({
      operators: {
        requireCapability: async () => {
          throw new Error("Forbidden");
        },
      },
      listingReviews: { moderate },
    } as never);

    await expect(
      workflow.execute(actor, {
        resource: "reviews",
        action: "moderate",
        status: "rejected",
        ids: ["review-1"],
      }),
    ).rejects.toThrow("Forbidden");
    expect(moderate).not.toHaveBeenCalled();
  });

  it("deletes each selected review independently and reports partial failures", async () => {
    const remove = vi.fn(async (_account: Account, id: string) => {
      if (id === "review-b") throw new Error("Review not found.");
    });
    const workflow = new OperatorBulkWorkflow({
      operators: { requireCapability: vi.fn(async () => undefined) },
      listingReviews: { moderate: vi.fn(), delete: remove },
    } as never);

    await expect(
      workflow.execute(actor, {
        resource: "reviews",
        action: "delete",
        ids: ["review-a", "review-b", "review-a"],
      }),
    ).resolves.toEqual({
      succeeded: ["review-a"],
      failed: [{ id: "review-b", message: "Review not found." }],
    });
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
