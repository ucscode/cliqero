"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiFetch,
  ApiClientError,
  type CapabilityAdministrationView,
  type OperatorAccountDetail,
  type OperatorAccountPage,
  type OperatorAccountSummary,
} from "@/lib/api-client";
import {
  CAPABILITIES,
  CAPABILITY_METADATA,
  type Capability,
} from "@/modules/identity/capabilities";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { HoneypotField } from "./honeypot-field";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";

function message(error: unknown) {
  return error instanceof Error ? error.message : "The account service is temporarily unavailable.";
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
              placeholder="Username, email, or account ID"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </Button>
          <HoneypotField />
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
            description="Try a different username, email, or account ID."
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
          {(account.displayName || account.username).slice(0, 1).toUpperCase()}
        </span>
        <div className="operator-user-identity">
          <Link href={`/operator/users/${account.id}`}>
            <strong>{account.displayName || account.username}</strong>
          </Link>
          <span>@{account.username}</span>
          <small>{account.email ?? "No authentication email"}</small>
        </div>
      </div>
      <div className="operator-user-meta">
        <Badge variant="secondary">Account</Badge>
        <span>{account.directReferralCount} direct referrals</span>
        <span>{account.country || "Country not set"}</span>
      </div>
      <Button asChild variant="ghost">
        <Link href={`/operator/network?root=${account.id}`}>View network</Link>
      </Button>
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
  const [capabilityView, setCapabilityView] = useState<CapabilityAdministrationView | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [capabilitySaving, setCapabilitySaving] = useState<Capability | null>(null);

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

  async function loadCapabilities() {
    setCapabilityLoading(true);
    setCapabilityError(null);
    try {
      setCapabilityView(
        await apiFetch<CapabilityAdministrationView>(
          `/api/operator/accounts/${accountId}/capabilities`,
        ),
      );
    } catch (cause) {
      // Account readers are intentionally not given assignment data. Keep the
      // detail page useful without exposing a second authorization surface.
      if (cause instanceof ApiClientError && cause.status === 403) {
        setCapabilityView(null);
      } else {
        setCapabilityError(message(cause));
      }
    } finally {
      setCapabilityLoading(false);
    }
  }
  useEffect(() => {
    // Initial loading synchronizes this detail panel with the remote API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    void loadCapabilities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function changeCapability(capability: Capability, action: "grant" | "revoke") {
    if (!capabilityView || capabilitySaving) return;
    if (action === "revoke" && capability === "system.root") {
      const warning = capabilityView.isSelf
        ? "Remove your own master operator authority? Another root account must remain."
        : "Remove master operator authority from this account? Another root account must remain.";
      if (!window.confirm(warning)) return;
    } else if (action === "grant" && capability === "system.root") {
      if (!window.confirm("Grant master operator authority to this account?")) return;
    }
    setCapabilitySaving(capability);
    setCapabilityError(null);
    try {
      await apiFetch(
        `/api/operator/accounts/${accountId}/capabilities${action === "revoke" ? `/${encodeURIComponent(capability)}` : ""}`,
        {
          method: action === "revoke" ? "DELETE" : "POST",
          ...(action === "grant"
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ capability }),
              }
            : {}),
        },
      );
      await loadCapabilities();
    } catch (cause) {
      setCapabilityError(message(cause));
    } finally {
      setCapabilitySaving(null);
    }
  }

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
    if (!window.confirm(`Move @${account.username} under @${selectedParent.username}?`)) return;
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
          <h2>{account.displayName || account.username}</h2>
          <p className="panel-intro">
            @{account.username} · {account.email ?? "No authentication email"}
          </p>
        </div>
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
        {!capabilityLoading && capabilityView && (
          <CapabilityCard
            view={capabilityView}
            saving={capabilitySaving}
            onChange={changeCapability}
          />
        )}
        {capabilityLoading && (
          <Card>
            <p className="eyebrow">Platform capabilities</p>
            <Skeleton className="catalogue-skeleton" />
          </Card>
        )}
        {capabilityError && <Toast>{capabilityError}</Toast>}
        <Card>
          <p className="eyebrow">Referral context</p>
          <dl className="detail-list">
            <div>
              <dt>Immediate parent</dt>
              <dd>
                {account.parent ? (
                  <Link href={`/operator/users/${account.parent.id}`}>
                    @{account.parent.username}
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
          <Button asChild variant="secondary">
            <Link href={`/operator/network?root=${account.id}`}>View network</Link>
          </Button>
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
          <strong>{account.parent ? `@${account.parent.username}` : "None"}</strong>
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
              placeholder="Username, email, or account ID"
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
                  <strong>@{result.username}</strong>
                  <span>{result.displayName || result.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selectedParent && (
          <div className="reassignment-confirm">
            <span>
              New parent: <strong>@{selectedParent.username}</strong>
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

function CapabilityCard({
  view,
  saving,
  onChange,
}: {
  view: CapabilityAdministrationView;
  saving: Capability | null;
  onChange: (capability: Capability, action: "grant" | "revoke") => Promise<void>;
}) {
  const assigned = new Map(view.assignments.map((item) => [item.capability, item.grantedAt]));
  const manageable = new Set(view.manageableCapabilities);
  const rootAssigned = assigned.has("system.root");
  const ordinary = CAPABILITIES.filter((capability) => capability !== "system.root");

  return (
    <Card className="operator-capabilities-card col-span-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Platform capabilities</p>
          <p className="panel-note">
            These are direct assignments. Master operator authority is evaluated separately from the
            capabilities stored on the account.
          </p>
        </div>
        {rootAssigned && <Badge variant="destructive">system.root · master authority</Badge>}
      </div>
      <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <strong>{CAPABILITY_METADATA["system.root"].label}</strong>
        <p className="mt-1">{CAPABILITY_METADATA["system.root"].description}</p>
        <p className="mt-1 font-medium">{rootAssigned ? "Directly assigned" : "Not assigned"}</p>
        {manageable.has("system.root") && (
          <Button
            className="mt-3"
            variant="destructive"
            size="sm"
            disabled={saving === "system.root"}
            onClick={() => void onChange("system.root", rootAssigned ? "revoke" : "grant")}
          >
            {saving === "system.root"
              ? "Saving…"
              : rootAssigned
                ? "Revoke master authority"
                : "Grant master authority"}
          </Button>
        )}
      </div>
      <div className="mt-4 grid gap-3">
        {ordinary.map((capability) => {
          const metadata = CAPABILITY_METADATA[capability];
          const grantedAt = assigned.get(capability);
          const canChange = manageable.has(capability);
          return (
            <div key={capability} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <strong>{metadata.label}</strong>
                  <p className="text-xs text-slate-500">{capability}</p>
                  <p className="mt-1 text-sm text-slate-600">{metadata.description}</p>
                  {grantedAt && (
                    <p className="mt-1 text-xs text-slate-500">
                      Granted {new Date(grantedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={grantedAt ? "default" : "secondary"}>
                    {grantedAt ? "Assigned" : "Not assigned"}
                  </Badge>
                  {canChange && (
                    <Button
                      type="button"
                      size="sm"
                      variant={grantedAt ? "outline" : "secondary"}
                      disabled={saving === capability}
                      onClick={() => void onChange(capability, grantedAt ? "revoke" : "grant")}
                    >
                      {saving === capability ? "Saving…" : grantedAt ? "Revoke" : "Grant"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
