"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiFetch,
  type OperatorDistribution,
  type OperatorDistributionDetail as DistributionDetail,
  type OperatorDistributionPage,
} from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { Money } from "./money";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Distribution data is temporarily unavailable.";
}
function stateLabel(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function OperatorDistributionList() {
  const [page, setPage] = useState<OperatorDistributionPage | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function load(cursor?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      if (cursor) params.set("cursor", cursor);
      setPage(await apiFetch<OperatorDistributionPage>(`/api/operator/distributions?${params}`));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // Read once on mount; changing filters is an explicit operator action.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="operator-distributions-page">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Accounting inspection</p>
          <h2>Distributions</h2>
          <p className="panel-intro">
            Read-only purchase distribution facts: actual referral commissions and the platform
            remainder. Historical records are never recalculated here.
          </p>
        </div>
      </div>
      <Card className="operator-distributions-toolbar">
        <form
          className="operator-distributions-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label>
            Search distributions
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Distribution, purchase, buyer, or listing"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? "Loading…" : "Search"}
          </Button>
        </form>
      </Card>
      {error && <Toast>{error}</Toast>}
      {loading && !page ? (
        <div className="operator-distribution-list" aria-label="Loading distributions">
          {[1, 2, 3].map((item) => (
            <Card key={item}>
              <Skeleton className="operator-funding-skeleton" />
            </Card>
          ))}
        </div>
      ) : page?.items.length ? (
        <>
          <div className="operator-distribution-list">
            {page.items.map((item) => (
              <DistributionRow distribution={item} key={item.id} />
            ))}
          </div>
          {page.nextCursor && (
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => void load(page.nextCursor)}
            >
              {loading ? "Loading…" : "Next page"}
            </Button>
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            title="No distributions found"
            description="Completed purchase distributions will appear here when the worker records them."
          />
        </Card>
      )}
    </div>
  );
}

function DistributionRow({ distribution }: { distribution: OperatorDistribution }) {
  return (
    <Card className="operator-distribution-row">
      <div className="operator-distribution-row-main">
        <div className="operator-distribution-identity">
          <strong>{distribution.listingTitle}</strong>
          <span>
            Purchase <span className="break-value">{distribution.purchaseId}</span>
          </span>
          <Link href={`/operator/users/${distribution.buyer.id}`}>
            @{distribution.buyer.handle}
          </Link>
        </div>
        <div className="operator-distribution-amounts">
          <span>
            <small>Gross USD</small>
            <Money minor={distribution.grossAmountMinor} />
          </span>
          <span>
            <small>Referral commissions</small>
            <Money minor={distribution.referralAllocatedMinor} />
          </span>
        </div>
      </div>
      <div className="operator-distribution-row-meta">
        <Badge variant="default">Completed</Badge>
        <span>{distribution.beneficiaryCount} beneficiary(ies)</span>
        <span>
          Platform remainder <Money minor={distribution.platformRemainderMinor} />
        </span>
        <Button asChild variant="ghost">
          <Link href={`/operator/distributions/${distribution.id}`}>Inspect</Link>
        </Button>
      </div>
    </Card>
  );
}

export function OperatorDistributionDetail({ distributionId }: { distributionId: string }) {
  const [distribution, setDistribution] = useState<DistributionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Detail reconstructs from persisted distribution, purchase, ledger and settlement facts.
    void apiFetch<DistributionDetail>(`/api/operator/distributions/${distributionId}`)
      .then(setDistribution)
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, [distributionId]);
  if (loading && !distribution)
    return (
      <Card aria-label="Loading distribution detail">
        <Skeleton className="operator-funding-detail-skeleton" />
      </Card>
    );
  if (!distribution)
    return (
      <Card>
        <EmptyState
          title="Distribution unavailable"
          description={error || "This distribution was not found."}
        />
      </Card>
    );
  return (
    <div className="operator-distribution-detail">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Distribution fact</p>
          <h2>{distribution.listingTitle}</h2>
          <p className="panel-intro break-value">{distribution.id}</p>
        </div>
        <Badge variant="default">Completed</Badge>
      </div>
      {error && <Toast>{error}</Toast>}
      <div className="operator-detail-grid">
        <Card>
          <h3>Purchase</h3>
          <dl className="detail-list">
            <div>
              <dt>Listing</dt>
              <dd>
                <Link href={`/operator/catalogue/${distribution.listingId}`}>
                  {distribution.listingTitle}
                </Link>
                <br />
                <small className="break-value">{distribution.listingId}</small>
              </dd>
            </div>
            <div>
              <dt>Buyer</dt>
              <dd>
                <Link href={`/operator/users/${distribution.buyer.id}`}>
                  @{distribution.buyer.handle}
                </Link>
                <br />
                <small className="break-value">{distribution.buyer.email}</small>
              </dd>
            </div>
            <div>
              <dt>Purchase state</dt>
              <dd>{stateLabel(distribution.purchaseState)}</dd>
            </div>
            <div>
              <dt>Purchased</dt>
              <dd>{formatDate(distribution.purchaseCreatedAt)}</dd>
            </div>
            <div>
              <dt>Gross amount</dt>
              <dd>
                <Money minor={distribution.grossAmountMinor} />
              </dd>
            </div>
          </dl>
        </Card>
        <Card>
          <h3>Platform allocation</h3>
          <dl className="detail-list">
            <div>
              <dt>Referral commissions</dt>
              <dd>
                <Money minor={distribution.referralAllocatedMinor} />
              </dd>
            </div>
            <div>
              <dt>Platform remainder</dt>
              <dd>
                <Money minor={distribution.platformRemainderMinor} />
              </dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>{formatDate(distribution.completedAt)}</dd>
            </div>
            <div>
              <dt>Beneficiaries</dt>
              <dd>{distribution.beneficiaryCount}</dd>
            </div>
          </dl>
          <p className="panel-note">
            The remainder includes missing-upline and integer-cent residue according to the
            persisted distribution facts.
          </p>
        </Card>
      </div>
      <Card>
        <h3>Referral attribution</h3>
        {distribution.attribution.referrer ? (
          <p className="panel-intro">
            Promoted by{" "}
            <Link href={`/operator/users/${distribution.attribution.referrer.id}`}>
              @{distribution.attribution.referrer.handle}
            </Link>{" "}
            · link {distribution.attribution.linkId || "not recorded"}
          </p>
        ) : (
          <p className="panel-intro">No referral attribution was recorded for this purchase.</p>
        )}
      </Card>
      <Card>
        <h3>Applied commission policy snapshot</h3>
        <pre className="operator-json-value">
          {JSON.stringify(distribution.policySnapshot, null, 2)}
        </pre>
      </Card>
      <Card>
        <h3>Actual referral allocations</h3>
        {distribution.allocations.length ? (
          <div className="operator-distribution-allocation-list">
            {distribution.allocations.map((allocation) => (
              <div className="operator-distribution-allocation" key={allocation.id}>
                <div>
                  <strong>
                    <Link href={`/operator/users/${allocation.account.id}`}>
                      @{allocation.account.handle}
                    </Link>
                  </strong>
                  <span>
                    Level {allocation.level ?? "—"} · {stateLabel(allocation.entryType)} ·{" "}
                    {formatDate(allocation.createdAt)}
                  </span>
                </div>
                <div>
                  <Badge
                    variant={
                      allocation.balanceState === "available"
                        ? "default"
                        : allocation.balanceState === "reversed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {stateLabel(allocation.balanceState)}
                  </Badge>
                  <Money
                    minor={
                      allocation.direction === "debit"
                        ? `-${allocation.amountMinor}`
                        : allocation.amountMinor
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No referral commissions"
            description="This distribution is valid with no qualifying referral commission allocations."
          />
        )}
        {distribution.reversal && (
          <p className="panel-note">
            Reversal {distribution.reversal.state}: {distribution.reversal.reason}
          </p>
        )}
      </Card>
      <Button asChild variant="secondary">
        <Link href="/operator/distributions">Back to distributions</Link>
      </Button>
    </div>
  );
}
