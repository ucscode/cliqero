"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, type ListingReview } from "@/lib/api-client";
import { Select } from "../ui/select";
import { Button } from "../ui/button";
import { OperatorPrimaryCell, OperatorStatusCell, OperatorValueCell } from "./ui/data-cells";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "@/components/crud/index-page";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudColumn } from "@/components/crud/table";
import type { CrudBulkAction } from "@/components/crud/bulk-actions";

type Review = ListingReview & { reviewer?: string; listing_title?: string };
type ReviewPage = { items: Review[]; next_cursor: string | null };
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Review queue is temporarily unavailable.";

export function reviewQueueSelection<T>(
  appliedStatus: string,
  selection: {
    labelForItem: (item: T) => string;
    bulkActions: readonly CrudBulkAction<T>[];
  },
) {
  return appliedStatus === "pending" ? selection : undefined;
}

export function OperatorReviews() {
  const [status, setStatus] = useState("pending");
  const [appliedStatus, setAppliedStatus] = useState("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const collection = useCrudCollection(async (appliedStatus: string, cursor, pageSize) => {
    const params = new URLSearchParams({ status: appliedStatus, limit: String(pageSize) });
    if (cursor) params.set("cursor", cursor);
    const result = await apiFetch<ReviewPage>(`/api/operator/reviews?${params}`);
    return { items: result.items, nextCursor: result.next_cursor };
  }, "pending");

  async function moderate(id: string, action: "approve" | "reject") {
    try {
      setActionError(null);
      await apiFetch(`/api/operator/reviews/${id}/${action}`, { method: "POST" });
      await collection.retry();
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }
  async function moderateMany(reviews: readonly Review[], action: "approve" | "reject") {
    try {
      setActionError(null);
      const { results } = await apiFetch<{
        results: Array<{ id: string; success: boolean; error?: string }>;
      }>("/api/operator/reviews/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ids: reviews.map((review) => review.id) }),
      });
      const failures = results.filter((result) => !result.success);
      if (failures.length)
        setActionError(
          `${failures.length} of ${results.length} reviews could not be moderated: ${failures
            .map((result) => result.error)
            .filter(Boolean)
            .join("; ")}`,
        );
      await collection.retry();
      return true;
    } catch (cause) {
      setActionError(errorMessage(cause));
      return false;
    }
  }
  const bulkActions: readonly CrudBulkAction<Review>[] = [
    { label: "Approve", onSelect: (items) => moderateMany(items, "approve") },
    { label: "Reject", destructive: true, onSelect: (items) => moderateMany(items, "reject") },
  ];
  const columns: readonly CrudColumn<Review>[] = [
    {
      key: "listing",
      label: "Listing",
      primary: true,
      render: (review) => (
        <OperatorPrimaryCell
          title={
            <Link href={`/operator/catalogue/${review.listing_id}`}>
              {review.listing_title ?? "Listing"}
            </Link>
          }
          subtitle={review.listing_id}
        />
      ),
    },
    { key: "reviewer", label: "Reviewer", render: (review) => review.reviewer ?? "Customer" },
    {
      key: "rating",
      label: "Rating",
      render: (review) => <OperatorValueCell>{review.rating}/5</OperatorValueCell>,
    },
    {
      key: "review",
      label: "Review",
      render: (review) => <span className="whitespace-pre-wrap">{review.body || "—"}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (review) => <OperatorStatusCell status={review.status} />,
    },
    {
      key: "submitted",
      label: "Submitted",
      render: (review) => new Date(review.created_at).toLocaleString(),
    },
  ];

  return (
    <CrudIndex
      eyebrow="Customer feedback"
      title="Reviews"
      description="Moderate submitted listing reviews. Decisions remain protected by the review moderation capability."
      filters={
        <OperatorFilterField label="Status" htmlFor="review-status">
          <Select
            id="review-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
        </OperatorFilterField>
      }
      onFiltersReset={async () => {
        const ok = await collection.apply("pending");
        if (ok) {
          setStatus("pending");
          setAppliedStatus("pending");
        }
        return ok;
      }}
      filtersDirty={status !== "pending"}
      onFiltersSubmit={(event) => {
        event.preventDefault();
        const requestedStatus = status;
        void collection.apply(requestedStatus).then((applied) => {
          if (applied) setAppliedStatus(requestedStatus);
        });
      }}
      toolbarActions={
        <Button type="submit" variant="secondary" disabled={collection.loading}>
          Apply
        </Button>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(review) => review.id}
      selection={reviewQueueSelection(appliedStatus, {
        labelForItem: (review) => `review by ${review.reviewer ?? "customer"}`,
        bulkActions,
      })}
      actions={(review) =>
        review.status === "pending"
          ? [
              {
                type: "link",
                label: "View listing",
                href: `/operator/catalogue/${review.listing_id}`,
              },
              {
                type: "action",
                label: "Approve",
                onSelect: () => void moderate(review.id, "approve"),
              },
              {
                type: "action",
                label: "Reject",
                destructive: true,
                onSelect: () => void moderate(review.id, "reject"),
              },
            ]
          : [
              {
                type: "link",
                label: "View listing",
                href: `/operator/catalogue/${review.listing_id}`,
              },
            ]
      }
      actionLabel={(review) => `Actions for review ${review.id}`}
      loading={collection.loading}
      error={actionError ?? collection.error}
      onRetry={() => void collection.retry()}
      emptyTitle="No reviews in this queue"
      emptyDescription="Reviews matching this status will appear here."
      pagination={{
        hasPrevious: collection.hasPrevious,
        hasNext: collection.hasNext,
        onPrevious: () => void collection.previous(),
        onNext: () => void collection.next(),
      }}
      sectionTitle="Moderation queue"
      sectionDescription="Review content and status before taking an action."
    />
  );
}
