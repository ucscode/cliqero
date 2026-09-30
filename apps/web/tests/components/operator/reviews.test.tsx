import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CrudIndex } from "@/components/crud/index-page";
import { reviewQueueBulkActions, reviewQueueQuery } from "@/components/operator/reviews";

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
      bulkActions={reviewQueueBulkActions([{ ...review, status: appliedStatus }], actions)}
    />,
  );
}

describe("operator review queue bulk selection", () => {
  it("shows selection controls and leaves bulk actions unavailable before selection", () => {
    const html = renderQueue("all");
    expect(html).toContain('aria-label="Select all visible records"');
    expect(html).toContain('aria-label="Select review by A customer"');
    expect(html).not.toContain('aria-label="Bulk actions"');
    expect(reviewQueueBulkActions([review], actions)).toBe(actions);
  });

  it.each(["approved", "rejected"])("hides invalid actions for selected %s reviews", (status) => {
    expect(reviewQueueBulkActions([{ ...review, status }], actions)).toEqual([]);
  });

  it("derives bulk moderation availability from selected row states", () => {
    expect(reviewQueueBulkActions([review], actions)).toBe(actions);
    expect(
      reviewQueueBulkActions(
        [
          { ...review, status: "pending" },
          { ...review, status: "approved" },
        ],
        actions,
      ),
    ).toEqual([]);
    expect(reviewQueueBulkActions([], actions)).toEqual([]);
  });

  it("starts with All, omits the default status filter, and reset returns to All", () => {
    expect(reviewQueueQuery("all", null, 100).toString()).toBe(
      "limit=100&sort=submitted&direction=desc",
    );
    expect(reviewQueueQuery("all", null, 100).get("status")).toBeNull();
    expect(reviewQueueQuery("pending", null, 100).get("status")).toBe("pending");
    const source = readFileSync(
      resolve(process.cwd(), "src/components/operator/reviews.tsx"),
      "utf8",
    );
    expect(source).toContain('useState("all")');
    expect(source).toContain(
      "bulkActions={(selected) => reviewQueueBulkActions(selected, bulkActions)}",
    );
    expect(source).toContain('sort: "submitted", direction: "desc"');
    expect(source).toContain('status: "all"');
  });
});
