"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
  hasAllCapabilities,
  hasCapability,
  type Capability,
} from "@/modules/identity/capabilities";
import { OperatorPrimaryCell, OperatorSecondaryText, OperatorValueCell } from "./ui/data-cells";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "./ui/bulk-outcome";
import { OperatorLoadingState } from "./ui/loading-state";
import { OperatorSection } from "./ui/section";
import { useOperatorConfirmation } from "./ui/confirmation";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "@/components/crud/index-page";
import { CrudDetail } from "@/components/crud/detail";
import { CrudFieldList } from "@/components/crud/field-list";
import { CrudEdit } from "@/components/crud/edit";
import { useCrudCollection } from "@/components/crud/use-collection";
import { CrudSortSelect } from "@/components/crud/sort-select";
import type { CrudColumn } from "@/components/crud/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { HoneypotField } from "../honeypot-field";
import { Input } from "../ui/input";
import { Alert } from "../ui/alert";
import { CountrySelect } from "../country-select";
import { Label, RequiredLabel } from "../ui/label";
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";
import { OperatorResourceLink } from "./ui/resource-link";
import { useToast } from "../toast/provider";
import { OperatorAccountSelector } from "./ui/account-selector";

function message(error: unknown) {
  return error instanceof Error ? error.message : "The account service is temporarily unavailable.";
}

async function searchParentAccounts(query: string, currentAccountId: string) {
  if (!query.trim()) return [];
  const result = await apiFetch<OperatorAccountPage>(
    `/api/accounts?search=${encodeURIComponent(query.trim())}&limit=10`,
  );
  return result.items.filter((candidate) => candidate.id !== currentAccountId);
}

export function operatorUserRowActions(
  account: OperatorAccountSummary,
  canManage: boolean,
  onDelete?: (account: OperatorAccountSummary) => void,
  canDelete = canManage,
) {
  return [
    { type: "link" as const, label: "View", href: `/operator/users/${account.id}` },
    ...(canManage
      ? [
          {
            type: "link" as const,
            label: "Edit",
            href: `/operator/users/${account.id}/edit`,
          },
          ...(onDelete && canDelete
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
      requiredCapability: "hierarchy.manage" as const,
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
  canDelete = false,
  capabilities = [],
  deletedNotice = false,
}: {
  canManage?: boolean;
  canDelete?: boolean;
  capabilities?: readonly Capability[];
  deletedNotice?: boolean;
}) {
  const confirm = useOperatorConfirmation();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [sort, direction] = sortChoice.split(":") as ["created" | "username", "asc" | "desc"];
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  useEffect(() => {
    if (deletedNotice) toast.info("Account deleted. Historical platform records remain available.");
  }, [deletedNotice, toast]);
  const collection = useCrudCollection(
    async (filters: { search: string; sort: string; direction: string }, cursor, pageSize) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (filters.search) params.set("search", filters.search);
      params.set("sort", filters.sort);
      params.set("direction", filters.direction);
      if (cursor) params.set("cursor", cursor);
      return apiFetch<OperatorAccountPage>(`/api/accounts?${params}`);
    },
    { search: "", sort: "created", direction: "desc" },
  );

  return (
    <OperatorUsersListView
      page={
        !collection.initialized
          ? null
          : { items: collection.items, nextCursor: collection.nextCursor }
      }
      search={search}
      appliedSearch={appliedSearch}
      sort={
        <CrudSortSelect
          value={sortChoice}
          onChange={setSortChoice}
          options={[
            { value: "created:desc", label: "Newest", sort: "created", direction: "desc" },
            { value: "created:asc", label: "Oldest", sort: "created", direction: "asc" },
            { value: "username:asc", label: "Username A–Z", sort: "username", direction: "asc" },
            { value: "username:desc", label: "Username Z–A", sort: "username", direction: "desc" },
          ]}
        />
      }
      loading={collection.loading}
      error={collection.error}
      canManage={canManage}
      canDelete={canDelete}
      capabilities={capabilities}
      onSearchChange={setSearch}
      onSearch={async (event) => {
        event.preventDefault();
        return applyOperatorUserSearch(
          (value) => collection.apply({ search: value, sort, direction }),
          search,
          setAppliedSearch,
        );
      }}
      onRetry={() => void collection.retry()}
      actionError={actionError}
      bulkOutcome={bulkOutcome}
      onDelete={async (account) => {
        if (
          !(await confirm({
            title: "Delete account?",
            description: `Delete @${account.username}? Account access and credentials will be removed; historical platform records will remain.`,
            confirmLabel: "Delete",
            destructive: true,
          }))
        )
          return;
        try {
          const results = await runOperatorBulkAction({
            resource: "accounts",
            action: "delete",
            ids: [account.id],
          });
          if (results.failed.length) throw new Error(results.failed[0]!.message);
          setActionError(null);
          await collection.refresh();
          toast.success(`@${account.username} was deleted. Historical platform records remain.`);
        } catch (cause) {
          setActionError(message(cause));
        }
      }}
      onBulkDelete={async (accounts) => {
        if (
          !(await confirm({
            title: "Delete accounts?",
            description: `Delete ${accounts.length} selected account(s)? Account access and credentials will be removed; historical platform records will remain.`,
            confirmLabel: "Delete",
            destructive: true,
          }))
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
        toast.success(
          `${results.succeeded.length} account(s) deleted. Historical platform records remain.`,
        );
        return true;
      }}
      hasPrevious={collection.hasPrevious}
      onPrevious={() => void collection.previous()}
      onNext={() => void collection.next()}
      filtersDirty={Boolean(search.trim() || appliedSearch || sortChoice !== "created:desc")}
      onFiltersReset={async () => {
        const ok = await collection.apply({ search: "", sort: "created", direction: "desc" });
        if (ok) {
          setSearch("");
          setAppliedSearch("");
          setSortChoice("created:desc");
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
  sort,
  loading,
  error,
  canManage,
  canDelete,
  capabilities = [],
  onSearchChange,
  onSearch,
  onRetry,
  onDelete,
  onBulkDelete,
  actionError,
  bulkOutcome,
  hasPrevious,
  onPrevious,
  onNext,
  filtersDirty,
  onFiltersReset,
}: {
  page: OperatorAccountPage | null;
  search: string;
  appliedSearch: string;
  sort?: ReactNode;
  loading: boolean;
  error: string | null;
  canManage?: boolean;
  canDelete?: boolean;
  capabilities?: readonly Capability[];
  onSearchChange: (value: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => boolean | Promise<boolean>;
  onRetry: () => void;
  onDelete?: (account: OperatorAccountSummary) => void;
  onBulkDelete?: (accounts: readonly OperatorAccountSummary[]) => Promise<boolean>;
  actionError?: string | null;
  bulkOutcome?: OperatorBulkOutcomeData | null;
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
      capabilities={capabilities}
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
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Username, email, or account ID"
          />
        </OperatorFilterField>
      }
      onFiltersSubmit={onSearch}
      sort={sort}
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
      selection={
        canDelete ? { labelForItem: (account) => `account ${account.username}` } : undefined
      }
      bulkActions={
        canDelete && onBulkDelete
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
        </>
      }
      actions={(account) =>
        operatorUserRowActions(account, Boolean(canManage), onDelete, Boolean(canDelete))
      }
      actionLabel={(account) => `Actions for @${account.username}`}
      loading={loading}
      initialized={page !== null}
      loadingLabel="Loading users"
      error={error}
      onRetry={onRetry}
      emptyTitle="No users found"
      emptyDescription={operatorUsersEmptyDescription(appliedSearch)}
      pagination={
        page
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
  capabilities = [],
}: {
  accountId: string;
  canManage?: boolean;
  capabilities?: readonly Capability[];
}) {
  const router = useRouter();
  const confirm = useOperatorConfirmation();
  const [account, setAccount] = useState<OperatorAccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  const [selectedParent, setSelectedParent] = useState<OperatorAccountSummary | null>(null);
  const [capabilityView, setCapabilityView] = useState<CapabilityAdministrationView | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [capabilitySaving, setCapabilitySaving] = useState<Capability | "set" | null>(null);
  const [capabilityDraft, setCapabilityDraft] = useState<Capability[]>([]);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

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
      const view = await apiFetch<CapabilityAdministrationView>(
        `/api/accounts/${accountId}/capabilities`,
      );
      setCapabilityView(view);
      setCapabilityDraft(
        view.assignments
          .map((item) => item.capability as Capability)
          .filter((capability) => capability !== "system.root"),
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
    void (async () => {
      const loaded = await load();
      if (!loaded || loaded.deletedAt) {
        setCapabilityLoading(false);
        return;
      }
      await loadCapabilities();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function saveCapabilities() {
    if (!capabilityView || capabilitySaving) return;
    setCapabilitySaving("set");
    setCapabilityError(null);
    try {
      await apiFetch(`/api/accounts/${accountId}/capabilities`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          capabilities: capabilityDraft.filter((capability) =>
            capabilityView.manageableCapabilities.includes(capability),
          ),
        }),
      });
      await loadCapabilities();
      toast.success("Capabilities saved.");
    } catch (cause) {
      setCapabilityError(message(cause));
    } finally {
      setCapabilitySaving(null);
    }
  }

  async function changeCapability(capability: Capability, action: "grant" | "revoke") {
    if (!capabilityView || capabilitySaving) return;
    if (action === "revoke" && capability === "system.root") {
      const warning = capabilityView.isSelf
        ? "Remove your own master operator authority? Another root account must remain."
        : "Remove master operator authority from this account? Another root account must remain.";
      if (
        !(await confirm({
          title: "Remove root authority?",
          description: warning,
          confirmLabel: "Remove",
          destructive: true,
        }))
      )
        return;
    } else if (action === "grant" && capability === "system.root") {
      if (
        !(await confirm({
          title: "Grant root authority?",
          description: "Grant master operator authority to this account?",
          confirmLabel: "Grant",
        }))
      )
        return;
    }
    setCapabilitySaving(capability);
    setCapabilityError(null);
    try {
      await apiFetch(`/api/accounts/${accountId}/capabilities`, {
        method: action === "revoke" ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "grant" ? { capability } : { ids: [capability] }),
      });
      await loadCapabilities();
      toast.success("Master authority updated.");
    } catch (cause) {
      setCapabilityError(message(cause));
    } finally {
      setCapabilitySaving(null);
    }
  }

  async function reassign(parent: OperatorAccountSummary | null) {
    if (!account || parent?.id === account.id || parent?.id === account.parent?.id) return;
    setSaving(true);
    setParentError(null);
    try {
      await apiFetch(`/api/hierarchy/${account.id}/parent`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parent_account_id: parent?.id ?? null }),
      });
      const updated = await load();
      if (!updated) throw new Error("Parent was updated, but referral context could not refresh.");
      setSelectedParent(null);
      toast.success(parent ? "Parent reassigned successfully." : "Parent removed successfully.");
    } catch (cause) {
      setParentError(message(cause));
    } finally {
      setSaving(false);
    }
  }

  async function loadParentOptions(query: string): Promise<OperatorAccountSummary[]> {
    setParentError(null);
    try {
      return await searchParentAccounts(query, accountId);
    } catch (cause) {
      setParentError(message(cause));
      return [];
    }
  }

  async function deleteAccount() {
    if (!account || deleting) return;
    if (
      !(await confirm({
        title: "Delete account?",
        description: `Delete @${account.username}? Account access and credentials will be removed; historical platform records will remain.`,
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch("/api/accounts", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [account.id] }),
      });
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
      fieldsTitle="Identity"
      fieldsSurface={false}
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
        { label: "Username", value: `@${account.username}`, className: "break-words" },
        {
          label: "Email",
          value: account.email ?? "No authentication email",
          className: "break-all",
        },
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
          {!account.deletedAt && !capabilityLoading && capabilityView && (
            <CapabilityCard
              view={capabilityView}
              saving={capabilitySaving}
              onChange={changeCapability}
              draft={capabilityDraft}
              onToggle={(capability, checked) =>
                setCapabilityDraft((current) =>
                  checked
                    ? [...new Set([...current, capability])]
                    : current.filter((item) => item !== capability),
                )
              }
              onSave={() => void saveCapabilities()}
            />
          )}
          {!account.deletedAt && capabilityLoading && (
            <OperatorLoadingState variant="section" label="Loading platform capabilities" />
          )}
          {!account.deletedAt && capabilityError && (
            <OperatorErrorState message={capabilityError} />
          )}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="grid content-start gap-4">
              <OperatorSection title="Referral context" surface>
                <div className="grid content-start gap-5">
                  <CrudFieldList
                    layout="stacked"
                    fields={[
                      {
                        label: "Parent",
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
                  {!account.deletedAt &&
                    hasAllCapabilities(capabilities, ["accounts.read", "hierarchy.manage"]) && (
                      <div className="grid gap-3">
                        <div className="grid gap-2">
                          <Label htmlFor="operator-new-parent">New parent</Label>
                          <OperatorAccountSelector
                            inputId="operator-new-parent"
                            loadAccounts={loadParentOptions}
                            value={selectedParent}
                            isDisabled={saving}
                            onChange={(option) => {
                              setSelectedParent(option);
                              setParentError(null);
                            }}
                            placeholder="Search username, email or account ID"
                            excludedAccountId={account.id}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            disabled={
                              saving ||
                              !selectedParent ||
                              selectedParent.id === account.id ||
                              selectedParent.id === account.parent?.id
                            }
                            onClick={() => void reassign(selectedParent)}
                          >
                            {saving ? "Saving…" : "Assign parent"}
                          </Button>
                          {account.parent && (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={saving}
                              onClick={async () => {
                                if (
                                  await confirm({
                                    title: "Remove parent?",
                                    description: `Remove @${account.parent!.username} as this account’s parent? Descendants will remain attached.`,
                                    confirmLabel: "Remove parent",
                                    destructive: true,
                                  })
                                )
                                  await reassign(null);
                              }}
                            >
                              Remove parent
                            </Button>
                          )}
                        </div>
                        {saving && (
                          <p role="status" className="text-sm text-slate-600">
                            Updating referral parent…
                          </p>
                        )}
                        {parentError && <Alert role="alert">{parentError}</Alert>}
                      </div>
                    )}
                  {hasCapability(capabilities, "hierarchy.manage") && (
                    <Button asChild variant="secondary" className="w-fit">
                      <Link href={`/operator/network?root=${account.id}`}>View network</Link>
                    </Button>
                  )}
                </div>
              </OperatorSection>
            </div>
            <OperatorSection title="Commerce" surface className="lg:col-start-2">
              <CrudFieldList
                layout="stacked"
                fields={[
                  {
                    label: "Purchases",
                    value: (
                      <OperatorResourceLink
                        capabilities={capabilities}
                        requiredCapability="finance.read"
                        href={`/operator/purchases?buyer=${encodeURIComponent(account.id)}`}
                      >
                        {account.purchaseCount.toLocaleString("en-US")}
                      </OperatorResourceLink>
                    ),
                  },
                ]}
              />
            </OperatorSection>
          </div>
        </>
      }
    />
  );
}

export function OperatorUserFormFields({
  username,
  email,
  country,
  onUsernameChange,
  onEmailChange,
  onCountryChange,
}: {
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
        <RequiredLabel htmlFor="operator-account-username">Username</RequiredLabel>
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
      <div className="grid gap-2">
        <RequiredLabel htmlFor="operator-account-email">Email</RequiredLabel>
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
  const [credentialMode, setCredentialMode] = useState<"email" | "password">("email");
  const [notifyUser, setNotifyUser] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const toast = useToast();

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
    try {
      if (create) {
        if (credentialMode === "password" && password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }
        const result = await apiFetch<{
          account: OperatorAccountDetail;
          credentialSetupMode: "email" | "password";
          passwordSetupEmailRequested: boolean;
          accountCreatedEmailRequested: boolean;
        }>("/api/accounts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            username: username.trim(),
            ...(country ? { country } : {}),
            credential_setup:
              credentialMode === "email"
                ? { mode: "email" }
                : { mode: "password", password, confirm_password: confirmPassword },
            notify_user: credentialMode === "email" ? true : notifyUser,
          }),
        });
        const confirmation =
          result.credentialSetupMode === "password"
            ? notifyUser
              ? result.accountCreatedEmailRequested
                ? "Account created. The account holder was notified; the password was not included."
                : "Account created. The account holder notification could not be sent."
              : "Account created with the password supplied by the operator."
            : result.passwordSetupEmailRequested
              ? "Account created. A password setup link was requested."
              : "Account created. Password setup email could not be requested; the account holder can use Forgot password.";
        toast.success(confirmation);
        router.push(`/operator/users/${result.account.id}`);
        router.refresh();
      } else {
        const account = await apiFetch<OperatorAccountDetail>(`/api/accounts/${accountId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            email: email.trim(),
            country: country || null,
          }),
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
          ? "Choose how the account holder sets their credential, then choose whether to notify them."
          : "Update the account username, authentication email, or country. Referral relationships are managed separately."
      }
      backHref="/operator/users"
      saving={saving}
      loading={loading}
      onSubmit={(event) => void submit(event)}
      error={error}
      submitLabel={create ? "Create user" : "Save changes"}
      savingLabel={create ? "Creating…" : "Saving…"}
      sectionTitle={create ? "Account details" : "Editable profile fields"}
    >
      <OperatorUserFormFields
        username={username}
        email={email}
        country={country}
        onUsernameChange={setUsername}
        onEmailChange={setEmail}
        onCountryChange={setCountry}
      />
      {create && (
        <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:p-5">
          <legend className="px-1 text-sm font-semibold text-slate-900">Credential setup</legend>
          <label className="flex items-start gap-3 text-sm text-slate-800">
            <input
              type="radio"
              name="credential-setup-mode"
              value="email"
              checked={credentialMode === "email"}
              onChange={() => setCredentialMode("email")}
            />
            <span>User chooses password via setup link</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-800">
            <input
              type="radio"
              name="credential-setup-mode"
              value="password"
              checked={credentialMode === "password"}
              onChange={() => setCredentialMode("password")}
            />
            <span>Set password manually</span>
          </label>
          {credentialMode === "password" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <RequiredLabel htmlFor="operator-account-password">Password</RequiredLabel>
                <Input
                  id="operator-account-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <RequiredLabel htmlFor="operator-account-confirm-password">
                  Confirm password
                </RequiredLabel>
                <Input
                  id="operator-account-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
            </div>
          )}
        </fieldset>
      )}
      {create && (
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={credentialMode === "email" || notifyUser}
            disabled={credentialMode === "email"}
            onChange={(event) => setNotifyUser(event.target.checked)}
          />
          <span>
            <span className="block font-medium">Notify user by email</span>
            {credentialMode === "email" && (
              <span className="text-slate-600">Required when sending a password setup link.</span>
            )}
            {credentialMode === "password" && (
              <span className="text-slate-600">
                The email will not contain the password; communicate it separately.
              </span>
            )}
          </span>
        </label>
      )}
      <p className="text-sm text-slate-600">
        {create
          ? "Choose how the account holder receives their initial password. Parent assignment remains a separate hierarchy operation."
          : "Email updates change the canonical sign-in address and mark it unverified until the new address is verified. Parent assignment remains a separate hierarchy operation."}
      </p>
    </CrudEdit>
  );
}

export function CapabilityCard({
  view,
  saving,
  onChange,
  draft,
  onToggle,
  onSave,
}: {
  view: CapabilityAdministrationView;
  saving: Capability | "set" | null;
  onChange: (capability: Capability, action: "grant" | "revoke") => Promise<void>;
  draft: readonly Capability[];
  onToggle: (capability: Capability, checked: boolean) => void;
  onSave: () => void;
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
      </div>
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-semibold text-slate-900">
              {CAPABILITY_METADATA["system.root"].label}
            </h4>
            <code className="mt-1 inline-block rounded bg-white px-2 py-1 text-xs text-slate-600">
              system.root
            </code>
          </div>
          {rootAssigned && <Badge variant="default">Enabled</Badge>}
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          {CAPABILITY_METADATA["system.root"].description}
        </p>
        {manageable.has("system.root") && (
          <div className="mt-4">
            <Button
              variant={rootAssigned ? "destructive" : "action"}
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
      {view.rootAuthority && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
          Root authority already includes every ordinary platform permission. Existing direct
          assignments are preserved and cannot be edited while this authority is enabled.
        </div>
      )}
      <div className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
        {ordinary.map((capability) => {
          const metadata = CAPABILITY_METADATA[capability];
          const grantedAt = assigned.get(capability);
          const canChange = manageable.has(capability);
          return (
            <div
              key={capability}
              className={`flex items-start gap-3 px-4 py-4 ${view.rootAuthority ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <label className="mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={draft.includes(capability)}
                  disabled={!canChange || saving !== null || view.rootAuthority}
                  onChange={(event) => onToggle(capability, event.target.checked)}
                  aria-label={metadata.label}
                />
              </label>
              <div className="min-w-0">
                <strong
                  className={`text-sm ${view.rootAuthority ? "text-slate-500" : "text-slate-900"}`}
                >
                  {metadata.label}
                </strong>
                <code
                  className={`mt-1 block w-fit max-w-full break-all rounded px-2 py-1 text-xs ${view.rootAuthority ? "bg-slate-100 text-slate-500" : "bg-slate-100 text-slate-600"}`}
                >
                  {capability}
                </code>
                <p
                  className={`mt-2 text-sm leading-5 ${view.rootAuthority ? "text-slate-500" : "text-slate-600"}`}
                >
                  {metadata.description}
                </p>
                {grantedAt && (
                  <p className="mt-1 text-xs text-slate-500">
                    Granted {new Date(grantedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!view.rootAuthority && (
        <div className="mt-4 flex justify-end">
          <Button type="button" disabled={saving !== null} onClick={onSave}>
            {saving === "set" ? "Saving…" : "Save capabilities"}
          </Button>
        </div>
      )}
    </Card>
  );
}
