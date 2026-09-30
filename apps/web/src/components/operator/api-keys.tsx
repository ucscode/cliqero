"use client";

import { useState, type FormEvent } from "react";
import {
  apiFetch,
  type OperatorAccountPage,
  type OperatorAccountSummary,
  type OperatorApiKeyCreated,
  type OperatorApiKeyPage,
  type ApiKeyMetadata,
} from "@/lib/api-client";
import { API_SCOPE_METADATA } from "@/modules/identity/api/scopes";
import { useToast } from "../toast/provider";
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { OperatorPage, OperatorPageHeader } from "./ui/page";
import { OperatorSection } from "./ui/section";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorLoadingState } from "./ui/loading-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { CrudSortSelect } from "@/components/crud/sort-select";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "API keys are temporarily unavailable.";
}

function currentTimestamp() {
  return Date.now();
}

export function OperatorApiKeys() {
  const toast = useToast();
  const [accountQuery, setAccountQuery] = useState("");
  const [matches, setMatches] = useState<OperatorAccountSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchState, setSearchState] = useState<"idle" | "empty" | "error">("idle");
  const [account, setAccount] = useState<OperatorAccountSummary | null>(null);
  const [page, setPage] = useState<OperatorApiKeyPage | null>(null);
  const [observedAt, setObservedAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState("all");
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState<OperatorApiKeyCreated | null>(null);

  async function searchAccounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountQuery.trim()) return;
    setSearching(true);
    setSearchState("idle");
    try {
      const result = await apiFetch<OperatorAccountPage>(
        `/api/accounts?search=${encodeURIComponent(accountQuery.trim())}&limit=10`,
      );
      setMatches(result.items);
      setSearchState(result.items.length ? "idle" : "empty");
    } catch {
      setSearchState("error");
    } finally {
      setSearching(false);
    }
  }

  async function selectAccount(candidate: OperatorAccountSummary) {
    setAccount(candidate);
    setPage(null);
    setLoading(true);
    setError(null);
    setSecret(null);
    try {
      const result = await apiFetch<OperatorApiKeyPage>(
        `/api/accounts/${candidate.id}/api-keys?sort=created&direction=desc`,
      );
      setObservedAt(currentTimestamp());
      setPage(result);
      setScopes([]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function refreshKeys() {
    if (!account) return;
    setLoading(true);
    try {
      const [sort, direction] = sortChoice.split(":");
      const result = await apiFetch<OperatorApiKeyPage>(
        `/api/accounts/${account.id}/api-keys?sort=${sort}&direction=${direction}`,
      );
      setObservedAt(currentTimestamp());
      setPage(result);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<OperatorApiKeyCreated>(
        `/api/accounts/${account.id}/api-keys`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            scopes,
            expires_at: expiry ? new Date(`${expiry}T23:59:59.000Z`).toISOString() : null,
          }),
        },
      );
      setSecret(created);
      setName("");
      setExpiry("");
      setScopes([]);
      toast.info("API key created. Copy the secret below; it is shown only once.");
      await refreshKeys();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function revoke(key: ApiKeyMetadata) {
    if (!account || saving || !window.confirm(`Revoke ${key.name}? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/accounts/${account.id}/api-keys/${key.id}/revoke`, { method: "POST" });
      await refreshKeys();
      toast.success("API key revoked.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  const visibleKeys = (page?.items ?? []).filter((key) => {
    const expired = Boolean(key.expires_at && new Date(key.expires_at).getTime() <= observedAt);
    if (stateFilter === "active") return !key.revoked_at && !expired;
    if (stateFilter === "revoked") return Boolean(key.revoked_at);
    if (stateFilter === "expired") return expired && !key.revoked_at;
    return true;
  });

  return (
    <OperatorPage>
      <OperatorPageHeader
        eyebrow="Account operations"
        title="API keys"
        description="Select an account to inspect and manage its API credentials."
      />
      <OperatorSection
        title="Find account"
        description="Account selection is required before credentials can be listed or created."
        surface
      >
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => void searchAccounts(event)}
        >
          <div className="grid min-w-64 flex-1 gap-2">
            <Label htmlFor="api-key-account-search">Search accounts</Label>
            <Input
              id="api-key-account-search"
              value={accountQuery}
              onChange={(event) => setAccountQuery(event.target.value)}
              placeholder="Username, email, or account ID"
            />
          </div>
          <Button type="submit" variant="action" disabled={searching || !accountQuery.trim()}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>
        {searching && (
          <p role="status" className="mt-3">
            Searching accounts…
          </p>
        )}
        {searchState === "empty" && (
          <p role="status" className="mt-3">
            No matching account found.
          </p>
        )}
        {searchState === "error" && <Alert className="mt-3">Unable to search accounts.</Alert>}
        {matches.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-200">
            {matches.map((candidate) => (
              <li
                key={candidate.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span>
                  <strong>@{candidate.username}</strong>
                  <span className="ml-2 text-sm text-slate-600">
                    {candidate.email ?? candidate.id}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={account?.id === candidate.id ? "action" : "secondary"}
                  onClick={() => void selectAccount(candidate)}
                >
                  Select
                </Button>
              </li>
            ))}
          </ul>
        )}
      </OperatorSection>
      {account && (
        <>
          <OperatorSection title={`Credentials for @${account.username}`} surface>
            <div className="grid gap-5">
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(event) => void createKey(event)}
              >
                <label className="grid gap-1.5 text-sm">
                  Key name
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={100}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  Expiry (optional)
                  <Input
                    type="date"
                    value={expiry}
                    onChange={(event) => setExpiry(event.target.value)}
                  />
                </label>
                <fieldset className="grid gap-2 rounded-md border border-slate-200 p-3 sm:col-span-2">
                  <legend className="px-1 text-sm font-medium">Scopes</legend>
                  {(page?.manageable_scopes ?? []).map((scope) => {
                    const metadata = API_SCOPE_METADATA[scope as keyof typeof API_SCOPE_METADATA];
                    return (
                      <label key={scope} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={scopes.includes(scope)}
                          onChange={(event) =>
                            setScopes((current) =>
                              event.target.checked
                                ? [...new Set([...current, scope])]
                                : current.filter((value) => value !== scope),
                            )
                          }
                        />
                        <span>
                          <strong>{metadata?.label ?? scope}</strong>
                          <code className="ml-2 text-xs text-slate-500">{scope}</code>
                          {metadata && (
                            <span className="block text-xs text-slate-600">
                              {metadata.description}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={saving || !page || !name.trim()}>
                    {saving ? "Creating…" : "Create API key"}
                  </Button>
                </div>
              </form>
              {secret && (
                <Alert className="border-amber-300 bg-amber-50 text-amber-950">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <strong>Copy this key now</strong>
                      <p className="mt-1">
                        The secret will not be shown again after you dismiss it.
                      </p>
                    </div>
                    <Button type="button" variant="secondary" onClick={() => setSecret(null)}>
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
                </Alert>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid flex-1 gap-1.5 text-sm">
                  State
                  <Select
                    value={stateFilter}
                    onChange={(event) => setStateFilter(event.target.value)}
                  >
                    <option value="all">All states</option>
                    <option value="active">Active</option>
                    <option value="revoked">Revoked</option>
                    <option value="expired">Expired</option>
                  </Select>
                </label>
                <CrudSortSelect
                  value={sortChoice}
                  onChange={(value) => {
                    setSortChoice(value);
                    if (account) {
                      const [sort, direction] = value.split(":");
                      setLoading(true);
                      setError(null);
                      void apiFetch<OperatorApiKeyPage>(
                        `/api/accounts/${account.id}/api-keys?sort=${sort}&direction=${direction}`,
                      )
                        .then((result) => {
                          setObservedAt(currentTimestamp());
                          setPage(result);
                        })
                        .catch((cause) => setError(errorMessage(cause)))
                        .finally(() => setLoading(false));
                    }
                  }}
                  options={[
                    { value: "created:desc", label: "Newest", sort: "created", direction: "desc" },
                    { value: "created:asc", label: "Oldest", sort: "created", direction: "asc" },
                    { value: "name:asc", label: "Name A–Z", sort: "name", direction: "asc" },
                    { value: "name:desc", label: "Name Z–A", sort: "name", direction: "desc" },
                    {
                      value: "expires:asc",
                      label: "Expiry soonest",
                      sort: "expires",
                      direction: "asc",
                    },
                    {
                      value: "expires:desc",
                      label: "Expiry latest",
                      sort: "expires",
                      direction: "desc",
                    },
                  ]}
                />
              </div>
              {error && <OperatorErrorState message={error} retry={() => void refreshKeys()} />}
              {loading ? (
                <OperatorLoadingState variant="table" columns={6} label="Loading API keys" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Scopes</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleKeys.map((key) => {
                        const expired = Boolean(
                          key.expires_at && new Date(key.expires_at).getTime() <= observedAt,
                        );
                        return (
                          <TableRow key={key.id}>
                            <TableCell>
                              <strong>{key.name}</strong>
                              <span className="block text-xs text-slate-500">{key.key_prefix}</span>
                            </TableCell>
                            <TableCell>@{account.username}</TableCell>
                            <TableCell>{key.scopes.join(", ") || "No scopes"}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  key.revoked_at ? "secondary" : expired ? "destructive" : "default"
                                }
                              >
                                {key.revoked_at ? "Revoked" : expired ? "Expired" : "Active"}
                              </Badge>
                            </TableCell>
                            <TableCell>{new Date(key.created_at).toLocaleString()}</TableCell>
                            <TableCell>
                              {key.expires_at ? new Date(key.expires_at).toLocaleString() : "Never"}
                            </TableCell>
                            <TableCell>
                              {!key.revoked_at && (
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="destructive"
                                  disabled={saving}
                                  onClick={() => void revoke(key)}
                                >
                                  Revoke
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {!visibleKeys.length && (
                    <p className="py-4 text-sm text-slate-600">No API keys match this state.</p>
                  )}
                </div>
              )}
            </div>
          </OperatorSection>
        </>
      )}
    </OperatorPage>
  );
}
