"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  apiFetch,
  type OperatorDistributionDetail as DistributionDetail,
  type OperatorDistributionPage,
} from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Money } from "../money";
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
  const [history, setHistory] = useState(() => CursorHistory.firstPage());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const retryCursor = useRef<string | null>(null);
  async function load(cursor: string | null = null) {
    if (busy.current) return null;
    busy.current = true;
    retryCursor.current = cursor;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      if (cursor) params.set("cursor", cursor);
      const result = await apiFetch<OperatorDistributionPage>(
        `/api/operator/distributions?${params}`,
      );
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
  }
  useEffect(() => {
    // Read once on mount; changing filters is an explicit operator action.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function next() {
    const cursor = page?.nextCursor;
    if (!cursor || busy.current) return;
    if (await load(cursor)) setHistory((current) => current.afterNext(cursor));
  }
  async function previous() {
    if (!history.hasPrevious || busy.current) return;
    if (await load(history.previous)) setHistory((current) => current.afterPrevious());
  }
  return (
    <OperatorPage>
      <OperatorPageHeader
        eyebrow="Accounting inspection"
        title="Distributions"
        description="Read-only purchase distribution facts: actual referral commissions and the platform remainder. Historical records are never recalculated here."
      />
      <OperatorToolbar
        onSubmit={(event) => {
          event.preventDefault();
          void load(null);
        }}
        actions={
          <Button type="submit" variant="secondary" disabled={loading}>
            Apply
          </Button>
        }
      >
        <OperatorFilterField label="Search distributions" htmlFor="distribution-search">
          <Input
            id="distribution-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Distribution, purchase, buyer, or listing"
          />
        </OperatorFilterField>
      </OperatorToolbar>
      {error && <OperatorErrorState message={error} retry={() => void load(retryCursor.current)} />}
      <OperatorSection
        title="Distribution ledger"
        description="Financial history is immutable; use inspection to review its persisted facts."
      >
        {loading && !page ? (
          <OperatorLoadingState variant="table" columns={6} />
        ) : page?.items.length ? (
          <OperatorTableSurface
            footer={
              <OperatorPagination
                hasPrevious={history.hasPrevious && !loading}
                hasNext={Boolean(page.nextCursor) && !loading}
                onPrevious={() => void previous()}
                onNext={() => void next()}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing / purchase</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Beneficiaries</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <OperatorPrimaryCell
                        title={item.listingTitle}
                        subtitle={`Purchase ${item.purchaseId}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/operator/users/${item.buyer.id}`}>@{item.buyer.username}</Link>
                    </TableCell>
                    <TableCell>{item.beneficiaryCount}</TableCell>
                    <TableCell>
                      <OperatorStatusCell status="completed" />
                    </TableCell>
                    <TableCell>
                      <OperatorValueCell>
                        <Money minor={item.grossAmountMinor} />
                      </OperatorValueCell>
                    </TableCell>
                    <TableCell>
                      <OperatorActionCell>
                        <OperatorActionsMenu
                          actions={[
                            {
                              type: "link",
                              label: "Inspect distribution",
                              href: `/operator/distributions/${item.id}`,
                            },
                            {
                              type: "link",
                              label: "View buyer",
                              href: `/operator/users/${item.buyer.id}`,
                            },
                          ]}
                          label={`Actions for distribution ${item.id}`}
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
            title="No distributions found"
            description="Completed purchase distributions will appear here when the worker records them."
          />
        )}
      </OperatorSection>
    </OperatorPage>
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
      <OperatorPage>
        <OperatorLoadingState variant="section" label="Loading distribution detail" />
      </OperatorPage>
    );
  if (!distribution)
    return (
      <OperatorPage>
        <OperatorErrorState
          title="Distribution unavailable"
          message={error || "This distribution was not found."}
        />
      </OperatorPage>
    );
  return (
    <OperatorPage>
      <OperatorPageHeader
        eyebrow="Distribution fact"
        title={distribution.listingTitle}
        description={distribution.id}
        actions={<OperatorStatusCell status="completed" />}
      />
      {error && <OperatorErrorState message={error} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <OperatorSection title="Purchase" surface>
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
                  @{distribution.buyer.username}
                </Link>
                <br />
                <small className="break-value">
                  {distribution.buyer.email ?? "No authentication email"}
                </small>
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
        </OperatorSection>
        <OperatorSection title="Platform allocation" surface>
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
        </OperatorSection>
      </div>
      <OperatorSection title="Referral attribution" surface>
        {distribution.attribution.referrer ? (
          <p className="panel-intro">
            Promoted by{" "}
            <Link href={`/operator/users/${distribution.attribution.referrer.id}`}>
              @{distribution.attribution.referrer.username}
            </Link>{" "}
          </p>
        ) : (
          <p className="panel-intro">No referral attribution was recorded for this purchase.</p>
        )}
      </OperatorSection>
      <OperatorSection title="Applied commission policy snapshot" surface>
        <pre className="operator-json-value">
          {JSON.stringify(distribution.policySnapshot, null, 2)}
        </pre>
      </OperatorSection>
      <OperatorSection title="Actual referral allocations" surface>
        {distribution.allocations.length ? (
          <div className="operator-distribution-allocation-list">
            {distribution.allocations.map((allocation) => (
              <div className="operator-distribution-allocation" key={allocation.id}>
                <div>
                  <strong>
                    <Link href={`/operator/users/${allocation.account.id}`}>
                      @{allocation.account.username}
                    </Link>
                  </strong>
                  <span>
                    Level {allocation.level ?? "—"} · {stateLabel(allocation.entryType)} ·{" "}
                    {formatDate(allocation.createdAt)}
                  </span>
                </div>
                <div>
                  <OperatorStatusCell
                    status={allocation.balanceState}
                    label={stateLabel(allocation.balanceState)}
                  />
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
          <OperatorEmptyState
            title="No referral commissions"
            description="This distribution is valid with no qualifying referral commission allocations."
          />
        )}
        {distribution.reversal && (
          <p className="panel-note">
            Reversal {distribution.reversal.state}: {distribution.reversal.reason}
          </p>
        )}
      </OperatorSection>
      <Button asChild variant="secondary">
        <Link href="/operator/distributions">Back to distributions</Link>
      </Button>
    </OperatorPage>
  );
}
