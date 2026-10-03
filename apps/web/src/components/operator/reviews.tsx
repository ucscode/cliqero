"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, type ListingReview } from "@/lib/api-client";
import { Select } from "../ui/select";
import { Input } from "../ui/input";
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
import { CrudEdit } from "@/components/crud/edit";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

type Review = ListingReview & { reviewer?: string; listing_title?: string };
type OperatorReviewDetail = Review & { moderated_by?: string | null };
type ReviewPage = { items: Review[]; next_cursor: string | null };
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Review queue is temporarily unavailable.";

export function reviewQueueBulkActions<T extends { status: string }>(
  selectedItems: readonly T[],
  bulkActions: readonly CrudBulkAction<T>[],
) {
  return selectedItems.length > 0 ? bulkActions : [];
}

export function OperatorReviewEditor({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [review, setReview] = useState<OperatorReviewDetail | null>(null);
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<Review["status"]>("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ item: OperatorReviewDetail }>(`/api/reviews/${reviewId}`)
      .then(({ item }) => {
        setReview(item);
        setRating(String(item.rating));
        setBody(item.body);
        setStatus(item.status);
      })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, [reviewId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<{ item: OperatorReviewDetail }>(`/api/reviews/${reviewId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating: Number(rating), body, status }),
      });
      setReview(result.item);
      toast.success("Review saved.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        "Delete this review? It will be removed from customer reviews and rating totals.",
      )
    )
      return;
    setSaving(true);
    try {
      await apiFetch(`/api/reviews/${reviewId}`, { method: "DELETE" });
      toast.success("Review deleted.");
      router.push("/operator/reviews");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <CrudEdit
      mode="edit"
      eyebrow="Customer feedback"
      title="Edit review"
      description="Review the listing and reviewer context, then update only the rating, content, or moderation status."
      backHref="/operator/reviews"
      backLabel="Back to reviews"
      saving={saving}
      loading={loading}
      error={error}
      onSubmit={save}
      formId="operator-review-form"
      submitLabel="Save changes"
      savingLabel="Saving…"
      sectionTitle="Review details"
      sectionDescription="Submitted content and moderation history remain attached to the original reviewer and listing."
      footer={
        review ? (
          <div className="text-xs leading-5 text-slate-500">
            Updated {new Date(review.updated_at).toLocaleString()}
            {review.moderated_at
              ? ` · Moderated ${new Date(review.moderated_at).toLocaleString()}`
              : ""}
          </div>
        ) : null
      }
      headerActions={
        <Button type="button" variant="destructive" onClick={() => void remove()} disabled={saving}>
          Delete
        </Button>
      }
    >
      {review && (
        <div className="grid gap-2 rounded-md bg-slate-50 p-4 text-sm">
          <p>
            <strong>Listing:</strong> {review.listing_title}{" "}
            <span className="text-slate-500">({review.listing_id})</span>
          </p>
          <p>
            <strong>Reviewer:</strong> {review.reviewer ?? "Customer"}
          </p>
          <p>
            <strong>Submitted:</strong> {new Date(review.created_at).toLocaleString()}
          </p>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="review-rating">Rating</Label>
        <Select
          id="review-rating"
          value={rating}
          onChange={(event) => setRating(event.target.value)}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value} / 5
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="review-body">Review body</Label>
        <Textarea
          id="review-body"
          rows={12}
          maxLength={2000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <p className="text-xs leading-5 text-slate-500">Up to 2,000 characters.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="review-status">Status</Label>
        <Select
          id="review-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as Review["status"])}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
      </div>
    </CrudEdit>
  );
}

export function reviewQueueQuery(
  status: string,
  cursor: string | null,
  pageSize: number,
  sort = "submitted",
  direction = "desc",
  listingId = "",
) {
  const params = new URLSearchParams({ limit: String(pageSize) });
  params.set("sort", sort);
  params.set("direction", direction);
  if (status !== "all") params.set("status", status);
  if (listingId.trim()) params.set("listing_id", listingId.trim());
  if (cursor) params.set("cursor", cursor);
  return params;
}

export function OperatorReviews({
  initialListingId = "",
  canDelete = false,
}: {
  initialListingId?: string;
  canDelete?: boolean;
}) {
  const toast = useToast();
  const [viewingReview, setViewingReview] = useState<Review | null>(null);
  const [status, setStatus] = useState("all");
  const [listingId, setListingId] = useState(initialListingId);
  const [appliedListingId, setAppliedListingId] = useState(initialListingId);
  const [sortChoice, setSortChoice] = useState("submitted:desc");
  const [sort, direction] = sortChoice.split(":") as ["submitted" | "rating", "asc" | "desc"];
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  const collection = useCrudCollection(
    async (
      filters: { status: string; sort: string; direction: string; listingId: string },
      cursor,
      pageSize,
    ) => {
      const params = reviewQueueQuery(
        filters.status,
        cursor,
        pageSize,
        filters.sort,
        filters.direction,
        filters.listingId,
      );
      const result = await apiFetch<ReviewPage>(`/api/reviews?${params}`);
      return { items: result.items, nextCursor: result.next_cursor };
    },
    { status: "all", sort: "submitted", direction: "desc", listingId: initialListingId },
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
        action: "update",
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
        toast.success(`${reviews.length} review${reviews.length === 1 ? "" : "s"} updated.`);
      return failures.length === 0;
    } catch (cause) {
      setActionError(errorMessage(cause));
      return false;
    }
  }
  async function deleteMany(reviews: readonly Review[]) {
    if (!window.confirm(`Permanently delete ${reviews.length} selected review(s)?`)) return false;
    try {
      setActionError(null);
      setBulkOutcome(null);
      const results = await runOperatorBulkAction({
        resource: "reviews",
        action: "delete",
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
      if (!failures.length) toast.success(`${reviews.length} review(s) permanently deleted.`);
      return failures.length === 0;
    } catch (cause) {
      setActionError(errorMessage(cause));
      return false;
    }
  }
  const bulkActions: readonly CrudBulkAction<Review>[] = [
    {
      value: "approve",
      label: "Approve",
      onSelect: (items) => moderateMany(items, "approve"),
    },
    {
      value: "reject",
      label: "Reject",
      destructive: true,
      onSelect: (items) => moderateMany(items, "reject"),
    },
    ...(canDelete
      ? [
          {
            value: "delete",
            label: "Delete",
            destructive: true,
            onSelect: deleteMany,
          },
        ]
      : []),
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
      render: (review) => (
        <div className="line-clamp-3 max-w-[20rem] break-words whitespace-pre-wrap">
          {review.body || "—"}
        </div>
      ),
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
        <>
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
          <OperatorFilterField label="Listing ID" htmlFor="review-listing-id">
            <Input
              id="review-listing-id"
              type="search"
              value={listingId}
              onChange={(event) => setListingId(event.target.value)}
              placeholder="Filter by listing ID"
            />
          </OperatorFilterField>
        </>
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
        const ok = await collection.apply({
          status: "all",
          sort: "submitted",
          direction: "desc",
          listingId: "",
        });
        if (ok) {
          setStatus("all");
          setListingId("");
          setAppliedListingId("");
          setSortChoice("submitted:desc");
        }
        return ok;
      }}
      filtersDirty={
        status !== "all" || listingId !== appliedListingId || sortChoice !== "submitted:desc"
      }
      onFiltersSubmit={async (event) => {
        event.preventDefault();
        const requestedStatus = status;
        const applied = await collection.apply({
          status: requestedStatus,
          sort,
          direction,
          listingId,
        });
        if (applied) setAppliedListingId(listingId.trim());
        return applied;
      }}
      toolbarActions={
        <Button type="submit" variant="action" disabled={collection.loading}>
          Apply
        </Button>
      }
      afterTable={
        <Dialog
          open={viewingReview !== null}
          onOpenChange={(open) => !open && setViewingReview(null)}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            {viewingReview && (
              <>
                <DialogHeader>
                  <DialogTitle>Review details</DialogTitle>
                </DialogHeader>
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="font-medium text-slate-500">Listing</dt>
                    <dd>{viewingReview.listing_title ?? viewingReview.listing_id}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Reviewer</dt>
                    <dd>{viewingReview.reviewer ?? "Customer"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Rating</dt>
                    <dd>{viewingReview.rating}/5</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Status</dt>
                    <dd>{viewingReview.status}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Submitted</dt>
                    <dd>{new Date(viewingReview.created_at).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Full review</dt>
                    <dd className="whitespace-pre-wrap break-words">{viewingReview.body || "—"}</dd>
                  </div>
                </dl>
              </>
            )}
          </DialogContent>
        </Dialog>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(review) => review.id}
      selection={{ labelForItem: (review) => `review by ${review.reviewer ?? "customer"}` }}
      bulkActions={(selected) => reviewQueueBulkActions(selected, bulkActions)}
      actions={(review) => [
        {
          type: "action" as const,
          label: "View",
          onSelect: () => setViewingReview(review),
        },
        { type: "link" as const, label: "Edit", href: `/operator/reviews/${review.id}` },
        ...(canDelete
          ? [
              {
                type: "action" as const,
                label: "Delete",
                destructive: true,
                onSelect: () => {
                  if (!window.confirm("Permanently delete this review?")) return;
                  void runOperatorBulkAction({
                    resource: "reviews",
                    action: "delete",
                    ids: [review.id],
                  })
                    .then(async (result) => {
                      if (result.failed.length) throw new Error(result.failed[0]!.message);
                      toast.success("Review deleted.");
                      await collection.retry();
                    })
                    .catch((cause) => setActionError(errorMessage(cause)));
                },
              },
            ]
          : []),
        ...(review.status === "pending"
          ? [
              {
                type: "action" as const,
                label: "Approve",
                onSelect: () => void moderate(review.id, "approve"),
              },
              {
                type: "action" as const,
                label: "Reject",
                destructive: true,
                onSelect: () => void moderate(review.id, "reject"),
              },
            ]
          : []),
      ]}
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
