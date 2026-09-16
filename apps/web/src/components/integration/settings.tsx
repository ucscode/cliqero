"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  ApiClientError,
  type Integration,
  type IntegrationCredential,
  type ListingPage,
} from "@/lib/api-client";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { EmptyState } from "../empty-state";
import { Toast } from "../toast";
import { Badge } from "../ui/badge";
import { HoneypotField } from "../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { OneTimeSecret } from "../settings/one-time-secret";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiClientError ? error.message : fallback;
}

function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

/** Reserved for operator catalogue workflows; not mounted in ordinary Settings. */
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

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    setBusy("create");
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<IntegrationCredential>("/api/integrations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
        },
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
            <label htmlFor="integration-name">Name</label>
            <Input
              id="integration-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              placeholder="My access tool"
            />
            <label htmlFor="integration-listing">Listing</label>
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
            <HoneypotField />
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
