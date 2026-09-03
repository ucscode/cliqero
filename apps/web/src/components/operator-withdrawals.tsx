"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiFetch,
  formatMinorUsd,
  type OperatorWithdrawal,
  type OperatorWithdrawalDetail as Detail,
  type OperatorWithdrawalPage,
  type OperatorWithdrawalState,
} from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";

const states: Array<[OperatorWithdrawalState, string]> = [
  ["requested", "Requested"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["cancelled", "Cancelled"],
  ["completed", "Completed"],
  ["failed", "Failed"],
];
const tone = (state: OperatorWithdrawalState): "neutral" | "accent" | "success" =>
  state === "completed"
    ? "success"
    : state === "rejected" || state === "cancelled" || state === "failed"
      ? "accent"
      : "neutral";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Withdrawal data is temporarily unavailable.";

export function OperatorWithdrawalList() {
  const [page, setPage] = useState<OperatorWithdrawalPage | null>(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<OperatorWithdrawalState | "">("");
  const [attention, setAttention] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function load(cursor?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      if (state) params.set("state", state);
      if (attention) params.set("attention", attention);
      if (cursor) params.set("cursor", cursor);
      setPage(await apiFetch<OperatorWithdrawalPage>(`/api/operator/withdrawals?${params}`));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="operator-withdrawals-page">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Payout operations</p>
          <h2>Withdrawal requests</h2>
          <p className="panel-intro">
            Review reservations and observe payout execution. Financial facts remain immutable.
          </p>
        </div>
      </div>
      <Card>
        <form
          className="operator-funding-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <label>
            Search account, withdrawal, or destination
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ID, handle, email, reference"
            />
          </label>
          <label>
            State
            <Select
              value={state}
              onChange={(e) => setState(e.target.value as OperatorWithdrawalState | "")}
            >
              <option value="">All states</option>
              {states.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Attention
            <Select value={attention} onChange={(e) => setAttention(e.target.value)}>
              <option value="">All attention</option>
              <option value="review">Needs review</option>
              <option value="payout">Needs payout</option>
              <option value="reconciliation">Reconciliation</option>
              <option value="retry">Retry eligible</option>
              <option value="retry_wait">Retry waiting</option>
            </Select>
          </label>
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? "Loading…" : "Apply filters"}
          </Button>
        </form>
      </Card>
      {error && <Toast>{error}</Toast>}
      {loading && !page ? (
        <Card>
          <Skeleton className="operator-funding-detail-skeleton" />
        </Card>
      ) : page?.items.length ? (
        <>
          <div className="operator-withdrawal-list">
            {page.items.map((item) => (
              <WithdrawalRow key={item.id} item={item} />
            ))}
          </div>
          {page.nextCursor && (
            <Button
              variant="secondary"
              onClick={() => void load(page.nextCursor)}
              disabled={loading}
            >
              Next page
            </Button>
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            title="No withdrawal requests found"
            description="Try another search or filter."
          />
        </Card>
      )}
    </div>
  );
}

function WithdrawalRow({ item }: { item: OperatorWithdrawal }) {
  return (
    <Card className="operator-withdrawal-row">
      <div>
        <strong>@{item.account.handle}</strong>
        <span className="operator-withdrawal-email">{item.account.email}</span>
        <Link href={`/operator/users/${item.account.id}`}>View account</Link>
      </div>
      <div className="operator-withdrawal-amount">
        <small>Amount</small>
        <strong>{formatMinorUsd(item.amountMinor)}</strong>
      </div>
      <div className="operator-funding-row-meta">
        <Badge tone={tone(item.state)}>
          {states.find(([value]) => value === item.state)?.[1] ?? item.state}
        </Badge>
        <span>Reservation: {item.reservation?.state ?? "missing"}</span>
        <span>Payout: {item.payout?.state ?? "not started"}</span>
        <span>{item.attention === "none" ? "No action" : item.attention.replace("_", " ")}</span>
        <Button asChild variant="ghost">
          <Link href={`/operator/withdrawals/${item.id}`}>Inspect</Link>
        </Button>
      </div>
    </Card>
  );
}

export function OperatorWithdrawalDetail({ withdrawalId }: { withdrawalId: string }) {
  const [item, setItem] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItem(await apiFetch<Detail>(`/api/operator/withdrawals/${withdrawalId}`));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawalId]);
  async function act(action: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/operator/withdrawals/${withdrawalId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  if (loading && !item)
    return (
      <Card>
        <Skeleton className="operator-funding-detail-skeleton" />
      </Card>
    );
  if (!item)
    return (
      <Card>
        <EmptyState
          title="Withdrawal unavailable"
          description={error ?? "This withdrawal was not found."}
        />
      </Card>
    );
  return (
    <div className="operator-withdrawal-detail">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Withdrawal fact</p>
          <h2>{formatMinorUsd(item.amountMinor)} withdrawal</h2>
          <p className="panel-intro break-value">{item.id}</p>
        </div>
        <Badge tone={tone(item.state)}>{item.state}</Badge>
      </div>
      {error && <Toast>{error}</Toast>}
      <div className="operator-detail-grid">
        <Card>
          <h3>Account</h3>
          <p>
            <strong>@{item.account.handle}</strong>
            <br />
            {item.account.email}
          </p>
          <Link href={`/operator/users/${item.account.id}`}>View account</Link>
        </Card>
        <Card>
          <h3>Destination</h3>
          <p>
            {item.destination.type} · {item.destination.summary}
          </p>
          <p className="panel-intro">Raw destination references are intentionally masked.</p>
        </Card>
        <Card>
          <h3>Reservation</h3>
          <p>
            {item.reservation
              ? `${item.reservation.state} · ${formatMinorUsd(item.reservation.amountMinor)}`
              : "No reservation record"}
          </p>
        </Card>
        <Card>
          <h3>Payout execution</h3>
          <p>{item.payout ? `${item.payout.provider} · ${item.payout.state}` : "Not started"}</p>
          {item.payout && (
            <p>
              Attempts: {item.payout.attemptCount}
              <br />
              Provider reference: {item.payout.providerReference ?? "—"}
              <br />
              Next retry:{" "}
              {item.payout.nextAttemptAt
                ? new Date(item.payout.nextAttemptAt).toLocaleString()
                : "—"}
              <br />
              Last error: {item.payout.lastError ?? "—"}
            </p>
          )}
        </Card>
      </div>
      <Card>
        <h3>Actions</h3>
        <div className="operator-action-row">
          {item.state === "requested" && (
            <Button disabled={busy} onClick={() => void act("approve")}>
              Approve
            </Button>
          )}
          {(item.state === "requested" || item.state === "approved") && !item.payout ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim()) void act("reject", { reason });
              }}
            >
              <Input
                aria-label="Rejection reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for rejection"
              />
              <Button variant="secondary" disabled={busy || reason.trim().length < 3}>
                Reject
              </Button>
            </form>
          ) : null}
          {item.state === "approved" &&
            (!item.payout || item.payout.state === "ready" || item.payout.state === "failed") && (
              <Button
                disabled={
                  busy ||
                  (item.payout?.nextAttemptAt
                    ? new Date(item.payout.nextAttemptAt) > new Date()
                    : false)
                }
                onClick={() => void act("payout")}
              >
                {item.payout?.state === "failed" ? "Retry payout" : "Execute payout"}
              </Button>
            )}
          {item.state === "approved" && !item.payout && (
            <Button variant="secondary" disabled={busy} onClick={() => void act("complete")}>
              Confirm manual payout completed
            </Button>
          )}
          {item.payout?.state === "unknown" && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void act("payout/reconcile")}
            >
              Reconcile payout
            </Button>
          )}
        </div>
        <p className="panel-intro">
          Unknown or pending provider results remain reserved and require reconciliation; they are
          never resubmitted.
        </p>
      </Card>
      <Card>
        <h3>Attempt history</h3>
        {item.attempts.length ? (
          <div className="operator-attempt-list">
            {item.attempts.map((attempt) => (
              <div key={attempt.id}>
                <strong>Attempt {attempt.number}</strong>
                <span>
                  {attempt.provider} · {attempt.state} · {attempt.failureCategory ?? "—"}
                </span>
                <span>{attempt.providerReference ?? "No provider reference"}</span>
                <span>{attempt.failureReason ?? ""}</span>
              </div>
            ))}
          </div>
        ) : (
          <p>No payout attempts yet.</p>
        )}
      </Card>
    </div>
  );
}
