"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiFetch, type OperatorEarningsPage } from "@/lib/api-client";
import { Money } from "../money";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
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
import { OperatorMetricCard } from "./ui/metric-card";
import { OperatorPage, OperatorPageHeader } from "./ui/page";
import { OperatorPagination } from "./ui/pagination";
import { OperatorSection } from "./ui/section";
import { OperatorTableSurface } from "./ui/table-surface";
import { OperatorFilterField, OperatorToolbar } from "./ui/toolbar";

const formatDate = (value: string) => new Date(value).toLocaleString();
const label = (value: string) =>
  value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Earnings data is temporarily unavailable.";

export function OperatorEarningsList() {
  const [page, setPage] = useState<OperatorEarningsPage | null>(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
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
      if (state) params.set("state", state);
      if (cursor) params.set("cursor", cursor);
      const next = await apiFetch<OperatorEarningsPage>(`/api/operator/earnings?${params}`);
      setPage(next);
      if (!cursor) setHistory(CursorHistory.firstPage());
      return next;
    } catch (cause) {
      setError(errorMessage(cause));
      return null;
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // Initial load intentionally captures the initial (empty) filters only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilters() {
    if (busy.current) return;
    const result = await load();
    if (result) setHistory(CursorHistory.firstPage());
  }
  async function next() {
    const cursor = page?.nextCursor;
    if (!cursor || busy.current) return;
    if (await load(cursor)) setHistory((value) => value.afterNext(cursor));
  }
  async function previous() {
    if (!history.hasPrevious || busy.current) return;
    if (await load(history.previous)) setHistory((value) => value.afterPrevious());
  }

  return (
    <OperatorPage>
      <OperatorPageHeader
        eyebrow="Ledger inspection"
        title="User earnings"
        description="Append-only referral commission facts, separated from buyer wallet funds. Reads never settle or mutate entries."
      />
      {page && (
        <div className="grid gap-3 sm:grid-cols-3">
          <OperatorMetricCard
            label="Pending earnings"
            value={<Money minor={page.totals.pendingMinor} />}
            detail="Awaiting settlement or maturation."
          />
          <OperatorMetricCard
            label="Available earnings"
            value={<Money minor={page.totals.availableMinor} />}
            detail="Ledger projection available for withdrawal."
          />
          <OperatorMetricCard
            label="Withdrawal reservations"
            value={<Money minor={page.totals.reservedMinor} />}
            detail="Active reservations; completed withdrawals are not active."
          />
        </div>
      )}
      <OperatorToolbar
        onSubmit={(event) => {
          event.preventDefault();
          void applyFilters();
        }}
        actions={
          <Button type="submit" variant="secondary" disabled={loading}>
            Apply filters
          </Button>
        }
      >
        <OperatorFilterField label="Search account or entry" htmlFor="earnings-search">
          <Input
            id="earnings-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Username, email, purchase, entry"
          />
        </OperatorFilterField>
        <OperatorFilterField label="State" htmlFor="earnings-state">
          <Select
            id="earnings-state"
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="">All states</option>
            <option value="pending">Pending</option>
            <option value="available">Available</option>
            <option value="reversed">Reversed</option>
          </Select>
        </OperatorFilterField>
      </OperatorToolbar>
      {error && <OperatorErrorState message={error} retry={() => void load(retryCursor.current)} />}
      <OperatorSection
        title="Earnings ledger"
        description="Persisted financial facts are read-only here."
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
                  <TableHead>Account</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <OperatorPrimaryCell
                        title={
                          <Link href={`/operator/users/${entry.account.id}`}>
                            @{entry.account.username}
                          </Link>
                        }
                        subtitle={entry.account.email ?? entry.account.id}
                      />
                    </TableCell>
                    <TableCell>
                      <OperatorPrimaryCell
                        title={label(entry.entryType)}
                        subtitle={
                          entry.level
                            ? `Referral level ${entry.level}`
                            : entry.purchaseId
                              ? `Purchase ${entry.purchaseId}`
                              : entry.id
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <OperatorStatusCell status={entry.balanceState} />
                    </TableCell>
                    <TableCell>{formatDate(entry.createdAt)}</TableCell>
                    <TableCell>
                      <OperatorValueCell>
                        <Money
                          minor={
                            entry.direction === "debit"
                              ? `-${entry.amountMinor}`
                              : entry.amountMinor
                          }
                        />
                      </OperatorValueCell>
                    </TableCell>
                    <TableCell>
                      <OperatorActionCell>
                        <OperatorActionsMenu
                          actions={[
                            {
                              type: "link",
                              label: "View account",
                              href: `/operator/users/${entry.account.id}`,
                            },
                            ...(entry.distributionId
                              ? [
                                  {
                                    type: "link" as const,
                                    label: "View distribution",
                                    href: `/operator/distributions/${entry.distributionId}`,
                                  },
                                ]
                              : []),
                          ]}
                          label={`Actions for earning ${entry.id}`}
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
            title="No referral earnings found"
            description="Referral commission ledger entries will appear after qualifying distributions."
          />
        )}
      </OperatorSection>
    </OperatorPage>
  );
}
