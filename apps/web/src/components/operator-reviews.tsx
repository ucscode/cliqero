"use client";

import { useEffect, useState } from "react";
import { apiFetch, type ListingReview } from "@/lib/api-client";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Review = ListingReview & { reviewer?: string; listing_title?: string };
export function OperatorReviews() {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState<Review[]>([]);
  async function load() {
    const page = await apiFetch<{ items: Review[] }>(`/api/operator/reviews?status=${status}`);
    setItems(page.items);
  }
  useEffect(() => {
    // Queue data is external and refreshed on an explicit status change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [status]);
  async function moderate(id: string, action: "approve" | "reject") {
    await apiFetch(`/api/operator/reviews/${id}/${action}`, { method: "POST" });
    await load();
  }
  return (
    <div className="overflow-x-auto">
      <div className="mb-5 flex justify-end">
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-40">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Listing</TableHead>
            <TableHead>Reviewer</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead>Review</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((review) => (
            <TableRow key={review.id}>
              <TableCell>{review.listing_title}</TableCell>
              <TableCell>{review.reviewer}</TableCell>
              <TableCell>{review.rating}/5</TableCell>
              <TableCell className="max-w-sm whitespace-pre-wrap">{review.body || "—"}</TableCell>
              <TableCell className="capitalize">{review.status}</TableCell>
              <TableCell>{new Date(review.created_at).toLocaleDateString()}</TableCell>
              <TableCell>
                {review.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void moderate(review.id, "approve")}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void moderate(review.id, "reject")}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
