"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiFetch,
  type OperatorFunding,
  type OperatorFundingDetail as FundingDetail,
  type OperatorFundingPage,
  type OperatorFundingState,
} from "@/lib/api-client";
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton, Toast } from "./ui";
import { Money } from "./money";

const states: Array<{ value: OperatorFundingState; label: string }> = [
  { value: "initialization_pending", label: "Initialization pending" },
  { value: "initializing", label: "Initializing" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "verification_pending", label: "Verification pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "failed", label: "Failed" },
  { value: "blocked", label: "Blocked" },
  { value: "reconciliation_pending", label: "Reconciliation pending" },
];

function stateLabel(state: OperatorFundingState) {
  return states.find((item) => item.value === state)?.label ?? state;
}

function stateTone(state: OperatorFundingState): "neutral" | "accent" | "success" {
  if (state === "confirmed") return "success";
  if (state === "failed" || state === "blocked" || state === "reconciliation_pending")
    return "accent";
  return "neutral";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Funding data is temporarily unavailable.";
}

export function OperatorFundingList() {
  const [page, setPage] = useState<OperatorFundingPage | null>(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<OperatorFundingState | "">("");
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(cursor?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      if (state) params.set("state", state);
      if (provider.trim()) params.set("provider", provider.trim());
      if (cursor) params.set("cursor", cursor);
      setPage(await apiFetch<OperatorFundingPage>(`/api/operator/funding?${params}`));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // The first read is intentionally explicit; filters are submitted by the operator.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="operator-funding-page">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Funding operations</p>
          <h2 id="operator-funding-heading">Wallet funding</h2>
          <p className="panel-intro">
            Inspect provider-backed wallet funding without changing financial facts or confirming
            payments manually.
          </p>
        </div>
      </div>
      <Card className="operator-funding-toolbar">
        <form
          className="operator-funding-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label>
            Search funding, reference, or account
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Funding ID, provider reference, handle, email"
            />
          </label>
          <label>
            State
            <Select
              value={state}
              onChange={(event) => setState(event.target.value as OperatorFundingState | "")}
            >
              <option value="">All states</option>
              {states.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Provider
            <Input
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              placeholder="development"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? "Loading…" : "Apply filters"}
          </Button>
        </form>
      </Card>
      {error && <Toast>{error}</Toast>}
      {loading && !page ? (
        <div className="operator-funding-list" aria-label="Loading funding">
          {[1, 2, 3].map((item) => (
            <Card key={item}>
              <Skeleton className="operator-funding-skeleton" />
            </Card>
          ))}
        </div>
      ) : page?.items.length ? (
        <>
          <div className="operator-funding-list">
            {page.items.map((funding) => (
              <FundingRow funding={funding} key={funding.id} />
            ))}
          </div>
          {page.nextCursor && (
            <Button
              variant="secondary"
              onClick={() => void load(page.nextCursor)}
              disabled={loading}
            >
              {loading ? "Loading…" : "Next page"}
            </Button>
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            title="No funding transactions found"
            description="Try a different search or state filter. Empty results do not indicate a funding failure."
          />
        </Card>
      )}
    </div>
  );
}

function FundingRow({ funding }: { funding: OperatorFunding }) {
  return (
    <Card className="operator-funding-row">
      <div className="operator-funding-row-main">
        <div className="operator-funding-identity">
          <strong>@{funding.account.handle}</strong>
          <span>{funding.account.email}</span>
          <Link href={`/operator/users/${funding.account.id}`}>View account</Link>
        </div>
        <div className="operator-funding-amounts">
          <span>
            <small>Canonical USD</small>
            <Money minor={funding.canonicalAmountMinor} />
          </span>
          <span>
            <small>Collected</small>
            <Money minor={funding.collectionAmountMinor} currency={funding.collectionCurrency} />
          </span>
        </div>
      </div>
      <div className="operator-funding-row-meta">
        <Badge tone={stateTone(funding.state)}>{stateLabel(funding.state)}</Badge>
        <span>{funding.provider}</span>
        <span className="break-value">{funding.providerReference}</span>
        <span>Credit: {funding.walletCredit ? funding.walletCredit.state : "none"}</span>
        <Link className="button button-ghost" href={`/operator/funding/${funding.id}`}>
          Inspect
        </Link>
      </div>
    </Card>
  );
}

export function OperatorFundingDetail({ fundingId }: { fundingId: string }) {
  const [funding, setFunding] = useState<FundingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setFunding(await apiFetch<FundingDetail>(`/api/operator/funding/${fundingId}`));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Detail always reconstructs from persisted funding facts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundingId]);

  async function copyReference() {
    if (!funding) return;
    try {
      await navigator.clipboard?.writeText(funding.providerReference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Provider reference could not be copied. Select it manually.");
    }
  }

  if (loading && !funding)
    return (
      <Card aria-label="Loading funding detail">
        <Skeleton className="operator-funding-detail-skeleton" />
      </Card>
    );
  if (!funding)
    return (
      <Card>
        <EmptyState
          title="Funding unavailable"
          description={error || "This funding record was not found."}
        />
      </Card>
    );

  return (
    <div className="operator-funding-detail">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Funding fact</p>
          <h2>Wallet funding inspection</h2>
          <p className="panel-intro break-value">{funding.id}</p>
        </div>
        <Badge tone={stateTone(funding.state)}>{stateLabel(funding.state)}</Badge>
      </div>
      {error && <Toast>{error}</Toast>}
      <div className="operator-funding-detail-grid">
        <Card>
          <h3>Funding fact</h3>
          <dl className="detail-list">
            <div>
              <dt>Account</dt>
              <dd>
                <Link href={`/operator/users/${funding.account.id}`}>
                  @{funding.account.handle}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd className="break-value">{funding.account.email}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{funding.provider}</dd>
            </div>
            <div>
              <dt>Provider reference</dt>
              <dd className="operator-funding-reference">
                <span className="break-value">{funding.providerReference}</span>
                <Button variant="ghost" onClick={() => void copyReference()}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(funding.createdAt)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDate(funding.updatedAt)}</dd>
            </div>
            <div>
              <dt>Confirmed</dt>
              <dd>{formatDate(funding.confirmedAt)}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <h3>Amounts</h3>
          <dl className="detail-list">
            <div>
              <dt>Canonical amount</dt>
              <dd>
                <Money minor={funding.canonicalAmountMinor} />
              </dd>
            </div>
            <div>
              <dt>Collection amount</dt>
              <dd>
                <Money
                  minor={funding.collectionAmountMinor}
                  currency={funding.collectionCurrency}
                />
              </dd>
            </div>
            <div>
              <dt>Collection currency</dt>
              <dd>{funding.collectionCurrency}</dd>
            </div>
          </dl>
          <h3>Wallet consequence</h3>
          {funding.walletCredit ? (
            <p className="operator-funding-credit-status">
              <Badge tone={funding.walletCredit.state === "available" ? "success" : "neutral"}>
                {funding.walletCredit.state}
              </Badge>{" "}
              credit · <Money minor={funding.walletCredit.amountMinor} />
              {funding.walletCredit.availableAt &&
                ` · available ${formatDate(funding.walletCredit.availableAt)}`}
            </p>
          ) : (
            <p className="panel-intro">No wallet credit has been created.</p>
          )}
        </Card>
      </div>
      {funding.conversionSnapshot && (
        <Card>
          <h3>Conversion snapshot</h3>
          <dl className="detail-list">
            <div>
              <dt>Pair</dt>
              <dd>
                {funding.conversionSnapshot.fromCurrency} → {funding.conversionSnapshot.toCurrency}
              </dd>
            </div>
            <div>
              <dt>Quoted rate</dt>
              <dd className="break-value">{funding.conversionSnapshot.rate}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{funding.conversionSnapshot.source}</dd>
            </div>
            <div>
              <dt>Source date</dt>
              <dd>{funding.conversionSnapshot.sourceDate}</dd>
            </div>
            <div>
              <dt>Observed</dt>
              <dd>{formatDate(funding.conversionSnapshot.observedAt)}</dd>
            </div>
          </dl>
        </Card>
      )}
      <Card>
        <h3>Provider initialization</h3>
        <p className="panel-intro">
          {funding.providerInitialization?.authorizationUrl
            ? "An authorization URL was persisted for the provider flow. It is intentionally not exposed as an operator action."
            : "No provider authorization URL is persisted."}
        </p>
      </Card>
      <Card>
        <h3>Provider operations</h3>
        {funding.operations.length ? (
          <div className="operator-funding-operation-list">
            {funding.operations.map((operation) => (
              <div className="operator-funding-operation" key={operation.id}>
                <div>
                  <strong>{operation.operation}</strong>
                  <span>{formatDate(operation.occurredAt)}</span>
                </div>
                <Badge tone={operation.outcome === "succeeded" ? "success" : "accent"}>
                  {operation.outcome}
                </Badge>
                <p>{operation.providerMessage || operation.failureKind || "No provider message"}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel-intro">No provider operations recorded.</p>
        )}
      </Card>
      <Card>
        <h3>Provider events</h3>
        {funding.events.length ? (
          <div className="operator-funding-operation-list">
            {funding.events.map((event) => (
              <div className="operator-funding-operation" key={event.id}>
                <div>
                  <strong>{event.eventType}</strong>
                  <span>{formatDate(event.receivedAt)}</span>
                </div>
                <Badge
                  tone={
                    event.state === "processed"
                      ? "success"
                      : event.state === "rejected"
                        ? "accent"
                        : "neutral"
                  }
                >
                  {event.state}
                </Badge>
                <p>{event.lastError || `Outbox: ${event.outboxState || "not recorded"}`}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel-intro">No correlated provider events recorded.</p>
        )}
      </Card>
      <Button variant="secondary" onClick={() => void load()} disabled={loading}>
        {loading ? "Refreshing…" : "Refresh detail"}
      </Button>
    </div>
  );
}
