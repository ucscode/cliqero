"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ApiClientError,
  apiFetch,
  type ApiKeyCreated,
  type ApiKeyMetadata,
} from "@/lib/api-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { EmptyState } from "../empty-state";
import { Toast } from "../toast";
import { HoneypotField } from "../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { OneTimeSecret } from "./one-time-secret";

const userScopes = [
  ["Catalogue", ["catalogue:read"]],
  ["Wallet", ["wallet:read", "wallet:fund"]],
  ["Checkout & purchases", ["checkout:create", "purchases:read"]],
  ["Referrals", ["referrals:read", "referrals:manage"]],
  ["Earnings", ["earnings:read"]],
  ["Withdrawals", ["withdrawals:read", "withdrawals:create"]],
  ["API keys", ["api_keys:manage"]],
] as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiClientError ? error.message : fallback;
}

function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

export function ApiKeySettings() {
  const [items, setItems] = useState<ApiKeyMetadata[]>([]);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [selected, setSelected] = useState<string[]>([
    "api_keys:manage",
    "wallet:read",
    "purchases:read",
  ]);
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await apiFetch<{ items: ApiKeyMetadata[] }>("/api/api-keys")).items);
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t load your API keys."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const grouped = useMemo(() => userScopes, []);
  function toggle(scope: string) {
    setSelected((current) =>
      current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope],
    );
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<ApiKeyCreated>("/api/api-keys", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
        },
        body: JSON.stringify({
          name,
          scopes: selected,
          expires_at: expiry ? new Date(`${expiry}T23:59:59.000Z`).toISOString() : null,
        }),
      });
      setSecret(result.secret);
      setName("");
      setExpiry("");
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t create that API key."));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(item: ApiKeyMetadata) {
    if (!window.confirm(`Revoke ${item.name}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/api-keys/${item.id}/revoke`, { method: "POST" });
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t revoke that key."));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Card className="p-5">Loading API keys…</Card>;
  return (
    <div className="grid gap-4">
      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">API keys</p>
            <h3>Headless access for your account</h3>
          </div>
          <Button variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
        <p className="text-sm leading-relaxed text-slate-500">
          Keys are hashed and shown only once. Scopes can restrict what a key does, but can never
          grant account capabilities.
        </p>
        {error && <Toast>{error}</Toast>}
        <form className="grid max-w-2xl gap-3" onSubmit={create}>
          <Label htmlFor="api-key-name">Name</Label>
          <Input
            id="api-key-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={100}
            placeholder="Automation"
          />
          <Label htmlFor="api-key-expiry">
            Expiry <span>(optional)</span>
          </Label>
          <Input
            id="api-key-expiry"
            type="date"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
          />
          <fieldset className="grid gap-4 rounded-lg border border-slate-200 p-4">
            <legend>Allowed capabilities</legend>
            {grouped.map(([label, scopes]) => (
              <div className="grid gap-2" key={label}>
                <strong className="text-sm">{label}</strong>
                {scopes.map((scope) => (
                  <label className="flex items-center gap-2 text-sm text-slate-600" key={scope}>
                    <input
                      type="checkbox"
                      checked={selected.includes(scope)}
                      onChange={() => toggle(scope)}
                    />
                    {scope}
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create API key"}
          </Button>
          <HoneypotField />
        </form>
      </Card>
      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Your keys</p>
            <h3>Active and revoked credentials</h3>
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyState
            title="No API keys yet"
            description="Create a key when you need headless access to your own Cliqero account."
          />
        ) : (
          <div className="grid gap-2">
            {items.map((item) => (
              <div
                className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 py-3 last:border-0"
                key={item.id}
              >
                <div className="grid min-w-0 gap-1">
                  <strong>{item.name}</strong>
                  <span>
                    {item.key_prefix} · Created {dateLabel(item.created_at)} · Last used{" "}
                    {dateLabel(item.last_used_at)}
                  </span>
                  <small>
                    {item.scopes.join(", ") || "No optional scopes"}
                    {item.expires_at ? ` · Expires ${dateLabel(item.expires_at)}` : " · No expiry"}
                  </small>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.revoked_at ? "secondary" : "default"}>
                    {item.revoked_at ? "revoked" : "active"}
                  </Badge>
                  {!item.revoked_at && (
                    <Button variant="destructive" onClick={() => void revoke(item)} disabled={busy}>
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {secret && (
        <OneTimeSecret title="Your API key" value={secret} onDismiss={() => setSecret(null)} />
      )}
    </div>
  );
}
