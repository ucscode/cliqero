"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import AsyncSelect from "react-select/async";
import { useCrudCollection } from "@/components/crud/use-collection";
import { CrudIndex } from "@/components/crud/index-page";
import { CrudSortSelect } from "@/components/crud/sort-select";
import type { CrudColumn } from "@/components/crud/table";
import { apiFetch, type OperatorAccountPage, type OperatorAccountSummary } from "@/lib/api-client";
import { useToast } from "../../toast/provider";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select } from "../../ui/select";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "../ui/bulk-outcome";
import { OperatorValueCell } from "../ui/data-cells";
import {
  apiKeyCollectionQuery,
  apiKeyFiltersEqual,
  INITIAL_API_KEY_FILTERS,
  operatorApiKeyRowActions,
  type ApiKeyCollectionFilters,
  type OperatorApiKeyRow,
} from "./model";

type AccountOption = { value: string; label: string; account: OperatorAccountSummary };
type ApiKeyCollectionPage = {
  items: OperatorApiKeyRow[];
  next_cursor: string | null;
};
type ApiKeyBulkOutcome = {
  succeeded: string[];
  failed: Array<{ id: string; message: string }>;
};

const selectStyles = {
  control: (base: object) => ({ ...base, minHeight: 42 }),
  menuPortal: (base: object) => ({ ...base, zIndex: 80 }),
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "API keys are temporarily unavailable.";

async function searchAccounts(query: string): Promise<AccountOption[]> {
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

export function OperatorApiKeys() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<ApiKeyCollectionFilters["state"]>("all");
  const [accountFilter, setAccountFilter] = useState<AccountOption | null>(null);
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_API_KEY_FILTERS);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const readPage = useCallback(
    async (filters: ApiKeyCollectionFilters, cursor: string | null, pageSize: number) => {
      const query = apiKeyCollectionQuery(filters, cursor, pageSize);
      const page = await apiFetch<ApiKeyCollectionPage>(`/internal/api-keys?${query}`);
      return { items: page.items, nextCursor: page.next_cursor };
    },
    [],
  );
  const collection = useCrudCollection(readPage, INITIAL_API_KEY_FILTERS);

  function draftFilters(): ApiKeyCollectionFilters {
    const [sort, direction] = sortChoice.split(":") as [
      ApiKeyCollectionFilters["sort"],
      ApiKeyCollectionFilters["direction"],
    ];
    return { search, accountId: accountFilter?.value ?? null, state, sort, direction };
  }

  async function applyDraft() {
    const next = draftFilters();
    const applied = await collection.apply(next);
    if (applied) {
      setAppliedFilters(next);
      setBulkOutcome(null);
      setActionError(null);
    }
    return applied;
  }

  async function clearFilters() {
    setSearch("");
    setState("all");
    setAccountFilter(null);
    setSortChoice("created:desc");
    const applied = await collection.apply(INITIAL_API_KEY_FILTERS);
    if (applied) {
      setAppliedFilters(INITIAL_API_KEY_FILTERS);
      setBulkOutcome(null);
      setActionError(null);
    }
    return applied;
  }

  async function remove(key: OperatorApiKeyRow) {
    if (!window.confirm(`Delete API key “${key.name}”? It will stop authenticating immediately.`))
      return;
    try {
      await apiFetch(`/internal/api-keys/${key.id}`, { method: "DELETE" });
      await collection.refresh();
      toast.success("API key deleted.");
    } catch (cause) {
      setActionError(message(cause));
    }
  }

  async function deleteSelected(keys: readonly OperatorApiKeyRow[]) {
    if (!keys.length) return false;
    if (
      !window.confirm(`Delete ${keys.length} selected API key(s)? They will stop authenticating.`)
    )
      return false;
    try {
      const outcome = await apiFetch<ApiKeyBulkOutcome>("/internal/api-keys/actions/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: keys.filter((key) => key.state !== "deleted").map((key) => key.id),
        }),
      });
      await collection.refresh();
      if (outcome.failed.length) {
        const names = new Map(keys.map((key) => [key.id, key.name]));
        setBulkOutcome({
          resource: "API keys",
          selectedCount: keys.length,
          failures: outcome.failed.map(({ id, message: reason }) => ({
            id,
            label: names.get(id) ?? id,
            message: reason,
          })),
        });
        return false;
      }
      setBulkOutcome(null);
      toast.success(`${outcome.succeeded.length} API key(s) deleted.`);
      return true;
    } catch (cause) {
      setActionError(message(cause));
      return false;
    }
  }

  const columns: readonly CrudColumn<OperatorApiKeyRow>[] = [
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

  return (
    <CrudIndex
      eyebrow="Access management"
      title="API keys"
      description="Manage API credentials across accounts you are authorized to administer. Secret values are never shown in the collection."
      headerActions={
        <Button asChild>
          <Link href="/operator/api-keys/new">New API key</Link>
        </Button>
      }
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
              loadOptions={searchAccounts}
              value={accountFilter}
              onChange={setAccountFilter}
              placeholder="All manageable accounts"
              isClearable
              styles={selectStyles}
              menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="api-key-state">State</Label>
            <Select
              id="api-key-state"
              value={state}
              onChange={(event) => setState(event.target.value as typeof state)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="deleted">Deleted</option>
            </Select>
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
        return applyDraft();
      }}
      onFiltersReset={clearFilters}
      filtersDirty={!apiKeyFiltersEqual(draftFilters(), appliedFilters)}
      toolbarActions={
        <Button type="submit" variant="action" disabled={collection.loading}>
          {collection.loading ? "Applying…" : "Apply"}
        </Button>
      }
      beforeTable={
        <>
          {actionError && (
            <p role="alert" className="text-sm text-red-700">
              {actionError}
            </p>
          )}
          {bulkOutcome && <OperatorBulkOutcome outcome={bulkOutcome} />}
        </>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(key) => key.id}
      actions={(key) => operatorApiKeyRowActions(key, remove)}
      actionLabel={(key) => `Actions for ${key.name}`}
      selection={{
        labelForItem: (key) => `API key ${key.name}`,
        canSelectItem: (key) => key.state !== "deleted",
      }}
      bulkActions={(selected) =>
        selected.length && selected.every((key) => key.state !== "deleted")
          ? [
              {
                value: "delete",
                label: "Delete selected",
                destructive: true,
                onSelect: deleteSelected,
              },
            ]
          : []
      }
      pagination={{
        hasPrevious: collection.hasPrevious,
        hasNext: collection.hasNext,
        onPrevious: () => void collection.previous(),
        onNext: () => void collection.next(),
        summary: `${collection.items.length} API keys on this page`,
      }}
      loading={collection.loading}
      initialized={collection.initialized}
      error={collection.error}
      onRetry={() => void collection.retry()}
      emptyTitle="No API keys found"
      emptyDescription="Create an API key to grant scoped access to an account."
      sectionTitle="API key collection"
      sectionDescription="Only metadata is displayed; raw credentials are returned once at creation."
    />
  );
}
