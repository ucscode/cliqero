import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CrudIndex } from "@/components/crud/index-page";
import { reviewQueueSelection } from "@/components/operator/reviews";

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
const selection = {
  labelForItem: (item: typeof review) => `review by ${item.reviewer}`,
  bulkActions: [
    { label: "Approve", onSelect: vi.fn() },
    { label: "Reject", onSelect: vi.fn() },
  ],
};

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
      selection={reviewQueueSelection(appliedStatus, selection)}
    />,
  );
}

describe("operator review queue bulk selection", () => {
  it("shows selection controls and approve/reject actions for the pending queue", () => {
    const html = renderQueue("pending");
    expect(html).toContain('aria-label="Select all visible records"');
    expect(html).toContain('aria-label="Select review by A customer"');
    expect(selection.bulkActions.map((action) => action.label)).toEqual(["Approve", "Reject"]);
  });

  it.each(["approved", "rejected"])("hides selection controls for the %s queue", (status) => {
    const html = renderQueue(status);
    expect(html).not.toContain("Select all visible records");
    expect(html).not.toContain('type="checkbox"');
  });

  it("keeps pending bulk actions while another queue is only a draft, then follows applied state", () => {
    let appliedStatus = "pending";
    let draftStatus = "pending";
    draftStatus = "approved";

    expect(reviewQueueSelection(appliedStatus, selection)).toBe(selection);
    expect(renderQueue(appliedStatus)).toContain("Select all visible records");

    appliedStatus = draftStatus;
    expect(reviewQueueSelection(appliedStatus, selection)).toBeUndefined();
    expect(renderQueue(appliedStatus)).not.toContain("Select all visible records");

    appliedStatus = "pending";
    expect(reviewQueueSelection(appliedStatus, selection)).toBe(selection);
    expect(renderQueue(appliedStatus)).toContain("Select all visible records");
  });

  it("wires the table to the applied queue and updates it only after a successful filter load", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/operator/reviews.tsx"),
      "utf8",
    );
    expect(source).toContain("selection={reviewQueueSelection(appliedStatus,");
    expect(source).toContain("if (applied) setAppliedStatus(requestedStatus)");
    expect(source).toContain('setAppliedStatus("pending")');
    expect(source).not.toContain("reviewQueueSelection(status,");
  });
});
