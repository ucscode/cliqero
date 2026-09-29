import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CrudIndex } from "@/components/crud/index-page";
import { reviewQueueBulkActions } from "@/components/operator/reviews";

const review = {
  id: "review-1",
  listing_id: "listing-1",
  reviewer: "A customer",
  rating: 5,
  body: "Useful",
  status: "pending",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};
const selection = { labelForItem: (item: typeof review) => `review by ${item.reviewer}` };
const actions = [
  { value: "approve", label: "Approve", onSelect: vi.fn() },
  { value: "reject", label: "Reject", onSelect: vi.fn() },
];

function renderQueue(appliedStatus: string) {
  return renderToStaticMarkup(
    <CrudIndex
      title="Reviews"
      items={[review]}
      columns={[{ key: "review", label: "Review", render: (item) => item.reviewer }]}
      getRowKey={(item) => item.id}
      loading={false}
      error={null}
      emptyTitle="No reviews"
      emptyDescription="No reviews in this queue."
      selection={selection}
      bulkActions={reviewQueueBulkActions(appliedStatus, actions)}
    />,
  );
}

describe("operator review queue bulk selection", () => {
  it("shows checkboxes and approve/reject dropdown actions for the pending queue", () => {
    const html = renderQueue("pending");
    expect(html).toContain('aria-label="Select all visible records"');
    expect(html).toContain('aria-label="Select review by A customer"');
    expect(html).toContain(">Approve</option>");
    expect(html).toContain(">Reject</option>");
    expect(html).not.toContain(">Approve</button>");
    expect(html).not.toContain(">Reject</button>");
  });

  it.each(["approved", "rejected"])(
    "keeps selection but hides invalid moderation actions for %s queue",
    (status) => {
      const html = renderQueue(status);
      expect(html).toContain("Select all visible records");
      expect(html).toContain("0 items selected");
      expect(html).not.toContain('aria-label="Bulk actions"');
      expect(html).not.toContain(">Approve</option>");
      expect(html).not.toContain(">Reject</option>");
    },
  );

  it("keeps pending bulk actions until a different filter is successfully applied", () => {
    expect(reviewQueueBulkActions("pending", actions)).toBe(actions);
    expect(reviewQueueBulkActions("approved", actions)).toEqual([]);
    expect(reviewQueueBulkActions("pending", actions)).toBe(actions);
  });

  it("wires moderation actions to the applied queue state", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/operator/reviews.tsx"),
      "utf8",
    );
    expect(source).toContain("bulkActions={reviewQueueBulkActions(appliedStatus, bulkActions)}");
    expect(source).toContain("selection={{ labelForItem:");
    expect(source).toContain("if (applied) setAppliedStatus(requestedStatus)");
    expect(source).toContain('setAppliedStatus("pending")');
    expect(source).not.toContain("reviewQueueBulkActions(status,");
  });
});
