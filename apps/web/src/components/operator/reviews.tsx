"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, type ListingReview } from "@/lib/api-client";
import { Select } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { CursorHistory } from "./ui/cursor-history";
import { OperatorActionsMenu } from "./ui/actions-menu";
import {
  OperatorActionCell,
  OperatorPrimaryCell,
  OperatorStatusCell,
  OperatorValueCell,
} from "./ui/data-cells";
import { OperatorEmptyState } from "./ui/empty-state";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorLoadingState } from "./ui/loading-state";
import { OperatorPage, OperatorPageHeader } from "./ui/page";
import { OperatorPagination } from "./ui/pagination";
import { OperatorSection } from "./ui/section";
import { OperatorTableSurface } from "./ui/table-surface";
import { OperatorFilterField, OperatorToolbar } from "./ui/toolbar";

type Review = ListingReview & { reviewer?: string; listing_title?: string };
type ReviewPage = { items: Review[]; next_cursor: string | null };
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Review queue is temporarily unavailable.";

export function OperatorReviews() {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState<ReviewPage | null>(null);
  const [history, setHistory] = useState(() => CursorHistory.firstPage());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const retryCursor = useRef<string | null>(null);

  const load = useCallback(
    async (cursor: string | null = null) => {
      if (busy.current) return null;
      busy.current = true;
      retryCursor.current = cursor;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ status });
        if (cursor) params.set("cursor", cursor);
        const result = await apiFetch<ReviewPage>(`/api/operator/reviews?${params}`);
        setPage(result);
        if (!cursor) setHistory(CursorHistory.firstPage());
        return result;
      } catch (cause) {
        setError(errorMessage(cause));
        return null;
      } finally {
        busy.current = false;
        setLoading(false);
      }
    },
    [status],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function moderate(id: string, action: "approve" | "reject") {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/operator/reviews/${id}/${action}`, { method: "POST" });
      busy.current = false;
      await load(history.current);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  async function next() {
    const cursor = page?.next_cursor;
    if (!cursor || busy.current) return;
    const result = await load(cursor);
    if (result) setHistory((current) => current.afterNext(cursor));
  }
  async function previous() {
    if (!history.hasPrevious || busy.current) return;
    const cursor = history.previous;
    const result = await load(cursor);
    if (result) setHistory((current) => current.afterPrevious());
  }

  return (
    <OperatorPage>
      <OperatorPageHeader
        eyebrow="Customer feedback"
        title="Reviews"
        description="Moderate submitted listing reviews. Decisions remain protected by the review moderation capability."
      />
      <OperatorToolbar
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <OperatorFilterField label="Status" htmlFor="review-status">
          <Select
            id="review-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
            }}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
        </OperatorFilterField>
      </OperatorToolbar>
      {error && <OperatorErrorState message={error} retry={() => void load(retryCursor.current)} />}
      <OperatorSection
        title="Moderation queue"
        description="Review content and status before taking an action."
      >
        {loading && !page ? (
          <OperatorLoadingState variant="table" columns={7} />
        ) : page?.items.length ? (
          <OperatorTableSurface
            footer={
              <OperatorPagination
                hasPrevious={history.hasPrevious && !loading}
                hasNext={Boolean(page.next_cursor) && !loading}
                onPrevious={() => void previous()}
                onNext={() => void next()}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell>
                      <OperatorPrimaryCell
                        title={
                          <Link href={`/operator/catalogue/${review.listing_id}`}>
                            {review.listing_title ?? "Listing"}
                          </Link>
                        }
                        subtitle={review.listing_id}
                      />
                    </TableCell>
                    <TableCell>{review.reviewer ?? "Customer"}</TableCell>
                    <TableCell>
                      <OperatorValueCell align="left">{review.rating}/5</OperatorValueCell>
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-pre-wrap">
                      {review.body || "—"}
                    </TableCell>
                    <TableCell>
                      <OperatorStatusCell status={review.status} />
                    </TableCell>
                    <TableCell>{new Date(review.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <OperatorActionCell>
                        <OperatorActionsMenu
                          actions={
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
                          label={`Actions for review ${review.id}`}
                        />
                      </OperatorActionCell>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </OperatorTableSurface>
        ) : (
          <OperatorEmptyState
            title="No reviews in this queue"
            description="Reviews matching this status will appear here."
          />
        )}
      </OperatorSection>
    </OperatorPage>
  );
}
