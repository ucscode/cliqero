"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiFetch,
  type OperatorAccountDetail,
  type OperatorAccountPage,
  type OperatorAccountSummary,
} from "@/lib/api-client";
import { Badge, Button, Card, EmptyState, Input, Skeleton, Toast } from "./ui";

function message(error: unknown) {
  return error instanceof Error ? error.message : "The account service is temporarily unavailable.";
}

function roleLabel(roles: string[]) {
  if (roles.includes("operator")) return "Operator";
  if (roles.includes("catalogue_manager")) return "Catalogue manager";
  return "User";
}

export function OperatorUsersList() {
  const [page, setPage] = useState<OperatorAccountPage | null>(null);
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
      setPage(await apiFetch<OperatorAccountPage>(`/api/operator/accounts?${params}`));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Load once; search is submitted intentionally to avoid request storms.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="operator-users-page">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Account operations</p>
          <h2 id="operator-users-heading">Users</h2>
          <p className="panel-intro">
            Search safe account projections and inspect referral context.
          </p>
        </div>
      </div>
      <Card className="operator-users-toolbar">
        <form
          className="catalogue-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label>
            Search accounts
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Handle, email, or account ID"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </Button>
        </form>
      </Card>
      {error && <Toast>{error}</Toast>}
      {loading ? (
        <div className="operator-users-list" aria-label="Loading users">
          {[1, 2, 3].map((item) => (
            <Card key={item}>
              <Skeleton className="catalogue-skeleton" />
            </Card>
          ))}
        </div>
      ) : page?.items.length ? (
        <>
          <div className="operator-users-list">
            {page.items.map((account) => (
              <AccountRow account={account} key={account.id} />
            ))}
          </div>
          {page.nextCursor && (
            <Button variant="secondary" onClick={() => void load(page.nextCursor)}>
              Next page
            </Button>
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            title="No accounts found"
            description="Try a different handle, email, or account ID."
          />
        </Card>
      )}
    </div>
  );
}

function AccountRow({ account }: { account: OperatorAccountSummary }) {
  return (
    <Card className="operator-user-row">
      <div className="identity-row">
        <span className="identity-avatar">
          {(account.displayName || account.handle).slice(0, 1).toUpperCase()}
        </span>
        <div className="operator-user-identity">
          <Link href={`/operator/users/${account.id}`}>
            <strong>{account.displayName || account.handle}</strong>
          </Link>
          <span>@{account.handle}</span>
          <small>{account.email}</small>
        </div>
      </div>
      <div className="operator-user-meta">
        <Badge
          tone={
            account.roles.includes("operator")
              ? "accent"
              : account.roles.includes("catalogue_manager")
                ? "success"
                : "neutral"
          }
        >
          {roleLabel(account.roles)}
        </Badge>
        <span>{account.directReferralCount} direct referrals</span>
        <span>{account.country || "Country not set"}</span>
      </div>
      <Link className="button button-ghost" href={`/operator/network?root=${account.id}`}>
        View network
      </Link>
    </Card>
  );
}

export function OperatorUserDetail({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<OperatorAccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [parentSearch, setParentSearch] = useState("");
  const [parentResults, setParentResults] = useState<OperatorAccountSummary[]>([]);
  const [selectedParent, setSelectedParent] = useState<OperatorAccountSummary | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setAccount(await apiFetch<OperatorAccountDetail>(`/api/operator/accounts/${accountId}`));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // Initial loading synchronizes this detail panel with the remote API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function searchParent() {
    if (!parentSearch.trim()) return;
    try {
      const result = await apiFetch<OperatorAccountPage>(
        `/api/operator/accounts?search=${encodeURIComponent(parentSearch.trim())}&limit=10`,
      );
      setParentResults(result.items.filter((item) => item.id !== accountId));
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function reassign() {
    if (!selectedParent || !account) return;
    if (!window.confirm(`Move @${account.handle} under @${selectedParent.handle}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/operator/hierarchy/${account.id}/parent`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parent_account_id: selectedParent.id }),
      });
      setSelectedParent(null);
      setParentResults([]);
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <Card aria-label="Loading account">
        <Skeleton className="catalogue-skeleton" />
      </Card>
    );
  if (!account)
    return (
      <Card>
        <EmptyState
          title="Account unavailable"
          description={error || "This account could not be found."}
        />
      </Card>
    );
  return (
    <div className="operator-user-detail">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Account inspection</p>
          <h2>{account.displayName || account.handle}</h2>
          <p className="panel-intro">
            @{account.handle} · {account.email}
          </p>
        </div>
        <Badge
          tone={
            account.roles.includes("operator")
              ? "accent"
              : account.roles.includes("catalogue_manager")
                ? "success"
                : "neutral"
          }
        >
          {roleLabel(account.roles)}
        </Badge>
      </div>
      {error && <Toast>{error}</Toast>}
      <div className="operator-detail-grid">
        <Card>
          <p className="eyebrow">Identity</p>
          <dl className="detail-list">
            <div>
              <dt>Account ID</dt>
              <dd className="break-value">{account.id}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{account.country || "Not set"}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(account.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <p className="eyebrow">Capabilities</p>
          <div className="badge-row">
            {account.roles.length ? (
              account.roles.map((role) => <Badge key={role}>{role}</Badge>)
            ) : (
              <span>Standard account</span>
            )}
          </div>
          <p className="panel-note">
            Capabilities are inspected here; role editing is intentionally separate.
          </p>
        </Card>
        <Card>
          <p className="eyebrow">Referral context</p>
          <dl className="detail-list">
            <div>
              <dt>Immediate parent</dt>
              <dd>
                {account.parent ? (
                  <Link href={`/operator/users/${account.parent.id}`}>
                    @{account.parent.handle}
                  </Link>
                ) : (
                  "No parent"
                )}
              </dd>
            </div>
            <div>
              <dt>Direct referrals</dt>
              <dd>{account.directReferralCount}</dd>
            </div>
          </dl>
          <Link className="button button-secondary" href={`/operator/network?root=${account.id}`}>
            View network
          </Link>
        </Card>
        <Card>
          <p className="eyebrow">Commerce</p>
          <p className="operator-metric-value">{account.purchaseCount.toLocaleString("en-US")}</p>
          <p className="operator-metric-label">Purchases</p>
          <p className="panel-note">
            Financial balances and provider details are not part of this inspection surface.
          </p>
        </Card>
      </div>
      <Card className="reassignment-card">
        <p className="eyebrow">Referral administration</p>
        <h3>Reassign immediate parent</h3>
        <p className="panel-note">
          Descendants remain attached. PostgreSQL prevents cycles and the action is audited.
        </p>
        <div className="reassignment-current">
          <span>Current parent</span>
          <strong>{account.parent ? `@${account.parent.handle}` : "None"}</strong>
        </div>
        <form
          className="reassignment-search"
          onSubmit={(event) => {
            event.preventDefault();
            void searchParent();
          }}
        >
          <label>
            Find new parent
            <Input
              value={parentSearch}
              onChange={(event) => setParentSearch(event.target.value)}
              placeholder="Handle, email, or account ID"
            />
          </label>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        {parentResults.length > 0 && (
          <ul className="operator-search-results">
            {parentResults.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  className={selectedParent?.id === result.id ? "selected" : ""}
                  onClick={() => setSelectedParent(result)}
                >
                  <strong>@{result.handle}</strong>
                  <span>{result.displayName || result.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selectedParent && (
          <div className="reassignment-confirm">
            <span>
              New parent: <strong>@{selectedParent.handle}</strong>
            </span>
            <Button type="button" onClick={() => void reassign()} disabled={saving}>
              {saving ? "Saving…" : "Confirm reassignment"}
            </Button>
          </div>
        )}
      </Card>
      {account.latestParentReassignment && (
        <Card>
          <p className="eyebrow">Latest hierarchy audit</p>
          <p className="panel-note">
            Parent changed on{" "}
            {new Date(account.latestParentReassignment.occurredAt).toLocaleString()} by{" "}
            {account.latestParentReassignment.actorId || "an operator"}.
          </p>
        </Card>
      )}
    </div>
  );
}
