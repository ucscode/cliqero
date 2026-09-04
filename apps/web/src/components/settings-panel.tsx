"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  ApiClientError,
  apiFetch,
  type ApiKeyCreated,
  type ApiKeyMetadata,
  type Integration,
  type IntegrationCredential,
  type ListingPage,
  type Profile,
} from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { HoneypotField } from "./honeypot-field";

const userScopes = [
  ["Catalogue", ["catalogue:read"]],
  ["Wallet", ["wallet:read", "wallet:fund"]],
  ["Checkout & purchases", ["checkout:create", "purchases:read"]],
  ["Referrals", ["referrals:read", "referrals:manage"]],
  ["Earnings", ["earnings:read"]],
  ["Withdrawals", ["withdrawals:read", "withdrawals:create"]],
  ["API keys", ["api_keys:manage"]],
] as const;

const tabItems = [
  ["profile", "Profile"],
  ["api-keys", "API keys"],
  ["account", "Account"],
] as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiClientError ? error.message : fallback;
}

function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

export function SettingsPanel() {
  const params = useSearchParams();
  const tab = params.get("tab") ?? "profile";
  const active = tabItems.some(([value]) => value === tab) ? tab : "profile";
  return (
    <section className="grid gap-4" aria-labelledby="settings-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Settings</p>
          <h2 id="settings-heading">Your Cliqero account</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Manage your profile, connected access tools, and API credentials.
          </p>
        </div>
      </div>
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200"
        aria-label="Settings sections"
      >
        {tabItems.map(([value, label]) => (
          <Link
            className={
              active === value
                ? "border-b-2 border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800"
                : "border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }
            href={`/dashboard?section=settings&tab=${value}`}
            key={value}
          >
            {label}
          </Link>
        ))}
      </nav>
      {active === "profile" && <ProfileSettings />}
      {active === "api-keys" && <ApiKeySettings />}
      {active === "account" && <AccountSettings />}
    </section>
  );
}

function ProfileSettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [handle, setHandle] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await apiFetch<Profile>("/api/me/profile");
      setProfile(value);
      setHandle(value.handle);
      setCountry(value.country ?? "");
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t load your profile."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const value = await apiFetch<Profile>("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, country: country || null }),
      });
      setProfile(value);
      setHandle(value.handle);
      setCountry(value.country ?? "");
      setMessage("Profile saved.");
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t save your profile."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Card className="p-5">Loading profile…</Card>;
  if (!profile)
    return (
      <Card className="p-5">
        <EmptyState title="Profile unavailable" description={error ?? "Try again."} />
      </Card>
    );
  return (
    <Card className="grid gap-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Profile</p>
          <h3>Your public account details</h3>
        </div>
        <Badge variant="default">Cliqero identity</Badge>
      </div>
      {error && <Toast>{error}</Toast>}
      {message && <Toast tone="success">{message}</Toast>}
      <form className="grid max-w-2xl gap-3" onSubmit={save}>
        <HoneypotField />
        <Label htmlFor="settings-handle">Username</Label>
        <Input
          id="settings-handle"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          minLength={3}
          maxLength={32}
          autoComplete="username"
          required
        />
        <p className="text-xs leading-relaxed text-slate-500">
          Lowercase letters, numbers, underscores, and hyphens. Usernames are unique.
        </p>
        <Label htmlFor="settings-country">
          Country <span>(optional)</span>
        </Label>
        <Input
          id="settings-country"
          value={country}
          onChange={(event) => setCountry(event.target.value.toUpperCase())}
          maxLength={2}
          placeholder="NG"
        />
        <Label htmlFor="settings-email">Email</Label>
        <Input
          id="settings-email"
          value={profile.email}
          readOnly
          aria-describedby="settings-email-help"
        />
        <p id="settings-email-help" className="text-xs leading-relaxed text-slate-500">
          Email changes are managed by the authentication provider.
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </Card>
  );
}

/** Reserved for the operator/catalogue-manager surface; not mounted in ordinary Settings. */
export function IntegrationSettings() {
  const [items, setItems] = useState<Integration[]>([]);
  const [listings, setListings] = useState<ListingPage["items"]>([]);
  const [name, setName] = useState("");
  const [listingId, setListingId] = useState("");
  const [credential, setCredential] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [integrations, ownedListings] = await Promise.all([
        apiFetch<{ items: Integration[] }>("/api/integrations"),
        apiFetch<ListingPage>("/api/me/listings?state=published&limit=100").catch(() => ({
          items: [],
          next_cursor: null,
        })),
      ]);
      setItems(integrations.items);
      setListings(ownedListings.items);
      setListingId((current) => current || ownedListings.items[0]?.id || "");
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t load your integrations."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<IntegrationCredential>("/api/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, listing_id: listingId }),
      });
      setCredential(result.credential);
      setName("");
      setMessage("Integration created. Save the credential now; it is shown once.");
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t create that integration."));
    } finally {
      setBusy(null);
    }
  }
  async function rename(item: Integration) {
    const next = window.prompt("Integration name", item.name);
    if (!next || next.trim() === item.name) return;
    setBusy(item.id);
    setError(null);
    try {
      await apiFetch(`/api/integrations/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t update that integration."));
    } finally {
      setBusy(null);
    }
  }
  async function revoke(item: Integration) {
    if (!window.confirm(`Revoke ${item.name}? Existing credentials will stop working.`)) return;
    setBusy(item.id);
    setError(null);
    try {
      await apiFetch(`/api/integrations/${item.id}`, { method: "DELETE" });
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t revoke that integration."));
    } finally {
      setBusy(null);
    }
  }
  async function rotate(item: Integration) {
    if (!window.confirm(`Rotate ${item.name}'s credential? The old credential will stop working.`))
      return;
    setBusy(item.id);
    setError(null);
    try {
      const result = await apiFetch<IntegrationCredential>(`/api/integrations/${item.id}/rotate`, {
        method: "POST",
      });
      setCredential(result.credential);
    } catch (cause) {
      setError(errorMessage(cause, "We couldn’t rotate that credential."));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Card className="p-5">Loading integrations…</Card>;
  return (
    <div className="grid gap-4">
      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Integrations</p>
            <h3>Connected access tools</h3>
          </div>
          <Button variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
        <p className="text-sm leading-relaxed text-slate-500">
          These credentials are for supported listing access integrations. Secrets are never shown
          again after this panel.
        </p>
        {error && <Toast>{error}</Toast>}
        {message && <Toast tone="success">{message}</Toast>}
        {items.length === 0 ? (
          <EmptyState
            title="No integrations connected"
            description="Integrations are available when you manage a supported listing."
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
                    {item.listing_ids.length} linked listing
                    {item.listing_ids.length === 1 ? "" : "s"} · Created{" "}
                    {dateLabel(item.created_at)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.state === "active" ? "default" : "secondary"}>
                    {item.state}
                  </Badge>
                  <Button
                    variant="ghost"
                    onClick={() => void rename(item)}
                    disabled={busy === item.id}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void rotate(item)}
                    disabled={busy === item.id}
                  >
                    Rotate
                  </Button>
                  {item.state === "active" && (
                    <Button
                      variant="destructive"
                      onClick={() => void revoke(item)}
                      disabled={busy === item.id}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {listings.length > 0 && (
        <Card className="grid gap-4 p-5">
          <p className="eyebrow">Add integration</p>
          <h3>Connect a listing access tool</h3>
          <form className="grid max-w-2xl gap-3" onSubmit={create}>
            <HoneypotField />
            <Label htmlFor="integration-name">Name</Label>
            <Input
              id="integration-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              placeholder="My access tool"
            />
            <Label htmlFor="integration-listing">Listing</Label>
            <Select
              id="integration-listing"
              value={listingId}
              onChange={(event) => setListingId(event.target.value)}
              required
            >
              {listings.map((listing) => (
                <option value={listing.id} key={listing.id}>
                  {listing.title}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={busy === "create"}>
              {busy === "create" ? "Connecting…" : "Connect integration"}
            </Button>
          </form>
        </Card>
      )}
      {credential && (
        <OneTimeSecret
          title="Integration credential"
          value={credential}
          onDismiss={() => setCredential(null)}
        />
      )}
    </div>
  );
}

function ApiKeySettings() {
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
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<ApiKeyCreated>("/api/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
          grant account roles.
        </p>
        {error && <Toast>{error}</Toast>}
        <form className="grid max-w-2xl gap-3" onSubmit={create}>
          <HoneypotField />
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

function OneTimeSecret({
  title,
  value,
  onDismiss,
}: {
  title: string;
  value: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div
      className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5"
      role="status"
    >
      <p className="eyebrow">Shown once</p>
      <h3>{title}</h3>
      <p className="text-sm leading-relaxed text-slate-600">
        Copy this value now. It will not be recoverable after you dismiss this message.
      </p>
      <code className="block break-all rounded-md border border-emerald-200 bg-white p-3 text-sm">
        {value}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</Button>
        <Button variant="secondary" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}

function AccountSettings() {
  const session = authClient.useSession();
  const router = useRouter();
  async function signOut() {
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  }
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Account</p>
          <h3>Authentication and account context</h3>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <dt>Signed in as</dt>
          <dd>{session.data?.user?.email ?? "—"}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <dt>Authentication</dt>
          <dd>Better Auth session</dd>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <dt>Provider linking</dt>
          <dd>Managed by Better Auth</dd>
        </div>
      </dl>
      <p className="text-sm leading-relaxed text-slate-500">
        Password resets, email changes, and provider unlinking remain in the authentication flow and
        are not changed by Cliqero profile settings.
      </p>
      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </Card>
  );
}
