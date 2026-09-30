"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import AsyncSelect from "react-select/async";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, type OperatorAccountPage, type OperatorAccountSummary } from "@/lib/api-client";
import { CrudEdit } from "@/components/crud/edit";
import { OperatorPage, OperatorPageHeader } from "@/components/operator/ui/page";
import { OperatorSection } from "@/components/operator/ui/section";
import { OperatorEmptyState } from "@/components/operator/ui/empty-state";
import { useToast } from "../../toast/provider";
import { Alert } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { toggleApiKeyScope, type OperatorApiKeyRow } from "./model";
import { ApiKeyScopeList } from "./scope-list";

type AccountOption = { value: string; label: string; account: OperatorAccountSummary };
type ScopeResponse = { manageable_scopes: string[] };
type ItemResponse = { item: OperatorApiKeyRow };

const COLLECTION = "/operator/api-keys";
const selectStyles = {
  control: (base: object) => ({ ...base, minHeight: 42 }),
  menuPortal: (base: object) => ({ ...base, zIndex: 80 }),
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "API key could not be loaded.";

async function searchAccounts(query: string): Promise<AccountOption[]> {
  if (!query.trim()) return [];
  const result = await apiFetch<OperatorAccountPage>(
    `/api/accounts?search=${encodeURIComponent(query.trim())}&limit=10`,
  );
  return result.items.map((account) => ({
    value: account.id,
    label: `@${account.username} · ${account.email ?? account.id}`,
    account,
  }));
}

export function OperatorApiKeyEditor({
  mode,
  apiKeyId,
}: {
  mode: "create" | "edit";
  apiKeyId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [account, setAccount] = useState<AccountOption | null>(null);
  const [key, setKey] = useState<OperatorApiKeyRow | null>(null);
  const [name, setName] = useState("");
  const [manageableScopes, setManageableScopes] = useState<string[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiry, setExpiry] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [loadingScopes, setLoadingScopes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const scopeRequest = useRef(0);

  useEffect(() => {
    if (mode !== "edit" || !apiKeyId) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const { item } = await apiFetch<ItemResponse>(`/internal/api-keys/${apiKeyId}`);
        if (!active) return;
        setKey(item);
        setAccount({
          value: item.account_id,
          label: `@${item.account_username} · ${item.account_email ?? item.account_id}`,
          account: {
            id: item.account_id,
            username: item.account_username,
            email: item.account_email,
          } as OperatorAccountSummary,
        });
        setName(item.name);
        setExpiry(item.expires_at ? new Date(item.expires_at).toISOString().slice(0, 10) : "");
        const scopeResult = await apiFetch<ScopeResponse>(
          `/internal/api-keys?account_id=${encodeURIComponent(item.account_id)}`,
        );
        if (!active) return;
        setManageableScopes(scopeResult.manageable_scopes);
        setScopes(item.scopes.filter((scope) => scopeResult.manageable_scopes.includes(scope)));
      } catch (cause) {
        if (active) setError(message(cause));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiKeyId, mode]);

  async function chooseAccount(value: AccountOption | null) {
    const requestId = ++scopeRequest.current;
    setAccount(value);
    setScopes([]);
    setManageableScopes([]);
    setError(null);
    if (!value) return;
    setLoadingScopes(true);
    try {
      const result = await apiFetch<ScopeResponse>(
        `/internal/api-keys?account_id=${encodeURIComponent(value.value)}`,
      );
      if (requestId === scopeRequest.current) setManageableScopes(result.manageable_scopes);
    } catch (cause) {
      if (requestId === scopeRequest.current) setError(message(cause));
    } finally {
      if (requestId === scopeRequest.current) setLoadingScopes(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || saving || loadingScopes || key?.state === "deleted") return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        scopes: scopes.filter((scope) => manageableScopes.includes(scope)),
        expires_at: expiry ? new Date(`${expiry}T23:59:59.000Z`).toISOString() : null,
      };
      if (mode === "edit" && apiKeyId) {
        await apiFetch(`/internal/api-keys/${apiKeyId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("API key updated.");
        router.push(COLLECTION);
        return;
      }
      const created = await apiFetch<{ secret: string }>("/internal/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, account_id: account.value }),
      });
      setSecret(created.secret);
      toast.success("API key created.");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }

  if (secret)
    return (
      <OperatorPage className="max-w-4xl">
        <OperatorPageHeader
          eyebrow="Access management"
          title="API key created"
          description="Copy the secret now. It will not be shown again."
          actions={
            <Button type="button" onClick={() => router.push(COLLECTION)}>
              Done
            </Button>
          }
        />
        <OperatorSection title="One-time secret" surface>
          <Alert className="grid gap-3">
            <strong>Keep this credential secure. Cliqero cannot retrieve it later.</strong>
            <code data-testid="api-key-secret" className="block break-all rounded bg-slate-100 p-3">
              {secret}
            </code>
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void navigator.clipboard.writeText(secret)}
              >
                Copy key
              </Button>
            </div>
          </Alert>
        </OperatorSection>
      </OperatorPage>
    );

  if (key?.state === "deleted")
    return (
      <OperatorPage className="max-w-4xl">
        <OperatorPageHeader
          eyebrow="Access management"
          title="Edit API key"
          actions={
            <Button asChild type="button" variant="secondary" size="xs">
              <Link href={COLLECTION}>Back to API keys</Link>
            </Button>
          }
        />
        <OperatorEmptyState
          title="Deleted API keys cannot be edited"
          description="This credential has been revoked and cannot be modified."
        />
      </OperatorPage>
    );

  return (
    <CrudEdit
      mode={mode}
      eyebrow="Access management"
      title={mode === "create" ? "New API key" : "Edit API key"}
      description="Grant only the API permissions this account is authorized to delegate."
      backHref={COLLECTION}
      backLabel="Back to API keys"
      saving={saving}
      loading={loading}
      loadingLabel="Loading API key"
      onSubmit={(event) => void submit(event)}
      error={error}
      submitLabel={mode === "create" ? "Create API key" : "Save changes"}
      savingLabel={mode === "create" ? "Creating…" : "Saving…"}
      sectionTitle="API key details"
    >
      <div className="grid gap-2">
        <Label htmlFor="api-key-account">Account</Label>
        {mode === "edit" ? (
          <p
            id="api-key-account"
            className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            @{account?.account.username} · {account?.account.email ?? account?.value}
          </p>
        ) : (
          <AsyncSelect<AccountOption, false>
            inputId="api-key-account"
            cacheOptions
            defaultOptions={false}
            loadOptions={searchAccounts}
            value={account}
            onChange={(value) => void chooseAccount(value)}
            placeholder="Search accounts by username or email"
            isClearable
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
      <ApiKeyScopeList
        availableScopes={manageableScopes}
        selectedScopes={scopes}
        loading={loadingScopes}
        accountSelected={Boolean(account)}
        onChange={(scope, checked) =>
          setScopes((current) => toggleApiKeyScope(current, scope, checked))
        }
      />
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
      {mode === "edit" && (
        <p className="text-xs text-slate-500">Editing does not reveal or rotate the credential.</p>
      )}
    </CrudEdit>
  );
}
