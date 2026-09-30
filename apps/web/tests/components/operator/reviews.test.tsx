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
  { value: "approve", label: "Approve selected", onSelect: vi.fn() },
  { value: "reject", label: "Reject selected", onSelect: vi.fn() },
  { value: "delete", label: "Delete selected", onSelect: vi.fn() },
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
  it("shows the disabled bulk toolbar before selection", () => {
    const html = renderQueue("all");
    expect(html).toContain('aria-label="Select all visible records"');
    expect(html).toContain('aria-label="Select review by A customer"');
    expect(html).toContain('aria-label="Bulk actions"');
    expect(html).toContain(">Approve selected</option>");
    expect(html).toContain(">Reject selected</option>");
    expect(html).toContain(">Delete selected</option>");
    expect(html).toContain('type="button" disabled=""');
    expect(reviewQueueBulkActions([review], actions)).toBe(actions);
  });

  it("keeps actions visible for mixed states and supplies approve, reject, and delete", () => {
    expect(reviewQueueBulkActions([review], actions)).toBe(actions);
    expect(
      reviewQueueBulkActions(
        [
          { ...review, status: "pending" },
          { ...review, status: "approved" },
          { ...review, id: "review-3", status: "rejected" },
        ],
        actions,
      ),
    ).toEqual(actions);
    expect(actions.map(({ label }) => label)).toEqual([
      "Approve selected",
      "Reject selected",
      "Delete selected",
    ]);
    expect(reviewQueueBulkActions([], actions)).toEqual([]);
  });

  it("starts with All, omits the default status filter, and reset returns to All", () => {
    expect(reviewQueueQuery("all", null, 100).toString()).toBe(
      "limit=100&sort=submitted&direction=desc",
    );
    expect(reviewQueueQuery("all", null, 100).get("status")).toBeNull();
    expect(reviewQueueQuery("pending", null, 100).get("status")).toBe("pending");
    expect(
      reviewQueueQuery("all", null, 100, "submitted", "desc", "listing-1").get("listing_id"),
    ).toBe("listing-1");
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
    expect(source).toContain('label: "Edit review"');
    expect(source).toContain("line-clamp-3 max-w-[20rem] break-words whitespace-pre-wrap");
    expect(source).toContain('resource: "reviews",\n        action: "delete"');
    expect(source).toContain("Delete review");
    expect(source).toContain("reviewQueueBulkActions(selected, bulkActions)");
  });
});
