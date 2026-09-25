"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ApiClientError,
  apiFetch,
  formatMinorCurrency,
  type Withdrawal,
  type WithdrawalPage,
} from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/toast";
import { WithdrawalHistoryList } from "./list";
import { ActionLock } from "../action-lock";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";

const WITHDRAWAL_HISTORY_PAGE_SIZE = 25;

export function WithdrawalHistoryPanel() {
  const [page, setPage] = useState<WithdrawalPage | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawalToCancel, setWithdrawalToCancel] = useState<Withdrawal | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const cancellationLock = useRef(new ActionLock());

  const load = useCallback(async (nextCursor: string | null = null) => {
    setLoading(true);
    const query = new URLSearchParams({ limit: String(WITHDRAWAL_HISTORY_PAGE_SIZE) });
    if (nextCursor) query.set("cursor", nextCursor);
    try {
      const nextPage = await apiFetch<WithdrawalPage>(`/api/withdrawals?${query}`);
      setPage(nextPage);
      setCursor(nextCursor);
      setError(null);
      return true;
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "We couldn’t load withdrawal history.",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial page loading synchronizes this panel with the authenticated resource.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function confirmCancellation() {
    const withdrawal = withdrawalToCancel;
    if (!withdrawal) return;
    await cancellationLock.current.run(async () => {
      setCancelling(true);
      try {
        await apiFetch<Withdrawal>(`/api/withdrawals/${withdrawal.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
        setWithdrawalToCancel(null);
        await load(cursor);
      } catch (cause) {
        setError(
          cause instanceof ApiClientError ? cause.message : "Withdrawal could not be cancelled.",
        );
      } finally {
        setCancelling(false);
      }
    });
  }

  async function next() {
    if (!page?.next_cursor || loading) return;
    if (await load(page.next_cursor)) setPreviousCursors((current) => [...current, cursor]);
  }

  async function previous() {
    if (!previousCursors.length || loading) return;
    const target = previousCursors[previousCursors.length - 1];
    if (await load(target)) setPreviousCursors((current) => current.slice(0, -1));
  }

  return (
    <section className="grid gap-4" aria-labelledby="withdrawal-history-heading">
      <div>
        <p className="eyebrow">Withdrawals</p>
        <h2 id="withdrawal-history-heading" className="text-2xl font-semibold tracking-tight">
          Withdrawal history
        </h2>
        <Link
          className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline"
          href="/dashboard?section=withdrawals"
        >
          Back to Withdrawals
        </Link>
      </div>
      {error && <Toast>{error}</Toast>}
      <Card className="min-w-0 p-5">
        {loading && !page ? (
          <Skeleton className="h-64 w-full" aria-label="Loading withdrawal history" />
        ) : (
          <WithdrawalHistoryList
            withdrawals={page?.withdrawals ?? []}
            onCancel={setWithdrawalToCancel}
          />
        )}
        <div className="mt-4 flex justify-between gap-3">
          <Button
            variant="secondary"
            onClick={() => void previous()}
            disabled={!previousCursors.length || loading}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            onClick={() => void next()}
            disabled={!page?.next_cursor || loading}
          >
            Next
          </Button>
        </div>
      </Card>
      <Dialog
        open={Boolean(withdrawalToCancel)}
        onOpenChange={(open) => {
          if (!open && !cancelling) setWithdrawalToCancel(null);
        }}
      >
        <DialogContent aria-describedby="withdrawal-history-cancel-description">
          <DialogHeader>
            <DialogTitle>Cancel withdrawal request?</DialogTitle>
            {withdrawalToCancel && (
              <p id="withdrawal-history-cancel-description" className="text-sm text-slate-600">
                Cancel the{" "}
                {formatMinorCurrency(withdrawalToCancel.amount_minor, withdrawalToCancel.currency)}
                request to {withdrawalToCancel.destination.name}?
              </p>
            )}
          </DialogHeader>
          {error && <Toast>{error}</Toast>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setWithdrawalToCancel(null)}
              disabled={cancelling}
            >
              Keep request
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmCancellation()}
              disabled={cancelling}
            >
              {cancelling ? "Cancelling…" : "Cancel withdrawal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
