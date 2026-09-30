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
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "./ui/bulk-outcome";
import { useToast } from "../toast/provider";
import { CrudSortSelect } from "@/components/crud/sort-select";

type Review = ListingReview & { reviewer?: string; listing_title?: string };
type ReviewPage = { items: Review[]; next_cursor: string | null };
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Review queue is temporarily unavailable.";

export function reviewQueueBulkActions<T extends { status: string }>(
  selectedItems: readonly T[],
  bulkActions: readonly CrudBulkAction<T>[],
) {
  return selectedItems.length > 0 && selectedItems.every((item) => item.status === "pending")
    ? bulkActions
    : [];
}

export function reviewQueueQuery(
  status: string,
  cursor: string | null,
  pageSize: number,
  sort = "submitted",
  direction = "desc",
) {
  const params = new URLSearchParams({ limit: String(pageSize) });
  params.set("sort", sort);
  params.set("direction", direction);
  if (status !== "all") params.set("status", status);
  if (cursor) params.set("cursor", cursor);
  return params;
}

export function OperatorReviews() {
  const toast = useToast();
  const [status, setStatus] = useState("all");
  const [sortChoice, setSortChoice] = useState("submitted:desc");
  const [sort, direction] = sortChoice.split(":") as ["submitted" | "rating", "asc" | "desc"];
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  const collection = useCrudCollection(
    async (filters: { status: string; sort: string; direction: string }, cursor, pageSize) => {
      const params = reviewQueueQuery(
        filters.status,
        cursor,
        pageSize,
        filters.sort,
        filters.direction,
      );
      const result = await apiFetch<ReviewPage>(`/api/reviews?${params}`);
      return { items: result.items, nextCursor: result.next_cursor };
    },
    { status: "all", sort: "submitted", direction: "desc" },
  );

  async function moderate(id: string, action: "approve" | "reject") {
    try {
      setActionError(null);
      setBulkOutcome(null);
      await apiFetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: action === "approve" ? "approved" : "rejected" }),
      });
      toast.success(`Review ${action === "approve" ? "approved" : "rejected"}.`);
      await collection.retry();
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }
  async function moderateMany(reviews: readonly Review[], action: "approve" | "reject") {
    try {
      setActionError(null);
      setBulkOutcome(null);
      const results = await runOperatorBulkAction({
        resource: "reviews",
        action: "moderate",
        status: action === "approve" ? "approved" : "rejected",
        ids: reviews.map((review) => review.id),
      });
      const failures = results.failed;
      if (failures.length)
        setBulkOutcome({
          resource: "reviews",
          selectedCount: reviews.length,
          failures: failures.map(({ id, message }) => ({
            id,
            label: reviews.find((review) => review.id === id)?.reviewer ?? id,
            message,
          })),
        });
      await collection.retry();
      if (!failures.length)
        toast.success(`${reviews.length} review${reviews.length === 1 ? "" : "s"} moderated.`);
      return failures.length === 0;
    } catch (cause) {
      setActionError(errorMessage(cause));
      return false;
    }
  }
  const bulkActions: readonly CrudBulkAction<Review>[] = [
    { value: "approve", label: "Approve", onSelect: (items) => moderateMany(items, "approve") },
    {
      value: "reject",
      label: "Reject",
      destructive: true,
      onSelect: (items) => moderateMany(items, "reject"),
    },
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
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
        </OperatorFilterField>
      }
      sort={
        <CrudSortSelect
          value={sortChoice}
          onChange={setSortChoice}
          options={[
            { value: "submitted:desc", label: "Newest", sort: "submitted", direction: "desc" },
            { value: "submitted:asc", label: "Oldest", sort: "submitted", direction: "asc" },
            { value: "rating:desc", label: "Highest rating", sort: "rating", direction: "desc" },
            { value: "rating:asc", label: "Lowest rating", sort: "rating", direction: "asc" },
          ]}
        />
      }
      onFiltersReset={async () => {
        const ok = await collection.apply({ status: "all", sort: "submitted", direction: "desc" });
        if (ok) {
          setStatus("all");
          setSortChoice("submitted:desc");
        }
        return ok;
      }}
      filtersDirty={status !== "all" || sortChoice !== "submitted:desc"}
      onFiltersSubmit={async (event) => {
        event.preventDefault();
        const requestedStatus = status;
        const applied = await collection.apply({ status: requestedStatus, sort, direction });
        return applied;
      }}
      toolbarActions={
        <Button type="submit" variant="action" disabled={collection.loading}>
          Apply
        </Button>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(review) => review.id}
      selection={{ labelForItem: (review) => `review by ${review.reviewer ?? "customer"}` }}
      bulkActions={(selected) => reviewQueueBulkActions(selected, bulkActions)}
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
      beforeTable={
        <div className="grid gap-3">
          {actionError && <OperatorErrorState message={actionError} />}
          {bulkOutcome && <OperatorBulkOutcome outcome={bulkOutcome} />}
        </div>
      }
      error={collection.error}
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
