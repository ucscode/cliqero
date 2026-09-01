"use client";

import Link from "next/link";
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
import { Badge, Button, Card, EmptyState, Input, Money, Skeleton, Toast } from "./ui";

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
    <section className="withdrawals-panel" aria-labelledby="withdrawals-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Withdrawals</p>
          <h2 id="withdrawals-heading">Move available earnings</h2>
          <p className="panel-intro">
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
        <div className="withdrawal-summary-grid" aria-label="Loading withdrawals">
          <Skeleton className="withdrawal-summary-skeleton" />
          <Skeleton className="withdrawal-summary-skeleton" />
          <Skeleton className="withdrawal-form-skeleton" />
        </div>
      ) : (
        <>
          <div className="withdrawal-summary-grid">
            <Card className="withdrawal-summary-card">
              <p className="eyebrow">Available earnings</p>
              <h3>
                <Money minor={availableMinor} currency={currency} />
              </h3>
              <Link className="arrow-link" href="/dashboard?section=earnings">
                View earnings ↗
              </Link>
            </Card>
            <Card className="withdrawal-summary-card">
              <p className="eyebrow">Reserved in withdrawals</p>
              <h3>
                <Money minor={reservedMinor} currency={currency} />
              </h3>
              <p className="panel-note">Reserved funds are not available for another request.</p>
            </Card>
            <Card className="withdrawal-summary-card">
              <p className="eyebrow">Minimum request</p>
              <h3>
                <Money minor={policy?.minimum_amount_minor ?? "0"} currency={currency} />
              </h3>
              <p className="panel-note">
                {policy?.enabled
                  ? "Policy supplied by Cliqero."
                  : "Withdrawals are currently disabled."}
              </p>
            </Card>
          </div>
          <Card className="withdrawal-request-card">
            <div className="card-kicker">
              <h3>Request a withdrawal</h3>
              <Badge tone={policy?.enabled ? "success" : "neutral"}>
                {policy?.enabled ? "Available" : "Disabled"}
              </Badge>
            </div>
            <form className="withdrawal-form" onSubmit={submit}>
              <label htmlFor="withdrawal-amount">Amount (USD)</label>
              <Input
                id="withdrawal-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={!policy?.enabled || submitting}
              />
              <span className="field-help">
                Minimum {formatMinorUsd(policy?.minimum_amount_minor ?? "0")}
                {policy?.maximum_amount_minor
                  ? ` · Maximum ${formatMinorUsd(policy.maximum_amount_minor)}`
                  : ""}
              </span>
              <label htmlFor="withdrawal-destination">Payout destination reference</label>
              <Input
                id="withdrawal-destination"
                placeholder="Your saved or provider-approved reference"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                disabled={!policy?.enabled || submitting}
              />
              <span className="field-help">
                This milestone uses the existing provider-neutral manual destination.
              </span>
              <Button type="submit" disabled={!policy?.enabled || submitting}>
                {submitting ? "Submitting…" : "Request withdrawal"}
              </Button>
            </form>
          </Card>
          <Card className="withdrawal-history-card">
            <div className="card-kicker">
              <h3>Withdrawal history</h3>
              {page?.withdrawals.length ? (
                <Badge tone="accent">{page.withdrawals.length}</Badge>
              ) : null}
            </div>
            {page?.withdrawals.length ? (
              <div className="withdrawal-list">
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
    <div className="withdrawal-row">
      <div className="withdrawal-row-main">
        <strong>
          <Money minor={withdrawal.amount_minor} currency={withdrawal.currency} />
        </strong>
        <span>
          {withdrawal.destination_type === "manual" ? "Manual destination" : "Bank destination"} ·{" "}
          {withdrawal.destination_summary}
        </span>
        <small>{new Date(withdrawal.created_at).toLocaleDateString()}</small>
      </div>
      <div className="withdrawal-row-end">
        <Badge tone={stateTone(withdrawal.state)}>{stateLabel(withdrawal.state)}</Badge>
        {withdrawal.reason && <span className="withdrawal-reason">{withdrawal.reason}</span>}
        {withdrawal.state === "requested" && (
          <Button
            type="button"
            variant="ghost"
            className="button-small"
            onClick={() => onCancel(withdrawal)}
          >
            Cancel request
          </Button>
        )}
      </div>
    </div>
  );
}
