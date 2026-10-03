"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, type OperatorAccountSummary } from "@/lib/api-client";
import { CrudEdit } from "@/components/crud/edit";
import { OperatorPage, OperatorPageHeader } from "@/components/operator/ui/page";
import { OperatorSection } from "@/components/operator/ui/section";
import { useToast } from "../../toast/provider";
import { Alert } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label, RequiredLabel } from "../../ui/label";
import { toggleApiKeyScope, type OperatorApiKeyRow } from "./model";
import { ApiKeyScopeList } from "./scope-list";
import { OperatorAccountSelector } from "../ui/account-selector";

type ScopeResponse = { manageable_scopes: string[] };
type ItemResponse = { item: OperatorApiKeyRow };

const COLLECTION = "/operator/api-keys";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "API key could not be loaded.";

export function OperatorApiKeyEditor({
  mode,
  apiKeyId,
  canReassignOwner = false,
}: {
  mode: "create" | "edit";
  apiKeyId?: string;
  canReassignOwner?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [account, setAccount] = useState<OperatorAccountSummary | null>(null);
  const [key, setKey] = useState<OperatorApiKeyRow | null>(null);
  const [name, setName] = useState("");
  const [manageableScopes, setManageableScopes] = useState<string[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiry, setExpiry] = useState("");
  const [status, setStatus] = useState<"active" | "revoked">("active");
  const [originalAccountId, setOriginalAccountId] = useState<string | null>(null);
  const [credentialAction, setCredentialAction] = useState<"created" | "reassigned">("created");
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
        setOriginalAccountId(item.account_id);
        setAccount({
          id: item.account_id,
          username: item.account_username,
          email: item.account_email,
          displayName: null,
          country: null,
          createdAt: "",
          directReferralCount: 0,
        });
        setName(item.name);
        setExpiry(item.expires_at ? new Date(item.expires_at).toISOString().slice(0, 10) : "");
        setStatus(item.state === "revoked" ? "revoked" : "active");
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

  async function chooseAccount(value: OperatorAccountSummary | null) {
    const requestId = ++scopeRequest.current;
    setAccount(value);
    setManageableScopes([]);
    setError(null);
    if (!value) return;
    setLoadingScopes(true);
    try {
      const result = await apiFetch<ScopeResponse>(
        `/internal/api-keys?account_id=${encodeURIComponent(value.id)}`,
      );
      if (requestId === scopeRequest.current) {
        setManageableScopes(result.manageable_scopes);
        setScopes((current) => current.filter((scope) => result.manageable_scopes.includes(scope)));
      }
    } catch (cause) {
      if (requestId === scopeRequest.current) setError(message(cause));
    } finally {
      if (requestId === scopeRequest.current) setLoadingScopes(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || saving || loadingScopes) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        scopes: scopes.filter((scope) => manageableScopes.includes(scope)),
        expires_at: expiry ? new Date(`${expiry}T23:59:59.000Z`).toISOString() : null,
        state: status,
      };
      if (mode === "edit" && apiKeyId) {
        if (account.id !== originalAccountId) {
          const replacement = await apiFetch<{ secret: string }>(
            `/internal/api-keys/${apiKeyId}/reassign`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                account_id: account.id,
                name: payload.name,
                scopes: payload.scopes,
                expires_at: payload.expires_at,
                state: payload.state,
              }),
            },
          );
          setCredentialAction("reassigned");
          setSecret(replacement.secret);
          toast.success("API key reassigned and replaced.");
          return;
        }
        await apiFetch(`/internal/api-keys/${apiKeyId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("API key updated.");
        router.push(COLLECTION);
        return;
      }
      const created = await apiFetch<{ secret: string; state: "active" | "revoked" }>(
        "/internal/api-keys",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            account_id: account.id,
            name: payload.name,
            scopes: payload.scopes,
            expires_at: payload.expires_at,
            state: payload.state,
          }),
        },
      );
      setCredentialAction("created");
      setSecret(created.secret);
      setStatus(created.state);
      toast.success("API key created.");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }

  async function reveal() {
    if (!apiKeyId) return;
    setError(null);
    try {
      const result = await apiFetch<{ secret: string | null; legacy: boolean }>(
        `/internal/api-keys/${apiKeyId}/secret`,
      );
      if (result.secret) setSecret(result.secret);
      else
        setError("This legacy key cannot be recovered. Rotate it once to create a revealable key.");
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function rotate() {
    if (!apiKeyId) return;
    setError(null);
    try {
      const result = await apiFetch<{ secret: string }>(`/internal/api-keys/${apiKeyId}/rotate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      setCredentialAction("reassigned");
      setSecret(result.secret);
    } catch (cause) {
      setError(message(cause));
    }
  }

  if (secret)
    return (
      <OperatorPage className="max-w-4xl">
        <OperatorPageHeader
          eyebrow="Access management"
          title={credentialAction === "reassigned" ? "API key reassigned" : "API key created"}
          description={`Copy the replacement secret now. It will not be shown again. ${status === "revoked" ? "This credential is revoked and will not authenticate." : "This credential is active."}`}
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
        {mode === "create" || canReassignOwner ? (
          <RequiredLabel htmlFor="api-key-account">Account</RequiredLabel>
        ) : (
          <Label htmlFor="api-key-account">Account</Label>
        )}
        {mode === "edit" && !canReassignOwner ? (
          <p
            id="api-key-account"
            className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            @{account?.username} · {account?.email ?? account?.id}
          </p>
        ) : (
          <OperatorAccountSelector
            inputId="api-key-account"
            value={account}
            onChange={(value) => void chooseAccount(value)}
            required={mode === "create"}
            placeholder="Search accounts by username or email"
          />
        )}
      </div>
      {mode === "edit" && canReassignOwner && (
        <p className="text-xs leading-5 text-slate-600">
          Changing this owner will atomically invalidate the old credential, assign a fresh secret
          to the destination account, and display that secret once.
        </p>
      )}
      <div className="grid gap-2">
        <RequiredLabel htmlFor="api-key-name">Name</RequiredLabel>
        <Input
          id="api-key-name"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="api-key-state">Status</Label>
        <select
          id="api-key-state"
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as "active" | "revoked")}
        >
          <option
            value="active"
            disabled={mode === "edit" && key?.state === "revoked" && !canReassignOwner}
          >
            Active
          </option>
          <option value="revoked">Revoked</option>
        </select>
        {mode === "edit" && key?.state === "revoked" && !canReassignOwner && (
          <p className="text-xs text-slate-500">
            Only a system-root administrator can reactivate a revoked credential.
          </p>
        )}
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
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <Button type="button" variant="secondary" size="xs" onClick={() => void reveal()}>
            Reveal key
          </Button>
          <Button type="button" variant="secondary" size="xs" onClick={() => void rotate()}>
            Rotate key
          </Button>
          <span className="self-center">Editing does not change the credential.</span>
        </div>
      )}
    </CrudEdit>
  );
}
