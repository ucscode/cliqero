"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  apiFetch,
  type OperatorFundingDetail as FundingDetail,
  type OperatorFundingPage,
  type OperatorFundingState,
} from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
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

const states: Array<{ value: OperatorFundingState; label: string }> = [
  { value: "initialization_pending", label: "Initialization pending" },
  { value: "initializing", label: "Initializing" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "verification_pending", label: "Verification pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "failed", label: "Failed" },
  { value: "blocked", label: "Blocked" },
  { value: "expired", label: "Expired" },
  { value: "reconciliation_pending", label: "Reconciliation pending" },
];

function stateLabel(state: OperatorFundingState) {
  return states.find((item) => item.value === state)?.label ?? state;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Funding data is temporarily unavailable.";
}

export type OperatorBankTransferEvidenceRow = { label: string; value: string };

export function operatorBankTransferEvidenceRows(
  evidence: FundingDetail["evidence"],
): OperatorBankTransferEvidenceRow[] {
  if (!evidence) return [];
  return [
    ...(evidence.transferReference
      ? [{ label: "Transfer reference", value: evidence.transferReference }]
      : []),
    ...(evidence.customerNote ? [{ label: "Customer note", value: evidence.customerNote }] : []),
    ...(evidence.proof
      ? [
          { label: "Proof file", value: evidence.proof.originalFilename ?? "Uploaded file" },
          { label: "Proof type", value: evidence.proof.mimeType },
          { label: "Proof size", value: `${evidence.proof.byteSize} bytes` },
        ]
      : []),
    { label: "Submitted", value: formatDate(evidence.createdAt) },
  ];
}

export function OperatorFundingList() {
  const [page, setPage] = useState<OperatorFundingPage | null>(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<OperatorFundingState | "">("");
  const [provider, setProvider] = useState("");
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
      if (provider.trim()) params.set("provider", provider.trim());
      if (cursor) params.set("cursor", cursor);
      const result = await apiFetch<OperatorFundingPage>(`/api/operator/funding?${params}`);
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
    // The first read is intentionally explicit; filters are submitted by the operator.
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
        eyebrow="Funding operations"
        title="Wallet funding"
        description="Inspect provider-backed wallet funding without changing financial facts or confirming payments manually."
      />
      <OperatorToolbar
        onSubmit={(event) => {
          event.preventDefault();
          void load(null);
        }}
        actions={
          <Button type="submit" variant="secondary" disabled={loading}>
            Apply filters
          </Button>
        }
      >
        <OperatorFilterField label="Funding, reference, or account" htmlFor="funding-search">
          <Input
            id="funding-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Funding ID, reference, username, email"
          />
        </OperatorFilterField>
        <OperatorFilterField label="State" htmlFor="funding-state">
          <Select
            id="funding-state"
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
        </OperatorFilterField>
        <OperatorFilterField label="Provider" htmlFor="funding-provider">
          <Input
            id="funding-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            placeholder="Provider name"
          />
        </OperatorFilterField>
      </OperatorToolbar>
      {error && <OperatorErrorState message={error} retry={() => void load(retryCursor.current)} />}
      <OperatorSection
        title="Funding records"
        description="Provider facts, evidence, and wallet-credit state are inspected without deleting financial history."
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
                  <TableHead>Provider / reference</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Credit</TableHead>
                  <TableHead className="text-right">Funding</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((funding) => (
                  <TableRow key={funding.id}>
                    <TableCell>
                      <OperatorPrimaryCell
                        title={
                          <Link href={`/operator/users/${funding.account.id}`}>
                            @{funding.account.username}
                          </Link>
                        }
                        subtitle={funding.account.email ?? funding.account.id}
                      />
                    </TableCell>
                    <TableCell>
                      <OperatorPrimaryCell
                        title={funding.provider}
                        subtitle={funding.providerReference}
                      />
                    </TableCell>
                    <TableCell>
                      <OperatorStatusCell
                        status={funding.state}
                        label={stateLabel(funding.state)}
                      />
                    </TableCell>
                    <TableCell>
                      {funding.walletCredit ? (
                        <OperatorStatusCell status={funding.walletCredit.state} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <OperatorValueCell>
                        <Money minor={funding.canonicalAmountMinor} />{" "}
                        <span className="text-xs text-slate-500">
                          (
                          <Money
                            minor={funding.collectionAmountMinor}
                            currency={funding.collectionCurrency}
                          />
                          )
                        </span>
                      </OperatorValueCell>
                    </TableCell>
                    <TableCell>
                      <OperatorActionCell>
                        <OperatorActionsMenu
                          actions={[
                            {
                              type: "link",
                              label: "Inspect funding",
                              href: `/operator/funding/${funding.id}`,
                            },
                            {
                              type: "link",
                              label: "View account",
                              href: `/operator/users/${funding.account.id}`,
                            },
                          ]}
                          label={`Actions for funding ${funding.id}`}
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
            title="No funding transactions found"
            description="Try another search or state filter. Empty results do not indicate a funding failure."
          />
        )}
      </OperatorSection>
    </OperatorPage>
  );
}

export function OperatorFundingDetail({
  fundingId,
  canManage = false,
}: {
  fundingId: string;
  canManage?: boolean;
}) {
  const [funding, setFunding] = useState<FundingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

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

  async function confirmBankTransfer() {
    if (!funding || !canManage || !window.confirm("Confirm that this bank transfer was received?"))
      return;
    setConfirming(true);
    setError(null);
    try {
      await apiFetch(`/api/operator/funding/${funding.id}/confirm-bank-transfer`, {
        method: "POST",
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setConfirming(false);
    }
  }

  if (loading && !funding)
    return (
      <OperatorPage>
        <OperatorLoadingState variant="section" label="Loading funding detail" />
      </OperatorPage>
    );
  if (!funding)
    return (
      <OperatorPage>
        <OperatorErrorState
          title="Funding unavailable"
          message={error || "This funding record was not found."}
          retry={() => void load()}
        />
      </OperatorPage>
    );

  return (
    <OperatorPage>
      <OperatorPageHeader
        eyebrow="Funding fact"
        title="Wallet funding inspection"
        description={funding.id}
        actions={<OperatorStatusCell status={funding.state} label={stateLabel(funding.state)} />}
      />
      {error && <OperatorErrorState message={error} />}
      {canManage &&
        funding.provider === "bank_transfer" &&
        (funding.state === "awaiting_payment" || funding.state === "verification_pending") && (
          <OperatorSection
            title="Manual bank verification"
            description="Confirm only after independently verifying the transfer in the receiving account."
          >
            <Button type="button" disabled={confirming} onClick={() => void confirmBankTransfer()}>
              {confirming ? "Confirming…" : "Confirm received transfer"}
            </Button>
          </OperatorSection>
        )}
      <div className="grid gap-4 lg:grid-cols-2">
        <OperatorSection title="Funding fact" surface>
          <dl className="detail-list">
            <div>
              <dt>Account</dt>
              <dd>
                <Link href={`/operator/users/${funding.account.id}`}>
                  @{funding.account.username}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd className="break-value">{funding.account.email ?? "No authentication email"}</dd>
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
              <dt>Provider transaction ID</dt>
              <dd className="break-value">{funding.providerTransactionId ?? "Not known yet"}</dd>
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
        </OperatorSection>
        <OperatorSection title="Amounts and wallet consequence" surface>
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
          {funding.walletCredit ? (
            <p className="operator-funding-credit-status">
              <OperatorStatusCell status={funding.walletCredit.state} /> credit ·{" "}
              <Money minor={funding.walletCredit.amountMinor} />
              {funding.walletCredit.availableAt &&
                ` · available ${formatDate(funding.walletCredit.availableAt)}`}
            </p>
          ) : (
            <p className="panel-intro">No wallet credit has been created.</p>
          )}
        </OperatorSection>
      </div>
      {funding.conversionSnapshot && (
        <OperatorSection title="Conversion snapshot" surface>
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
        </OperatorSection>
      )}
      {funding.evidence && (
        <OperatorSection title="Bank-transfer evidence" surface>
          <dl className="detail-list">
            {operatorBankTransferEvidenceRows(funding.evidence).map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd className="break-value whitespace-pre-line">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="panel-intro">
            Proof viewing is not available from this operator screen; review the recorded metadata
            or use the configured secure retrieval mechanism when one is provided.
          </p>
        </OperatorSection>
      )}
      <OperatorSection title="Provider initialization" surface>
        <p className="panel-intro">
          {funding.providerInitialization?.authorizationUrl
            ? "An authorization URL was persisted for the provider flow. It is intentionally not exposed as an operator action."
            : "No provider authorization URL is persisted."}
        </p>
      </OperatorSection>
      <OperatorSection title="Provider operations" surface>
        {funding.operations.length ? (
          <div className="operator-funding-operation-list">
            {funding.operations.map((operation) => (
              <div className="operator-funding-operation" key={operation.id}>
                <div>
                  <strong>{operation.operation}</strong>
                  <span>{formatDate(operation.occurredAt)}</span>
                </div>
                <OperatorStatusCell status={operation.outcome} />
                <p>{operation.providerMessage || operation.failureKind || "No provider message"}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel-intro">No provider operations recorded.</p>
        )}
      </OperatorSection>
      <OperatorSection title="Provider events" surface>
        {funding.events.length ? (
          <div className="operator-funding-operation-list">
            {funding.events.map((event) => (
              <div className="operator-funding-operation" key={event.id}>
                <div>
                  <strong>{event.eventType}</strong>
                  <span>{formatDate(event.receivedAt)}</span>
                </div>
                <OperatorStatusCell status={event.state} />
                <p>{event.lastError || `Outbox: ${event.outboxState || "not recorded"}`}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel-intro">No correlated provider events recorded.</p>
        )}
      </OperatorSection>
      <Button variant="secondary" onClick={() => void load()} disabled={loading}>
        {loading ? "Refreshing…" : "Refresh detail"}
      </Button>
    </OperatorPage>
  );
}
