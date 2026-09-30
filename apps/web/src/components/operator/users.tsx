"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { API_SCOPE_METADATA } from "@/modules/identity/api/scopes";
import { OperatorPrimaryCell, OperatorSecondaryText, OperatorValueCell } from "./ui/data-cells";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "./ui/bulk-outcome";
import { OperatorLoadingState } from "./ui/loading-state";
import { OperatorMetricCard } from "./ui/metric-card";
import { OperatorSection } from "./ui/section";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "@/components/crud/index-page";
import { CrudDetail } from "@/components/crud/detail";
import { CrudFieldList } from "@/components/crud/field-list";
import { CrudEdit } from "@/components/crud/edit";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudColumn } from "@/components/crud/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { HoneypotField } from "../honeypot-field";
import { Input } from "../ui/input";
import { Toast } from "../toast";
import { CountrySelect } from "../country-select";
import { Label } from "../ui/label";
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";

function message(error: unknown) {
  return error instanceof Error ? error.message : "The account service is temporarily unavailable.";
}

export function operatorUserRowActions(
  account: OperatorAccountSummary,
  canManage: boolean,
  onDelete?: (account: OperatorAccountSummary) => void,
) {
  return [
    { type: "link" as const, label: "View account", href: `/operator/users/${account.id}` },
    ...(canManage
      ? [
          {
            type: "link" as const,
            label: "Edit account",
            href: `/operator/users/${account.id}/edit`,
          },
          ...(onDelete
            ? [
                {
                  type: "action" as const,
                  label: "Delete",
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => onDelete(account),
                },
              ]
            : []),
        ]
      : []),
    {
      type: "link" as const,
      label: "View network",
      href: `/operator/network?root=${account.id}`,
    },
  ];
}

export function operatorUsersEmptyDescription(appliedSearch: string) {
  return appliedSearch ? "No accounts matched this search." : "No accounts are available yet.";
}

export async function applyOperatorUserSearch(
  apply: (search: string) => Promise<boolean>,
  search: string,
  setAppliedSearch: (search: string) => void,
): Promise<boolean> {
  const nextSearch = search.trim();
  const applied = await apply(nextSearch);
  if (applied) setAppliedSearch(nextSearch);
  return applied;
}

export function OperatorUsersList({
  canManage = false,
  deletedNotice = false,
}: {
  canManage?: boolean;
  deletedNotice?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(
    deletedNotice ? "Account deleted. Historical platform records remain available." : null,
  );
  const collection = useCrudCollection(async (appliedSearch: string, cursor, pageSize) => {
    const params = new URLSearchParams({ limit: String(pageSize) });
    if (appliedSearch) params.set("search", appliedSearch);
    if (cursor) params.set("cursor", cursor);
    return apiFetch<OperatorAccountPage>(`/api/accounts?${params}`);
  }, "");

  return (
    <OperatorUsersListView
      page={
        !collection.initialized
          ? null
          : { items: collection.items, nextCursor: collection.nextCursor }
      }
      search={search}
      appliedSearch={appliedSearch}
      loading={collection.loading}
      error={collection.error}
      canManage={canManage}
      onSearchChange={setSearch}
      onSearch={async (event) => {
        event.preventDefault();
        return applyOperatorUserSearch(collection.apply, search, setAppliedSearch);
      }}
      onRetry={() => void collection.retry()}
      actionError={actionError}
      bulkOutcome={bulkOutcome}
      successNotice={successNotice}
      onDelete={async (account) => {
        if (
          !window.confirm(
            `Delete @${account.username}? Account access and credentials will be removed; historical platform records will remain.`,
          )
        )
          return;
        try {
          await apiFetch(`/api/accounts/${account.id}`, { method: "DELETE" });
          setActionError(null);
          setSuccessNotice(`@${account.username} was deleted. Historical platform records remain.`);
          await collection.refresh();
        } catch (cause) {
          setActionError(message(cause));
        }
      }}
      onBulkDelete={async (accounts) => {
        if (
          !window.confirm(
            `Delete ${accounts.length} selected account(s)? Account access and credentials will be removed; historical platform records will remain.`,
          )
        )
          return false;
        const results = await runOperatorBulkAction({
          resource: "accounts",
          action: "delete",
          ids: accounts.map((account) => account.id),
        });
        await collection.refresh();
        if (results.failed.length) {
          const accountsById = new Map(accounts.map((account) => [account.id, account]));
          setBulkOutcome({
            resource: "accounts",
            selectedCount: accounts.length,
            failures: results.failed.map(({ id, message: error }) => ({
              id,
              label: `@${accountsById.get(id)?.username ?? id}`,
              message: error,
            })),
          });
          return false;
        }
        setBulkOutcome(null);
        setActionError(null);
        setSuccessNotice(
          `${results.succeeded.length} account(s) deleted. Historical platform records remain.`,
        );
        return true;
      }}
      hasPrevious={collection.hasPrevious}
      onPrevious={() => void collection.previous()}
      onNext={() => void collection.next()}
      filtersDirty={Boolean(search.trim() || appliedSearch)}
      onFiltersReset={async () => {
        const ok = await collection.apply("");
        if (ok) {
          setSearch("");
          setAppliedSearch("");
        }
        return ok;
      }}
    />
  );
}

export function OperatorUsersListView({
  page,
  search,
  appliedSearch,
  loading,
  error,
  canManage,
  onSearchChange,
  onSearch,
  onRetry,
  onDelete,
  onBulkDelete,
  actionError,
  bulkOutcome,
  successNotice,
  hasPrevious,
  onPrevious,
  onNext,
  filtersDirty,
  onFiltersReset,
}: {
  page: OperatorAccountPage | null;
  search: string;
  appliedSearch: string;
  loading: boolean;
  error: string | null;
  canManage?: boolean;
  onSearchChange: (value: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => boolean | Promise<boolean>;
  onRetry: () => void;
  onDelete?: (account: OperatorAccountSummary) => void;
  onBulkDelete?: (accounts: readonly OperatorAccountSummary[]) => Promise<boolean>;
  actionError?: string | null;
  bulkOutcome?: OperatorBulkOutcomeData | null;
  successNotice?: string | null;
  hasPrevious: boolean;
  onPrevious: () => void;
  onNext: () => void;
  filtersDirty?: boolean;
  onFiltersReset?: () => boolean | void | Promise<boolean | void>;
}) {
  const columns: readonly CrudColumn<OperatorAccountSummary>[] = [
    {
      key: "user",
      label: "User",
      primary: true,
      render: (account) => (
        <OperatorPrimaryCell
          title={
            <Link
              href={`/operator/users/${account.id}`}
              className="rounded-sm hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              @{account.username}
            </Link>
          }
          subtitle={
            account.displayName && account.displayName !== account.username
              ? account.displayName
              : undefined
          }
        />
      ),
    },
    {
      key: "email",
      label: "Email",
      render: (account) => (
        <OperatorSecondaryText className="break-all">
          {account.email ?? "No authentication email"}
        </OperatorSecondaryText>
      ),
    },
    {
      key: "referrals",
      label: "Direct referrals",
      render: (account) => <OperatorValueCell>{account.directReferralCount}</OperatorValueCell>,
    },
    {
      key: "country",
      label: "Country",
      render: (account) => <OperatorSecondaryText>{account.country || "—"}</OperatorSecondaryText>,
    },
  ];

  return (
    <CrudIndex
      eyebrow="Account operations"
      title="Users"
      description="Search safe account projections and inspect referral context."
      headerActions={
        canManage ? (
          <Button asChild>
            <Link href="/operator/users/new">Add user</Link>
          </Button>
        ) : undefined
      }
      filters={
        <OperatorFilterField label="Search accounts" htmlFor="operator-user-search">
          <Input
            id="operator-user-search"
            name="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Username, email, or account ID"
          />
        </OperatorFilterField>
      }
      onFiltersSubmit={onSearch}
      onFiltersReset={onFiltersReset}
      filtersDirty={filtersDirty}
      toolbarActions={
        <>
          <Button type="submit" variant="action" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </Button>
          <HoneypotField />
        </>
      }
      toolbarClassName="max-w-2xl"
      items={page?.items ?? []}
      columns={columns}
      getRowKey={(account) => account.id}
      selection={{ labelForItem: (account) => `account ${account.username}` }}
      bulkActions={
        canManage && onBulkDelete
          ? [
              {
                value: "delete",
                label: "Delete",
                destructive: true,
                onSelect: onBulkDelete,
              },
            ]
          : []
      }
      beforeTable={
        <>
          {actionError && <OperatorErrorState message={actionError} />}
          {bulkOutcome && <OperatorBulkOutcome outcome={bulkOutcome} />}
          {successNotice && <Toast tone="success">{successNotice}</Toast>}
        </>
      }
      actions={(account) => operatorUserRowActions(account, Boolean(canManage), onDelete)}
      actionLabel={(account) => `Actions for @${account.username}`}
      loading={loading}
      initialized={page !== null}
      loadingLabel="Loading users"
      error={error}
      onRetry={onRetry}
      emptyTitle="No users found"
      emptyDescription={operatorUsersEmptyDescription(appliedSearch)}
      pagination={
        page && (page.nextCursor || hasPrevious)
          ? {
              hasPrevious,
              hasNext: Boolean(page.nextCursor),
              onPrevious,
              onNext,
              summary: `Showing ${page.items.length} users`,
            }
          : undefined
      }
    />
  );
}

export function OperatorUserDetail({
  accountId,
  canManage = false,
}: {
  accountId: string;
  canManage?: boolean;
}) {
  const router = useRouter();
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
  const [deleting, setDeleting] = useState(false);

  async function load(): Promise<OperatorAccountDetail | null> {
    setLoading(true);
    setError(null);
    try {
      const loaded = await apiFetch<OperatorAccountDetail>(`/api/accounts/${accountId}`);
      setAccount(loaded);
      return loaded;
    } catch (cause) {
      setError(message(cause));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function loadCapabilities() {
    setCapabilityLoading(true);
    setCapabilityError(null);
    try {
      setCapabilityView(
        await apiFetch<CapabilityAdministrationView>(`/api/accounts/${accountId}/capabilities`),
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
      const result = await apiFetch<OperatorApiKeyPage>(`/api/accounts/${accountId}/api-keys`);
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
    void (async () => {
      const loaded = await load();
      if (!loaded || loaded.deletedAt) {
        setCapabilityLoading(false);
        setApiKeyLoading(false);
        return;
      }
      await Promise.all([loadCapabilities(), loadApiKeys()]);
    })();
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
      const created = await apiFetch<OperatorApiKeyCreated>(`/api/accounts/${accountId}/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: apiKeyName,
          scopes: apiKeyScopes,
          expires_at: apiKeyExpiry ? new Date(`${apiKeyExpiry}T23:59:59.000Z`).toISOString() : null,
        }),
      });
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
      await apiFetch(`/api/accounts/${accountId}/api-keys/${key.id}/revoke`, {
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
        `/api/accounts/${accountId}/capabilities${action === "revoke" ? `/${encodeURIComponent(capability)}` : ""}`,
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
        `/api/accounts?search=${encodeURIComponent(parentSearch.trim())}&limit=10`,
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
      await apiFetch(`/api/hierarchy/${account.id}/parent`, {
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

  async function deleteAccount() {
    if (!account || deleting) return;
    if (
      !window.confirm(
        `Delete @${account.username}? Account access and credentials will be removed; historical platform records will remain.`,
      )
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/api/accounts/${account.id}`, { method: "DELETE" });
      router.push("/operator/users?notice=account-deleted");
      router.refresh();
    } catch (cause) {
      setError(message(cause));
      setDeleting(false);
    }
  }

  if (loading) return <CrudDetail eyebrow="Account inspection" title="User" loading />;
  if (!account)
    return (
      <CrudDetail
        eyebrow="Account inspection"
        title="User unavailable"
        error={{
          title: "Account unavailable",
          message: error || "This account could not be found.",
        }}
      />
    );
  return (
    <CrudDetail
      eyebrow="Account inspection"
      title={account.displayName || account.username}
      description={
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="font-semibold text-slate-800">@{account.username}</span>
          <span className="break-all">{account.email ?? "No authentication email"}</span>
        </div>
      }
      fieldsTitle="Identity"
      headerActions={
        canManage && !account.deletedAt ? (
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={() => void deleteAccount()}
          >
            {deleting ? "Deleting…" : "Delete user"}
          </Button>
        ) : undefined
      }
      fields={[
        { label: "Account ID", value: account.id, className: "break-all" },
        { label: "Country", value: account.country || "Not set" },
        { label: "Created", value: new Date(account.createdAt).toLocaleString() },
      ]}
      sections={
        <>
          {account.deletedAt && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This account was deleted on {new Date(account.deletedAt).toLocaleString()}. Historical
              records remain available.
            </div>
          )}
          {error && <OperatorErrorState message={error} />}
          <div className="grid gap-4 lg:grid-cols-2">
            {!account.deletedAt && !capabilityLoading && capabilityView && (
              <CapabilityCard
                view={capabilityView}
                saving={capabilitySaving}
                onChange={changeCapability}
              />
            )}
            {!account.deletedAt && capabilityLoading && (
              <OperatorLoadingState variant="section" label="Loading platform capabilities" />
            )}
            {!account.deletedAt && capabilityError && (
              <OperatorErrorState message={capabilityError} />
            )}
            {!account.deletedAt && !apiKeyLoading && apiKeyPage && (
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
            {!account.deletedAt && apiKeyLoading && (
              <OperatorLoadingState variant="section" label="Loading API access" />
            )}
            {!account.deletedAt && apiKeyError && !apiKeyPage && (
              <OperatorErrorState message={apiKeyError} />
            )}
            <OperatorSection title="Referral context" surface>
              <CrudFieldList
                fields={[
                  {
                    label: "Immediate parent",
                    value: account.parent ? (
                      <Link href={`/operator/users/${account.parent.id}`}>
                        @{account.parent.username}
                      </Link>
                    ) : (
                      "No parent"
                    ),
                  },
                  { label: "Direct referrals", value: account.directReferralCount },
                ]}
              />
              <Button asChild variant="secondary">
                <Link href={`/operator/network?root=${account.id}`}>View network</Link>
              </Button>
            </OperatorSection>
            <OperatorMetricCard
              label="Purchases"
              category="Commerce"
              value={account.purchaseCount.toLocaleString("en-US")}
            />
          </div>
          {!account.deletedAt && (
            <OperatorSection
              title="Reassign immediate parent"
              description="Descendants remain attached. PostgreSQL prevents cycles and the action is audited."
              surface
            >
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
                <Button type="submit" variant="action">
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
            </OperatorSection>
          )}
          {account.latestParentReassignment && (
            <OperatorSection title="Latest hierarchy audit" surface>
              <p className="panel-note">
                Parent changed on{" "}
                {new Date(account.latestParentReassignment.occurredAt).toLocaleString()} by{" "}
                {account.latestParentReassignment.actorId || "an operator"}.
              </p>
            </OperatorSection>
          )}
        </>
      }
    />
  );
}

export function OperatorUserFormFields({
  create,
  username,
  email,
  country,
  onUsernameChange,
  onEmailChange,
  onCountryChange,
}: {
  create: boolean;
  username: string;
  email: string;
  country: string;
  onUsernameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onCountryChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="operator-account-username">Username</Label>
        <Input
          id="operator-account-username"
          autoComplete="off"
          required
          minLength={3}
          maxLength={32}
          value={username}
          onChange={(event) => onUsernameChange(event.target.value)}
        />
      </div>
      {create ? (
        <div className="grid gap-2">
          <Label htmlFor="operator-account-email">Email</Label>
          <Input
            id="operator-account-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
          />
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="operator-account-email">Email (managed by account holder)</Label>
          <Input id="operator-account-email" value={email} readOnly disabled />
        </div>
      )}
      <CountrySelect
        id="operator-account-country"
        value={country}
        onChange={onCountryChange}
        required={false}
      />
    </div>
  );
}

export function OperatorUserForm({ accountId }: { accountId?: string }) {
  const router = useRouter();
  const create = !accountId;
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(!create);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    void apiFetch<OperatorAccountDetail>(`/api/accounts/${accountId}`)
      .then((account) => {
        if (!active) return;
        setUsername(account.username);
        setEmail(account.email ?? "");
        setCountry(account.country ?? "");
      })
      .catch((cause) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accountId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (create) {
        const result = await apiFetch<{
          account: OperatorAccountDetail;
          passwordSetupEmailRequested: boolean;
        }>("/api/accounts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            username: username.trim(),
            ...(country ? { country } : {}),
          }),
        });
        setCreatedAccountId(result.account.id);
        setSuccess(
          result.passwordSetupEmailRequested
            ? "Account created. A password setup link was requested for the account email."
            : "Account created. Password setup email could not be requested; the account holder can use Forgot password.",
        );
      } else {
        const account = await apiFetch<OperatorAccountDetail>(`/api/accounts/${accountId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: username.trim(), country: country || null }),
        });
        router.push(`/operator/users/${account.id}`);
        router.refresh();
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <CrudEdit
      mode={create ? "create" : "edit"}
      eyebrow="Account operations"
      title={create ? "Add user" : "Edit account"}
      description={
        create
          ? "Create an account without handling or storing its password."
          : "Update the account username or country. Email and referral relationships are managed separately."
      }
      backHref={accountId ? `/operator/users/${accountId}` : "/operator/users"}
      saving={saving}
      loading={loading}
      onSubmit={(event) => void submit(event)}
      error={error}
      success={
        success ? (
          <Toast tone="success">
            <p>{success}</p>
            {createdAccountId && (
              <Link
                className="mt-2 inline-block font-medium underline"
                href={`/operator/users/${createdAccountId}`}
              >
                View account
              </Link>
            )}
          </Toast>
        ) : undefined
      }
      submitLabel={create ? "Create user" : "Save changes"}
      savingLabel={create ? "Creating…" : "Saving…"}
      sectionTitle={create ? "Account details" : "Editable profile fields"}
    >
      <OperatorUserFormFields
        create={create}
        username={username}
        email={email}
        country={country}
        onUsernameChange={setUsername}
        onEmailChange={setEmail}
        onCountryChange={setCountry}
      />
      <p className="text-sm text-slate-600">
        {create
          ? "The account holder sets their password using an email link. Parent assignment remains a separate hierarchy operation."
          : "Email changes require the account holder’s Better Auth verification flow. Parent assignment remains a separate hierarchy operation."}
      </p>
    </CrudEdit>
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
    <Card className="col-span-full p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Platform capabilities
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            These are direct assignments. Master operator authority is evaluated separately from the
            capabilities stored on the account.
          </p>
        </div>
        {rootAssigned && <Badge variant="destructive">system.root · master authority</Badge>}
      </div>
      <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-semibold text-rose-950">
              {CAPABILITY_METADATA["system.root"].label}
            </h4>
            <code className="mt-1 inline-block rounded bg-white/70 px-2 py-1 text-xs text-rose-900">
              system.root
            </code>
          </div>
          <Badge variant={rootAssigned ? "destructive" : "secondary"}>
            {rootAssigned ? "Directly assigned" : "Not assigned"}
          </Badge>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-rose-900">
          {CAPABILITY_METADATA["system.root"].description}
        </p>
        {manageable.has("system.root") && (
          <div className="mt-4">
            <Button
              variant="destructive"
              disabled={saving === "system.root"}
              onClick={() => void onChange("system.root", rootAssigned ? "revoke" : "grant")}
            >
              {saving === "system.root"
                ? "Saving…"
                : rootAssigned
                  ? "Revoke master authority"
                  : "Grant master authority"}
            </Button>
          </div>
        )}
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-200">
        {ordinary.map((capability) => {
          const metadata = CAPABILITY_METADATA[capability];
          const grantedAt = assigned.get(capability);
          const canChange = manageable.has(capability);
          return (
            <div
              key={capability}
              className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <strong className="text-sm text-slate-900">{metadata.label}</strong>
                <code className="mt-1 block w-fit max-w-full break-all rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  {capability}
                </code>
                <p className="mt-2 text-sm leading-5 text-slate-600">{metadata.description}</p>
                {grantedAt && (
                  <p className="mt-1 text-xs text-slate-500">
                    Granted {new Date(grantedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Badge variant={grantedAt ? "default" : "secondary"}>
                  {grantedAt ? "Assigned" : "Not assigned"}
                </Badge>
                {canChange && (
                  <Button
                    type="button"
                    size="xs"
                    variant={grantedAt ? "outline" : "secondary"}
                    disabled={saving === capability}
                    onClick={() => void onChange(capability, grantedAt ? "revoke" : "grant")}
                  >
                    {saving === capability ? "Saving…" : grantedAt ? "Revoke" : "Grant"}
                  </Button>
                )}
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
    <Card className="col-span-full p-5 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          API access
        </p>
        <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
          Credentials for this account
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
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
                    size="xs"
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
