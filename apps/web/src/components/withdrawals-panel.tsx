"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ApiClientError,
  apiFetch,
  formatMinorUsd,
  parseUsdMinor,
  type EarningsSummary,
  type Withdrawal,
  type WithdrawalPage,
  type WithdrawalPolicy,
} from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { Money } from "./money";

const activeStates = new Set<Withdrawal["state"]>(["requested", "approved"]);

function stateLabel(state: Withdrawal["state"]): string {
  switch (state) {
    case "requested":
      return "Request received";
    case "approved":
      return "Approved · payout pending";
    case "completed":
      return "Payout completed";
    case "rejected":
      return "Withdrawal rejected";
    case "cancelled":
      return "Withdrawal cancelled";
    case "failed":
      return "Payout failed";
  }
}

function stateTone(state: Withdrawal["state"]): "neutral" | "accent" | "success" {
  if (state === "completed") return "success";
  if (state === "requested" || state === "approved") return "accent";
  return "neutral";
}

function availableEarnings(
  page: WithdrawalPage | null,
  summary: EarningsSummary | null,
  currency: string,
): string {
  if (page?.available_minor !== undefined) return page.available_minor;
  return (
    summary?.balances.find(
      (balance) => balance.state === "available" && balance.currency === currency,
    )?.amount_minor ?? "0"
  );
}

export function WithdrawalsPanel() {
  const [policy, setPolicy] = useState<WithdrawalPolicy | null>(null);
  const [page, setPage] = useState<WithdrawalPage | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const requestSignature = useRef<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [nextPolicy, nextPage, nextEarnings] = await Promise.all([
        apiFetch<WithdrawalPolicy>("/api/withdrawals/policy"),
        apiFetch<WithdrawalPage>("/api/withdrawals"),
        apiFetch<EarningsSummary>("/api/earnings"),
      ]);
      setPolicy(nextPolicy);
      setPage(nextPage);
      setEarnings(nextEarnings);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "We couldn’t load withdrawals.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initial data loading synchronizes this client panel with the remote API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const currency = policy?.currency ?? "USD";
  const availableMinor = availableEarnings(page, earnings, currency);
  const reservedMinor =
    page?.reservations.find((reservation) => reservation.currency === currency)?.reserved_minor ??
    "0";
  const activeWithdrawals = useMemo(
    () => (page?.withdrawals ?? []).filter((withdrawal) => activeStates.has(withdrawal.state)),
    [page],
  );

  useEffect(() => {
    if (!activeWithdrawals.length) return;
    let attempts = 0;
    let timer: number | undefined;
    let disposed = false;
    const poll = async () => {
      if (disposed) return;
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(() => void poll(), 5000);
        return;
      }
      attempts += 1;
      await load(true);
      if (!disposed && attempts < 12) timer = window.setTimeout(() => void poll(), 5000);
    };
    timer = window.setTimeout(() => void poll(), 5000);
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeWithdrawals.length, load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    let amountMinor: string;
    try {
      amountMinor = parseUsdMinor(amount);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a valid amount.");
      return;
    }
    if (!policy?.enabled) {
      setError("Withdrawals are currently unavailable.");
      return;
    }
    if (BigInt(amountMinor) < BigInt(policy.minimum_amount_minor)) {
      setError(`The minimum withdrawal is ${formatMinorUsd(policy.minimum_amount_minor)}.`);
      return;
    }
    if (policy.maximum_amount_minor && BigInt(amountMinor) > BigInt(policy.maximum_amount_minor)) {
      setError(`The maximum withdrawal is ${formatMinorUsd(policy.maximum_amount_minor)}.`);
      return;
    }
    if (BigInt(amountMinor) > BigInt(availableMinor)) {
      setError("This amount is greater than your available earnings.");
      return;
    }
    if (!destination.trim()) {
      setError("Enter a payout destination reference.");
      return;
    }
    const signature = `${amountMinor}|${destination.trim()}`;
    if (requestSignature.current !== signature) {
      requestSignature.current = signature;
      idempotencyKey.current = `ui-withdrawal-${crypto.randomUUID()}`;
    }
    setSubmitting(true);
    try {
      await apiFetch<Withdrawal>("/api/withdrawals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey.current!,
        },
        body: JSON.stringify({
          amount_minor: amountMinor,
          currency,
          destination_type: "manual",
          destination_reference: destination.trim(),
        }),
      });
      setSuccess("Withdrawal request received. Payout processing is asynchronous.");
      await load(true);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "Withdrawal could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(withdrawal: Withdrawal) {
    if (!window.confirm("Cancel this withdrawal request?")) return;
    setError(null);
    try {
      await apiFetch<Withdrawal>(`/api/withdrawals/${withdrawal.id}`, { method: "DELETE" });
      await load(true);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "Withdrawal could not be cancelled.",
      );
    }
  }

  return (
    <section className="grid gap-4" aria-labelledby="withdrawals-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Withdrawals</p>
          <h2 id="withdrawals-heading">Move available earnings</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Request a payout from settled referral earnings. Your buyer wallet remains separate.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error && <Toast>{error}</Toast>}
      {success && <Toast tone="success">{success}</Toast>}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-3" aria-label="Loading withdrawals">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="min-w-0 p-5">
              <p className="eyebrow">Available earnings</p>
              <h3 className="my-2 text-2xl">
                <Money minor={availableMinor} currency={currency} />
              </h3>
              <Link
                className="text-sm font-semibold text-emerald-700"
                href="/dashboard?section=earnings"
              >
                View earnings <ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
              </Link>
            </Card>
            <Card className="min-w-0 p-5">
              <p className="eyebrow">Reserved in withdrawals</p>
              <h3 className="my-2 text-2xl">
                <Money minor={reservedMinor} currency={currency} />
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">
                Reserved funds are not available for another request.
              </p>
            </Card>
            <Card className="min-w-0 p-5">
              <p className="eyebrow">Minimum request</p>
              <h3 className="my-2 text-2xl">
                <Money minor={policy?.minimum_amount_minor ?? "0"} currency={currency} />
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">
                {policy?.enabled
                  ? "Policy supplied by Cliqero."
                  : "Withdrawals are currently disabled."}
              </p>
            </Card>
          </div>
          <Card className="min-w-0 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3>Request a withdrawal</h3>
              <Badge variant={policy?.enabled ? "default" : "secondary"}>
                {policy?.enabled ? "Available" : "Disabled"}
              </Badge>
            </div>
            <form className="grid max-w-2xl gap-3" onSubmit={submit}>
              <Label htmlFor="withdrawal-amount">Amount (USD)</Label>
              <Input
                id="withdrawal-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={!policy?.enabled || submitting}
              />
              <span className="text-xs text-slate-500">
                Minimum {formatMinorUsd(policy?.minimum_amount_minor ?? "0")}
                {policy?.maximum_amount_minor
                  ? ` · Maximum ${formatMinorUsd(policy.maximum_amount_minor)}`
                  : ""}
              </span>
              <Label htmlFor="withdrawal-destination">Payout destination reference</Label>
              <Input
                id="withdrawal-destination"
                placeholder="Your saved or provider-approved reference"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                disabled={!policy?.enabled || submitting}
              />
              <span className="text-xs text-slate-500">
                This milestone uses the existing provider-neutral manual destination.
              </span>
              <Button type="submit" disabled={!policy?.enabled || submitting}>
                {submitting ? "Submitting…" : "Request withdrawal"}
              </Button>
            </form>
          </Card>
          <Card className="min-w-0 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3>Withdrawal history</h3>
              {page?.withdrawals.length ? (
                <Badge variant="destructive">{page.withdrawals.length}</Badge>
              ) : null}
            </div>
            {page?.withdrawals.length ? (
              <div className="grid gap-2">
                {page.withdrawals.map((withdrawal) => (
                  <WithdrawalRow key={withdrawal.id} withdrawal={withdrawal} onCancel={cancel} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No withdrawals yet"
                description="Your payout requests will appear here after you submit one."
              />
            )}
          </Card>
        </>
      )}
    </section>
  );
}

function WithdrawalRow({
  withdrawal,
  onCancel,
}: {
  withdrawal: Withdrawal;
  onCancel: (withdrawal: Withdrawal) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-slate-200 py-4 last:border-0">
      <div className="grid min-w-0 gap-1">
        <strong>
          <Money minor={withdrawal.amount_minor} currency={withdrawal.currency} />
        </strong>
        <span className="break-words text-sm text-slate-500">
          {withdrawal.destination_type === "manual" ? "Manual destination" : "Bank destination"} ·{" "}
          {withdrawal.destination_summary}
        </span>
        <small className="text-xs text-slate-500">
          {new Date(withdrawal.created_at).toLocaleDateString()}
        </small>
      </div>
      <div className="grid justify-items-end gap-2">
        <Badge
          variant={
            stateTone(withdrawal.state) === "success"
              ? "default"
              : stateTone(withdrawal.state) === "accent"
                ? "destructive"
                : "secondary"
          }
        >
          {stateLabel(withdrawal.state)}
        </Badge>
        {withdrawal.reason && (
          <span className="max-w-48 break-words text-right text-xs text-slate-500">
            {withdrawal.reason}
          </span>
        )}
        {withdrawal.state === "requested" && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onCancel(withdrawal)}>
            Cancel request
          </Button>
        )}
      </div>
    </div>
  );
}
