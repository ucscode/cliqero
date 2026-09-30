"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import AsyncSelect from "react-select/async";
import {
  apiFetch,
  type OperatorAccountPage,
  type OperatorAccountSummary,
  type OperatorApiKeyPage,
  type ApiKeyMetadata,
} from "@/lib/api-client";
import { API_SCOPE_METADATA } from "@/modules/identity/api/scopes";
import { useToast } from "../toast/provider";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select as NativeSelect } from "../ui/select";
import { MultiSelect } from "../ui/multi-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { OperatorErrorState } from "./ui/error-state";
import { CrudIndex } from "@/components/crud/index-page";
import { CrudSortSelect } from "@/components/crud/sort-select";
import { OperatorValueCell } from "./ui/data-cells";
import type { CrudColumn } from "@/components/crud/table";
import type { OperatorAction } from "./ui/actions-menu";

type KeyRow = ApiKeyMetadata & {
  account_id: string;
  account_username: string;
  account_email: string | null;
  state: "active" | "expired" | "deleted";
};
type AccountOption = { value: string; label: string; account: OperatorAccountSummary };
const selectStyles = {
  control: (base: object) => ({ ...base, minHeight: 42 }),
  menuPortal: (base: object) => ({ ...base, zIndex: 80 }),
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "API keys are temporarily unavailable.";

export function OperatorApiKeys() {
  const toast = useToast();
  const [items, setItems] = useState<KeyRow[]>([]);
  const [manageableScopes, setManageableScopes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("all");
  const [accountFilter, setAccountFilter] = useState<AccountOption | null>(null);
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<KeyRow | null>(null);
  const [account, setAccount] = useState<AccountOption | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const loadKeys = useCallback(
    async (overrides?: {
      search: string;
      state: string;
      accountFilter: AccountOption | null;
      sortChoice: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const filters = overrides ?? { search, state, accountFilter, sortChoice };
        const [sort, direction] = filters.sortChoice.split(":");
        const params = new URLSearchParams({ state: filters.state, sort, direction });
        if (filters.search.trim()) params.set("search", filters.search.trim());
        if (filters.accountFilter) params.set("account_id", filters.accountFilter.value);
        const result = await apiFetch<OperatorApiKeyPage & { items: KeyRow[] }>(
          `/internal/api-keys?${params}`,
        );
        setItems(result.items);
        if (account?.value) setManageableScopes(result.manageable_scopes);
      } catch (cause) {
        setError(message(cause));
      } finally {
        setLoading(false);
      }
    },
    [account, accountFilter, search, sortChoice, state],
  );

  // This effect starts the initial server-backed collection load.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadKeys();
  }, [loadKeys]);

  async function loadAccounts(query: string): Promise<AccountOption[]> {
    if (!query.trim()) return [];
    const result = await apiFetch<OperatorAccountPage>(
      `/api/accounts?search=${encodeURIComponent(query.trim())}&limit=10`,
    );
    return result.items.map((candidate) => ({
      value: candidate.id,
      label: `@${candidate.username} · ${candidate.email ?? candidate.id}`,
      account: candidate,
    }));
  }

  async function chooseAccount(value: AccountOption | null) {
    setAccount(value);
    setScopes([]);
    if (!value) {
      setManageableScopes([]);
      return;
    }
    try {
      const result = await apiFetch<OperatorApiKeyPage>(
        `/internal/api-keys?account_id=${value.value}`,
      );
      setManageableScopes(result.manageable_scopes);
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function openCreate() {
    setEditing(null);
    setAccount(null);
    setName("");
    setScopes([]);
    setExpiry("");
    setSecret(null);
    setManageableScopes([]);
    setEditorOpen(true);
  }

  async function openEdit(key: KeyRow) {
    setLoading(true);
    setError(null);
    try {
      const [{ item }, accounts] = await Promise.all([
        apiFetch<{ item: KeyRow }>(`/internal/api-keys/${key.id}`),
        loadAccounts(key.account_username),
      ]);
      const selected = accounts.find((candidate) => candidate.value === key.account_id) ?? {
        value: key.account_id,
        label: `@${key.account_username} · ${key.account_email ?? key.account_id}`,
        account: {
          id: key.account_id,
          username: key.account_username,
          email: key.account_email,
        } as OperatorAccountSummary,
      };
      setEditing(item);
      setAccount(selected);
      setName(item.name);
      setScopes(item.scopes);
      setExpiry(item.expires_at ? new Date(item.expires_at).toISOString().slice(0, 10) : "");
      const result = await apiFetch<OperatorApiKeyPage>(
        `/internal/api-keys?account_id=${key.account_id}`,
      );
      setManageableScopes(result.manageable_scopes);
      setEditorOpen(true);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        scopes,
        expires_at: expiry ? new Date(`${expiry}T23:59:59.000Z`).toISOString() : null,
      };
      if (editing) {
        await apiFetch(`/internal/api-keys/${editing.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("API key updated.");
      } else {
        const created = await apiFetch<{ secret: string } & KeyRow>("/internal/api-keys", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, account_id: account.value }),
        });
        setSecret(created.secret);
        toast.success("API key created.");
      }
      setEditorOpen(false);
      await loadKeys();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }

  async function remove(key: KeyRow) {
    if (!window.confirm(`Delete API key “${key.name}”? It will stop authenticating immediately.`))
      return;
    try {
      await apiFetch(`/internal/api-keys/${key.id}`, { method: "DELETE" });
      toast.success("API key deleted.");
      await loadKeys();
    } catch (cause) {
      setError(message(cause));
    }
  }

  const columns: readonly CrudColumn<KeyRow>[] = [
    {
      key: "name",
      label: "Name",
      primary: true,
      render: (key) => (
        <div className="min-w-0">
          <strong className="break-words">{key.name}</strong>
          <p className="text-xs text-slate-500">{key.id}</p>
        </div>
      ),
    },
    {
      key: "account",
      label: "Account",
      render: (key) => (
        <div>
          <strong>@{key.account_username}</strong>
          <p className="text-xs text-slate-500">{key.account_email ?? ""}</p>
        </div>
      ),
    },
    {
      key: "scopes",
      label: "Scopes",
      render: (key) => (
        <div className="flex max-w-72 flex-wrap gap-1">
          {key.scopes.map((scope) => (
            <span
              key={scope}
              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs"
            >
              {scope}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "state",
      label: "State",
      render: (key) => <OperatorValueCell>{key.state}</OperatorValueCell>,
    },
    {
      key: "created",
      label: "Created",
      render: (key) => new Date(key.created_at).toLocaleDateString(),
    },
    {
      key: "expires",
      label: "Expires",
      render: (key) => (key.expires_at ? new Date(key.expires_at).toLocaleDateString() : "Never"),
    },
  ];
  const actions = (key: KeyRow): readonly OperatorAction[] => [
    ...(key.state === "active"
      ? [{ type: "action" as const, label: "Edit API key", onSelect: () => void openEdit(key) }]
      : []),
    ...(key.state !== "deleted"
      ? [
          {
            type: "action" as const,
            label: "Delete API key",
            destructive: true,
            onSelect: () => void remove(key),
          },
        ]
      : []),
  ];

  return (
    <>
      <CrudIndex
        eyebrow="Access management"
        title="API keys"
        description="Manage API credentials across accounts you are authorized to administer. Secret values are never shown in the collection."
        headerActions={<Button onClick={() => void openCreate()}>New API key</Button>}
        filters={
          <>
            <div className="grid gap-2">
              <Label htmlFor="api-key-search">Search</Label>
              <Input
                id="api-key-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, username, email, or key ID"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="api-key-account-filter">Account</Label>
              <AsyncSelect<AccountOption, false>
                inputId="api-key-account-filter"
                cacheOptions
                defaultOptions={false}
                loadOptions={loadAccounts}
                value={accountFilter}
                onChange={(value) => setAccountFilter(value)}
                placeholder="All manageable accounts"
                isClearable
                styles={selectStyles}
                menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="api-key-state">State</Label>
              <NativeSelect
                id="api-key-state"
                value={state}
                onChange={(event) => setState(event.target.value)}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="deleted">Deleted</option>
              </NativeSelect>
            </div>
          </>
        }
        sort={
          <CrudSortSelect
            value={sortChoice}
            onChange={setSortChoice}
            options={[
              { value: "created:desc", label: "Newest", sort: "created", direction: "desc" },
              { value: "created:asc", label: "Oldest", sort: "created", direction: "asc" },
              { value: "name:asc", label: "Name A–Z", sort: "name", direction: "asc" },
              { value: "name:desc", label: "Name Z–A", sort: "name", direction: "desc" },
              { value: "expires:asc", label: "Soonest expiry", sort: "expires", direction: "asc" },
            ]}
          />
        }
        onFiltersSubmit={async (event) => {
          event.preventDefault();
          await loadKeys();
        }}
        onFiltersReset={async () => {
          const reset = {
            search: "",
            state: "all",
            accountFilter: null,
            sortChoice: "created:desc",
          };
          setSearch(reset.search);
          setState(reset.state);
          setAccountFilter(reset.accountFilter);
          setSortChoice(reset.sortChoice);
          await loadKeys(reset);
        }}
        filtersDirty={Boolean(
          search || state !== "all" || accountFilter || sortChoice !== "created:desc",
        )}
        items={items}
        columns={columns}
        getRowKey={(key) => key.id}
        actions={actions}
        actionLabel={(key) => `Actions for ${key.name}`}
        loading={loading}
        error={error}
        onRetry={() => void loadKeys()}
        emptyTitle="No API keys found"
        emptyDescription="Create an API key to grant scoped access to an account."
        sectionTitle="API key collection"
        sectionDescription="Only metadata is displayed; raw credentials are returned once at creation."
      />
      {secret && (
        <Alert className="fixed bottom-4 right-4 z-40 max-w-xl border-emerald-300 bg-white shadow-xl">
          <div className="grid gap-3">
            <strong>Copy this API key now. It is shown only once.</strong>
            <code className="break-all rounded bg-slate-100 p-2">{secret}</code>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void navigator.clipboard.writeText(secret)}
              >
                Copy key
              </Button>
              <Button type="button" onClick={() => setSecret(null)}>
                Done
              </Button>
            </div>
          </div>
        </Alert>
      )}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit API key" : "New API key"}</DialogTitle>
          </DialogHeader>
          {error && <OperatorErrorState message={error} />}
          <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
            <div className="grid gap-2">
              {editing ? (
                <p className="text-sm font-semibold text-slate-800">Account</p>
              ) : (
                <Label htmlFor="api-key-account">Account</Label>
              )}
              {editing ? (
                <p className="rounded bg-slate-50 p-3 text-sm">
                  @{account?.account.username} · {account?.account.email ?? account?.value}
                </p>
              ) : (
                <AsyncSelect<AccountOption, false>
                  inputId="api-key-account"
                  cacheOptions
                  defaultOptions={false}
                  loadOptions={loadAccounts}
                  value={account}
                  onChange={(value) => void chooseAccount(value)}
                  placeholder="Search accounts by username or email"
                  styles={selectStyles}
                  menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="api-key-scopes">Scopes / permissions</Label>
              <MultiSelect
                label="API key scopes"
                inputId="api-key-scopes"
                options={manageableScopes.map((scope) => ({
                  value: scope,
                  label: API_SCOPE_METADATA[scope as keyof typeof API_SCOPE_METADATA]?.label
                    ? `${API_SCOPE_METADATA[scope as keyof typeof API_SCOPE_METADATA].label} (${scope})`
                    : scope,
                }))}
                value={scopes}
                onChange={setScopes}
              />
              <p className="text-xs leading-5 text-slate-500">
                A key&apos;s scope never exceeds the owning account&apos;s capabilities.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="api-key-expiry">Expiry</Label>
              <Input
                id="api-key-expiry"
                type="date"
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
              />
              <p className="text-xs leading-5 text-slate-500">Leave blank for no expiry.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  saving || !account || scopes.some((scope) => !manageableScopes.includes(scope))
                }
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Create API key"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
