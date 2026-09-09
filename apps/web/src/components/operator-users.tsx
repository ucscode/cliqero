"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  apiFetch,
  ApiClientError,
  type CapabilityAdministrationView,
  type OperatorApiKeyCreated,
  type OperatorApiKeyPage,
  type ApiKeyMetadata,
  type OperatorAccountDetail,
  type OperatorAccountPage,
  type OperatorAccountSummary,
} from "@/lib/api-client";
import {
  CAPABILITIES,
  CAPABILITY_METADATA,
  type Capability,
} from "@/modules/identity/capabilities";
import { API_SCOPE_METADATA } from "@/modules/identity/api-scopes";
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
  const [apiKeyPage, setApiKeyPage] = useState<OperatorApiKeyPage | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiKeyExpiry, setApiKeyExpiry] = useState("");
  const [apiKeyScopes, setApiKeyScopes] = useState<string[]>([]);
  const [apiKeySecret, setApiKeySecret] = useState<OperatorApiKeyCreated | null>(null);

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
  async function loadApiKeys() {
    setApiKeyLoading(true);
    setApiKeyError(null);
    try {
      const result = await apiFetch<OperatorApiKeyPage>(
        `/api/operator/accounts/${accountId}/api-keys`,
      );
      setApiKeyPage(result);
      setApiKeyScopes((current) =>
        current.filter((scope) => result.manageable_scopes.includes(scope)),
      );
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 403) {
        setApiKeyPage(null);
      } else {
        setApiKeyError(message(cause));
      }
    } finally {
      setApiKeyLoading(false);
    }
  }
  useEffect(() => {
    // Initial loading synchronizes this detail panel with the remote API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    void loadCapabilities();
    void loadApiKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  function toggleApiKeyScope(scope: string) {
    setApiKeyScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  }

  async function createApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKeyPage || apiKeySaving) return;
    setApiKeySaving(true);
    setApiKeyError(null);
    try {
      const created = await apiFetch<OperatorApiKeyCreated>(
        `/api/operator/accounts/${accountId}/api-keys`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: apiKeyName,
            scopes: apiKeyScopes,
            expires_at: apiKeyExpiry
              ? new Date(`${apiKeyExpiry}T23:59:59.000Z`).toISOString()
              : null,
          }),
        },
      );
      setApiKeySecret(created);
      setApiKeyName("");
      setApiKeyExpiry("");
      setApiKeyScopes([]);
      await loadApiKeys();
    } catch (cause) {
      setApiKeyError(message(cause));
    } finally {
      setApiKeySaving(false);
    }
  }

  async function revokeApiKey(key: ApiKeyMetadata) {
    if (apiKeySaving || !window.confirm(`Revoke ${key.name}? This cannot be undone.`)) return;
    setApiKeySaving(true);
    setApiKeyError(null);
    try {
      await apiFetch(`/api/operator/accounts/${accountId}/api-keys/${key.id}/revoke`, {
        method: "POST",
      });
      await loadApiKeys();
    } catch (cause) {
      setApiKeyError(message(cause));
    } finally {
      setApiKeySaving(false);
    }
  }

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
        {!apiKeyLoading && apiKeyPage && (
          <OperatorApiKeyCard
            page={apiKeyPage}
            name={apiKeyName}
            expiry={apiKeyExpiry}
            selectedScopes={apiKeyScopes}
            saving={apiKeySaving}
            secret={apiKeySecret}
            error={apiKeyError}
            onNameChange={setApiKeyName}
            onExpiryChange={setApiKeyExpiry}
            onToggleScope={toggleApiKeyScope}
            onCreate={createApiKey}
            onRevoke={revokeApiKey}
            onDismissSecret={() => setApiKeySecret(null)}
          />
        )}
        {apiKeyLoading && (
          <Card className="col-span-full">
            <p className="eyebrow">API access</p>
            <Skeleton className="catalogue-skeleton" />
          </Card>
        )}
        {apiKeyError && !apiKeyPage && <Toast>{apiKeyError}</Toast>}
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

function OperatorApiKeyCard({
  page,
  name,
  expiry,
  selectedScopes,
  saving,
  secret,
  error,
  onNameChange,
  onExpiryChange,
  onToggleScope,
  onCreate,
  onRevoke,
  onDismissSecret,
}: {
  page: OperatorApiKeyPage;
  name: string;
  expiry: string;
  selectedScopes: string[];
  saving: boolean;
  secret: OperatorApiKeyCreated | null;
  error: string | null;
  onNameChange: (value: string) => void;
  onExpiryChange: (value: string) => void;
  onToggleScope: (scope: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onRevoke: (key: ApiKeyMetadata) => Promise<void>;
  onDismissSecret: () => void;
}) {
  return (
    <Card className="operator-api-keys-card col-span-full">
      <div>
        <p className="eyebrow">API access</p>
        <h3>Credentials for this account</h3>
        <p className="panel-note">
          Keys restrict the account’s existing authority; they never grant capabilities. Secrets are
          shown only once.
        </p>
      </div>
      {error && <Toast>{error}</Toast>}
      <form className="mt-4 grid max-w-2xl gap-3" onSubmit={onCreate}>
        <label>
          Key name
          <Input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            required
            maxLength={100}
          />
        </label>
        <label>
          Expiry <span>(optional)</span>
          <Input
            type="date"
            value={expiry}
            onChange={(event) => onExpiryChange(event.target.value)}
          />
        </label>
        <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-4">
          <legend>Scopes that restrict this credential</legend>
          {page.manageable_scopes.map((scope) => {
            const metadata = API_SCOPE_METADATA[scope as keyof typeof API_SCOPE_METADATA];
            return (
              <label className="flex items-start gap-2 text-sm text-slate-600" key={scope}>
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope)}
                  onChange={() => onToggleScope(scope)}
                />
                <span>
                  <strong className="text-slate-800">{metadata?.label ?? scope}</strong>
                  <span className="block text-xs text-slate-500">{scope}</span>
                  {metadata && <span className="block text-xs">{metadata.description}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? "Creating…" : "Create API key"}
        </Button>
      </form>
      <div className="mt-6 grid gap-2">
        <h4>Existing credentials</h4>
        {page.items.length === 0 ? (
          <p className="panel-note">No API keys have been created for this account.</p>
        ) : (
          page.items.map((key) => (
            <div
              className="flex flex-wrap items-start justify-between gap-3 border-b py-3 last:border-0"
              key={key.id}
            >
              <div className="grid gap-1 text-sm">
                <strong>{key.name}</strong>
                <span>
                  {key.key_prefix} · Created {new Date(key.created_at).toLocaleString()}
                </span>
                <span className="text-xs text-slate-500">
                  {key.scopes.join(", ") || "No scopes"}
                  {key.expires_at
                    ? ` · Expires ${new Date(key.expires_at).toLocaleDateString()}`
                    : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={key.revoked_at ? "secondary" : "default"}>
                  {key.revoked_at ? "revoked" : "active"}
                </Badge>
                {!key.revoked_at && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={saving}
                    onClick={() => void onRevoke(key)}
                  >
                    {saving ? "Saving…" : "Revoke"}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      {secret && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <strong>Copy this key now</strong>
              <p className="mt-1">It will not be shown again after you dismiss this message.</p>
            </div>
            <Button type="button" variant="secondary" onClick={onDismissSecret}>
              Done
            </Button>
          </div>
          <code className="mt-3 block break-all rounded bg-white p-3">{secret.secret}</code>
          <Button
            type="button"
            className="mt-3"
            variant="secondary"
            onClick={() => void navigator.clipboard?.writeText(secret.secret)}
          >
            Copy key
          </Button>
        </div>
      )}
    </Card>
  );
}
