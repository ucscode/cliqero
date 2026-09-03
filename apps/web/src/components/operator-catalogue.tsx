"use client";

/* Public media URLs are resolved by the configured storage provider at runtime. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  apiFetch,
  formatMinorUsd,
  minorToUsdInput,
  parseUsdMinor,
  type ListingMedia,
  type Integration,
  type IntegrationCredential,
  type OperatorListing,
  type OperatorListingPage,
} from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { Textarea } from "./ui/textarea";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The catalogue service is temporarily unavailable.";
}

export function OperatorCatalogueList() {
  const [page, setPage] = useState<OperatorListingPage | null>(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  async function load(nextCursor: string | null = null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (search.trim()) params.set("search", search.trim());
      if (state) params.set("state", state);
      if (nextCursor) params.set("cursor", nextCursor);
      setPage(await apiFetch<OperatorListingPage>(`/api/operator/listings?${params}`));
      setCursor(nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // The request callback updates UI state when the external API resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // Initial data only; filtering is submitted deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeState(listing: OperatorListing, action: "publish" | "restore" | "archive") {
    if (action === "archive" && !window.confirm(`Archive “${listing.title}”?`)) return;
    try {
      const endpoint =
        action === "archive"
          ? `/api/operator/listings/${listing.id}`
          : `/api/operator/listings/${listing.id}/${action}`;
      await apiFetch(endpoint, {
        method: action === "archive" ? "DELETE" : "POST",
      });
      await load(cursor);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function importFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (new FormData(form).get("file") as File | null) ?? null;
    const format = (new FormData(form).get("format") as string | null) ?? "json";
    const mode = (new FormData(form).get("mode") as string | null) ?? "create";
    if (!file || file.size === 0) {
      setImportMessage("Choose a JSON, CSV, or YAML file first.");
      return;
    }
    setImporting(true);
    setImportMessage(null);
    try {
      const body = await file.text();
      const result = await apiFetch<{
        created: number;
        updated: number;
        skipped: number;
        failed: number;
      }>(
        `/api/operator/listings/import?format=${encodeURIComponent(format)}&mode=${encodeURIComponent(mode)}`,
        { method: "POST", headers: { "content-type": "text/plain" }, body },
      );
      setImportMessage(
        `Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed.`,
      );
      form.reset();
      await load();
    } catch (cause) {
      setImportMessage(errorMessage(cause));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="operator-catalogue-page">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Platform catalogue</p>
          <h2 id="operator-catalogue-heading">Listings</h2>
          <p className="panel-intro">
            Create and curate the listings Cliqero makes available to customers.
          </p>
        </div>
        <Button asChild>
          <Link href="/operator/catalogue/new">New listing</Link>
        </Button>
      </div>

      <Card className="catalogue-toolbar">
        <form
          className="catalogue-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label>
            Search
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title or description"
            />
          </label>
          <label>
            State
            <Select value={state} onChange={(event) => setState(event.target.value)}>
              <option value="">All states</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </label>
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
        </form>
        <div className="catalogue-transfer">
          <span className="eyebrow">Transfer</span>
          <div className="catalogue-transfer-actions">
            {(["json", "csv", "yaml"] as const).map((format) => (
              <a
                className="inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-100"
                href={`/api/operator/listings/export?format=${format}`}
                key={format}
              >
                Export {format.toUpperCase()}
              </a>
            ))}
          </div>
          <form className="catalogue-import" onSubmit={(event) => void importFile(event)}>
            <Input
              type="file"
              name="file"
              accept=".json,.csv,.yaml,.yml,text/csv,application/json"
            />
            <Select name="format" defaultValue="json" aria-label="Import format">
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="yaml">YAML</option>
            </Select>
            <Select name="mode" defaultValue="create" aria-label="Import mode">
              <option value="create">Create only</option>
              <option value="upsert">Upsert by external key</option>
            </Select>
            <Button type="submit" variant="secondary" disabled={importing}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </form>
          {importMessage && (
            <Toast tone={importMessage.startsWith("Import complete") ? "success" : "error"}>
              {importMessage}
            </Toast>
          )}
        </div>
      </Card>

      {error && <Toast>{error}</Toast>}
      {loading ? (
        <div className="catalogue-list-grid" aria-label="Loading catalogue">
          {Array.from({ length: 4 }, (_, index) => (
            <Card className="catalogue-card" key={index}>
              <Skeleton className="catalogue-skeleton" />
            </Card>
          ))}
        </div>
      ) : page?.items.length ? (
        <>
          <div className="catalogue-list-grid">
            {page.items.map((listing) => (
              <CatalogueCard key={listing.id} listing={listing} onAction={changeState} />
            ))}
          </div>
          <div className="catalogue-pagination">
            <span className="panel-note">Showing a bounded page, ordered newest first.</span>
            {page.next_cursor && (
              <Button variant="secondary" onClick={() => void load(page.next_cursor)}>
                Next page
              </Button>
            )}
          </div>
        </>
      ) : (
        <Card>
          <EmptyState
            title="No listings found"
            description="Try another filter or create the first catalogue listing."
          />
        </Card>
      )}
    </div>
  );
}

function CatalogueCard({
  listing,
  onAction,
}: {
  listing: OperatorListing;
  onAction: (listing: OperatorListing, action: "publish" | "restore" | "archive") => Promise<void>;
}) {
  return (
    <Card className="catalogue-card">
      <div className="catalogue-card-media">
        {listing.media[0] ? (
          <img src={listing.media[0].url} alt={listing.media[0].alt_text || ""} />
        ) : (
          <span aria-hidden="true">C</span>
        )}
      </div>
      <div className="catalogue-card-content">
        <div className="catalogue-card-title-row">
          <h3>{listing.title}</h3>
          <Badge variant={listing.state === "published" ? "default" : "secondary"}>
            {listing.state ?? "draft"}
          </Badge>
        </div>
        <p className="catalogue-card-description">
          {listing.description || "No description provided."}
        </p>
        <strong className="catalogue-card-price">
          {formatMinorUsd(listing.price.minor_amount)}
        </strong>
        {listing.external_key && (
          <p className="catalogue-card-key">External key: {listing.external_key}</p>
        )}
        <div className="catalogue-card-actions">
          <Button asChild variant="secondary">
            <Link href={`/operator/catalogue/${listing.id}`}>Edit</Link>
          </Button>
          {listing.state === "draft" && (
            <Button variant="default" onClick={() => void onAction(listing, "publish")}>
              Publish
            </Button>
          )}
          {listing.state === "archived" && (
            <Button variant="secondary" onClick={() => void onAction(listing, "restore")}>
              Restore
            </Button>
          )}
          {listing.state === "published" && (
            <Button variant="destructive" onClick={() => void onAction(listing, "archive")}>
              Archive
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function OperatorCatalogueEditor({ listingId }: { listingId?: string }) {
  const router = useRouter();
  const editing = Boolean(listingId);
  const [listing, setListing] = useState<OperatorListing | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    destination: "",
    externalKey: "",
  });
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    void apiFetch<OperatorListing>(`/api/operator/listings/${listingId}`)
      .then((value) => {
        setListing(value);
        setForm({
          title: value.title,
          description: value.description,
          price: minorToUsdInput(value.price.minor_amount),
          destination: value.destination,
          externalKey: value.external_key ?? "",
        });
      })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, [listingId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const priceMinor = parseUsdMinor(form.price);
      if (editing) {
        const next = await apiFetch<OperatorListing>(`/api/operator/listings/${listingId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            description: form.description,
            price_minor: priceMinor,
            currency: "USD",
            destination: form.destination.trim(),
          }),
        });
        setListing(next);
        setSaved(true);
      } else {
        const next = await apiFetch<OperatorListing>("/api/operator/listings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            description: form.description,
            price_minor: priceMinor,
            currency: "USD",
            destination: form.destination.trim(),
            external_key: form.externalKey.trim() || undefined,
          }),
        });
        router.replace(`/operator/catalogue/${next.id}`);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <Card>
        <Skeleton className="catalogue-editor-skeleton" />
      </Card>
    );
  return (
    <div className="operator-catalogue-page">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">{editing ? "Catalogue listing" : "New catalogue listing"}</p>
          <h2>{editing ? "Edit listing" : "Create listing"}</h2>
          <p className="panel-intro">
            Listings are managed by Cliqero. No seller or payee is selected here.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/operator/catalogue">Back to catalogue</Link>
        </Button>
      </div>
      {error && <Toast>{error}</Toast>}
      {saved && <Toast tone="success">Listing saved.</Toast>}
      <Card>
        <form className="catalogue-editor-form" onSubmit={save}>
          <label>
            Title
            <Input
              required
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <label>
            Description
            <Textarea
              rows={6}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <div className="catalogue-form-grid">
            <label>
              Price (USD)
              <Input
                required
                inputMode="decimal"
                placeholder="10.00"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
              <span className="field-help">Exact USD minor units are sent to the API.</span>
            </label>
            <label>
              Destination URL
              <Input
                required
                type="url"
                value={form.destination}
                onChange={(event) => setForm({ ...form, destination: event.target.value })}
              />
            </label>
          </div>
          {!editing && (
            <label>
              External key (optional)
              <Input
                value={form.externalKey}
                onChange={(event) => setForm({ ...form, externalKey: event.target.value })}
              />
              <span className="field-help">
                Useful for deterministic imports and reconciliation.
              </span>
            </label>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create listing"}
          </Button>
        </form>
      </Card>
      {editing && listing && (
        <>
          <CatalogueMedia listing={listing} onChange={setListing} />
          <CatalogueIntegrations listingId={listing.id} />
        </>
      )}
    </div>
  );
}

function CatalogueIntegrations({ listingId }: { listingId: string }) {
  const [items, setItems] = useState<Integration[]>([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const result = await apiFetch<{ items: Integration[] }>(
        `/api/operator/listings/${listingId}/integrations`,
      );
      setItems(result.items);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  useEffect(() => {
    // The request callback updates UI state when the external API resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // The listing id is stable for this editor instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<IntegrationCredential>(
        `/api/operator/listings/${listingId}/integrations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      setSecret(result.credential);
      setName("");
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function rotate(item: Integration) {
    if (!window.confirm(`Rotate the credential for “${item.name}”?`)) return;
    try {
      const result = await apiFetch<IntegrationCredential>(
        `/api/operator/listings/${listingId}/integrations/${item.id}/rotate`,
        { method: "POST" },
      );
      setSecret(result.credential);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function revoke(item: Integration) {
    if (!window.confirm(`Revoke “${item.name}”?`)) return;
    try {
      await apiFetch(`/api/operator/listings/${listingId}/integrations/${item.id}`, {
        method: "DELETE",
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <Card className="catalogue-media-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Access integration</p>
          <h3>Listing credentials</h3>
          <p className="panel-note">
            Credentials let an external destination verify an entitled buyer. Secrets are shown
            once.
          </p>
        </div>
      </div>
      {error && <Toast>{error}</Toast>}
      {secret && (
        <Toast tone="success">
          <strong>Copy this credential now:</strong>
          <code className="catalogue-secret">{secret}</code>
          <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(secret)}>
            Copy credential
          </Button>
          <Button variant="ghost" onClick={() => setSecret(null)}>
            Dismiss
          </Button>
        </Toast>
      )}
      <form className="media-upload-form" onSubmit={(event) => void create(event)}>
        <label className="sr-only" htmlFor={`integration-name-${listingId}`}>
          Credential name
        </label>
        <Input
          id={`integration-name-${listingId}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Production destination"
          required
        />
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? "Creating…" : "Create credential"}
        </Button>
      </form>
      {items.length ? (
        <div className="integration-list">
          {items.map((item) => (
            <div className="integration-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span className="field-help">
                  {item.state} · {item.listing_ids.length} listing
                </span>
              </div>
              <div className="catalogue-card-actions">
                <Button variant="ghost" onClick={() => void rotate(item)}>
                  Rotate
                </Button>
                {item.state === "active" && (
                  <Button variant="destructive" onClick={() => void revoke(item)}>
                    Revoke
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No access credentials"
          description="Create one when this listing needs an external access verifier."
        />
      )}
    </Card>
  );
}

function CatalogueMedia({
  listing,
  onChange,
}: {
  listing: OperatorListing;
  onChange: (value: OperatorListing) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || file.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const media = await apiFetch<ListingMedia>(`/api/operator/listings/${listing.id}/media`, {
        method: "POST",
        body,
      });
      onChange({
        ...listing,
        media: [...listing.media, media].sort((a, b) => a.position - b.position),
      });
      form.reset();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(media: ListingMedia) {
    if (!window.confirm("Remove this media from the listing?")) return;
    try {
      await apiFetch(`/api/operator/listings/${listing.id}/media/${media.id}`, {
        method: "DELETE",
      });
      onChange({ ...listing, media: listing.media.filter((item) => item.id !== media.id) });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function move(media: ListingMedia, direction: -1 | 1) {
    const index = listing.media.findIndex((item) => item.id === media.id);
    const target = index + direction;
    if (target < 0 || target >= listing.media.length) return;
    try {
      const next = [...listing.media];
      [next[index], next[target]] = [next[target], next[index]];
      for (const [position, item] of next.entries()) {
        await apiFetch(`/api/operator/listings/${listing.id}/media/${item.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ position }),
        });
      }
      onChange({ ...listing, media: next.map((item, position) => ({ ...item, position })) });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <Card className="catalogue-media-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Listing media</p>
          <h3>Images</h3>
        </div>
      </div>
      {error && <Toast>{error}</Toast>}
      <form className="media-upload-form" onSubmit={(event) => void upload(event)}>
        <Input name="file" type="file" accept="image/*" required />
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? "Uploading…" : "Add image"}
        </Button>
      </form>
      {listing.media.length ? (
        <div className="catalogue-media-grid">
          {listing.media.map((media, index) => (
            <div className="catalogue-media-item" key={media.id}>
              <img src={media.url} alt={media.alt_text || "Listing image"} />
              <div className="catalogue-media-actions">
                <Button variant="ghost" disabled={index === 0} onClick={() => void move(media, -1)}>
                  Move up
                </Button>
                <Button
                  variant="ghost"
                  disabled={index === listing.media.length - 1}
                  onClick={() => void move(media, 1)}
                >
                  Move down
                </Button>
                <Button variant="destructive" onClick={() => void remove(media)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No media yet"
          description="Add a browser-renderable image to improve the public listing."
        />
      )}
    </Card>
  );
}
