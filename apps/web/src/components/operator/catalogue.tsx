"use client";

/* Public media URLs are resolved by the configured storage provider at runtime. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { HoneypotField } from "../honeypot-field";
import { Textarea } from "../ui/textarea";
import { Toast } from "../toast";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { CursorHistory } from "./ui/cursor-history";
import { OperatorActionsMenu } from "./ui/actions-menu";
import {
  OperatorActionCell,
  OperatorPrimaryCell,
  OperatorStatusCell,
  OperatorValueCell,
} from "./ui/data-cells";
import { OperatorEmptyState } from "./ui/empty-state";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorLoadingState } from "./ui/loading-state";
import { OperatorPage, OperatorPageHeader } from "./ui/page";
import { OperatorPagination } from "./ui/pagination";
import { OperatorSection } from "./ui/section";
import { OperatorTableSurface } from "./ui/table-surface";
import { OperatorFilterField, OperatorToolbar } from "./ui/toolbar";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The catalogue service is temporarily unavailable.";
}

export function operatorListingDescriptionForm(
  listing: Pick<OperatorListing, "short_description" | "long_description">,
) {
  return {
    shortDescription: listing.short_description,
    longDescription: listing.long_description,
  };
}

export function operatorListingDescriptionPayload(form: {
  shortDescription: string;
  longDescription: string;
}) {
  return {
    short_description: form.shortDescription,
    long_description: form.longDescription,
  };
}

export function OperatorCatalogueList() {
  const [page, setPage] = useState<OperatorListingPage | null>(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState(() => CursorHistory.firstPage());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const retryCursor = useRef<string | null>(null);

  async function load(nextCursor: string | null = null) {
    retryCursor.current = nextCursor;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (search.trim()) params.set("search", search.trim());
      if (state) params.set("state", state);
      if (nextCursor) params.set("cursor", nextCursor);
      setPage(await apiFetch<OperatorListingPage>(`/api/operator/listings?${params}`));
      setCursor(nextCursor);
      if (!nextCursor) setHistory(CursorHistory.firstPage());
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function nextPage() {
    const next = page?.next_cursor;
    if (!next || loading) return;
    if (await load(next)) setHistory((current) => current.afterNext(next));
  }
  async function previousPage() {
    if (!history.hasPrevious || loading) return;
    if (await load(history.previous)) setHistory((current) => current.afterPrevious());
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
    const formData = new FormData(form);
    const honeypot = String(formData.get(HONEYPOT_FIELD_NAME) ?? "");
    const file = (formData.get("file") as File | null) ?? null;
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
        {
          method: "POST",
          headers: {
            "content-type": "text/plain",
            ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
          },
          body,
        },
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
    <OperatorPage>
      <OperatorPageHeader
        eyebrow="Platform catalogue"
        title="Listings"
        description="Create and curate the listings Cliqero makes available to customers."
        actions={
          <Button asChild>
            <Link href="/operator/catalogue/new">New listing</Link>
          </Button>
        }
      />
      <OperatorToolbar
        onSubmit={(event) => {
          event.preventDefault();
          void load(null);
        }}
        actions={
          <Button type="submit" variant="secondary" disabled={loading}>
            Apply filters
          </Button>
        }
      >
        <OperatorFilterField label="Search" htmlFor="catalogue-search">
          <Input
            id="catalogue-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Title or description"
          />
        </OperatorFilterField>
        <OperatorFilterField label="State" htmlFor="catalogue-state">
          <Select
            id="catalogue-state"
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="">All states</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </OperatorFilterField>
      </OperatorToolbar>
      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-medium text-slate-800">Import and export</summary>
        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap gap-2">
            {(["json", "csv", "yaml"] as const).map((format) => (
              <a
                className="rounded-md px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                href={`/api/operator/listings/export?format=${format}`}
                key={format}
              >
                Export {format.toUpperCase()}
              </a>
            ))}
          </div>
          <form
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            onSubmit={(event) => void importFile(event)}
          >
            <Input
              type="file"
              name="file"
              accept=".json,.csv,.yaml,.yml,text/csv,application/json"
              aria-label="Import file"
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
            <HoneypotField />
          </form>
          {importMessage && (
            <Toast tone={importMessage.startsWith("Import complete") ? "success" : "error"}>
              {importMessage}
            </Toast>
          )}
        </div>
      </details>
      {error && <OperatorErrorState message={error} retry={() => void load(retryCursor.current)} />}
      <OperatorSection
        title="Catalogue"
        description="Archive preserves the listing record; it does not hard-delete history."
      >
        {loading ? (
          <OperatorLoadingState variant="table" columns={6} />
        ) : page?.items.length ? (
          <OperatorTableSurface
            footer={
              <OperatorPagination
                hasPrevious={history.hasPrevious && !loading}
                hasNext={Boolean(page.next_cursor) && !loading}
                onPrevious={() => void previousPage()}
                onNext={() => void nextPage()}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead>Destination / key</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((listing) => (
                  <TableRow key={listing.id}>
                    <TableCell>
                      <OperatorPrimaryCell
                        title={
                          <Link href={`/operator/catalogue/${listing.id}`}>{listing.title}</Link>
                        }
                        subtitle={listing.short_description || "No short description"}
                      />
                    </TableCell>
                    <TableCell>
                      <OperatorPrimaryCell
                        title={listing.destination}
                        subtitle={listing.external_key ?? undefined}
                      />
                    </TableCell>
                    <TableCell>
                      <OperatorStatusCell status={listing.state ?? "draft"} />
                    </TableCell>
                    <TableCell>
                      <OperatorValueCell>
                        {formatMinorUsd(listing.price.minor_amount)}
                      </OperatorValueCell>
                    </TableCell>
                    <TableCell>
                      <OperatorActionCell>
                        <OperatorActionsMenu
                          actions={[
                            {
                              type: "link",
                              label: "View",
                              href: `/operator/catalogue/${listing.id}`,
                            },
                            {
                              type: "link",
                              label: "Edit",
                              href: `/operator/catalogue/${listing.id}`,
                            },
                            ...(listing.state === "draft"
                              ? [
                                  {
                                    type: "action" as const,
                                    label: "Publish",
                                    onSelect: () => void changeState(listing, "publish"),
                                  },
                                ]
                              : []),
                            ...(listing.state === "published"
                              ? [
                                  {
                                    type: "action" as const,
                                    label: "Archive",
                                    destructive: true,
                                    onSelect: () => void changeState(listing, "archive"),
                                  },
                                ]
                              : []),
                            ...(listing.state === "archived"
                              ? [
                                  {
                                    type: "action" as const,
                                    label: "Restore",
                                    onSelect: () => void changeState(listing, "restore"),
                                  },
                                ]
                              : []),
                          ]}
                          label={`Actions for ${listing.title}`}
                        />
                      </OperatorActionCell>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </OperatorTableSurface>
        ) : (
          <OperatorEmptyState
            title="No listings found"
            description="Try another filter or create the first catalogue listing."
            action={
              <Button asChild>
                <Link href="/operator/catalogue/new">New listing</Link>
              </Button>
            }
          />
        )}
      </OperatorSection>
    </OperatorPage>
  );
}

export function OperatorCatalogueEditor({ listingId }: { listingId?: string }) {
  const router = useRouter();
  const editing = Boolean(listingId);
  const [listing, setListing] = useState<OperatorListing | null>(null);
  const [form, setForm] = useState({
    title: "",
    shortDescription: "",
    longDescription: "",
    price: "",
    destination: "",
    externalKey: "",
    featuredPosition: "",
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
          ...operatorListingDescriptionForm(value),
          price: minorToUsdInput(value.price.minor_amount),
          destination: value.destination,
          externalKey: value.external_key ?? "",
          featuredPosition: value.featured_position?.toString() ?? "",
        });
      })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, [listingId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    const honeypotHeaders: Record<string, string> = honeypot
      ? { [HONEYPOT_HEADER_NAME]: honeypot }
      : {};
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const priceMinor = parseUsdMinor(form.price);
      if (editing) {
        const next = await apiFetch<OperatorListing>(`/api/operator/listings/${listingId}`, {
          method: "PATCH",
          headers: { ...honeypotHeaders, "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            ...operatorListingDescriptionPayload(form),
            price_minor: priceMinor,
            currency: "USD",
            destination: form.destination.trim(),
            featured_position: form.featuredPosition ? Number(form.featuredPosition) : null,
          }),
        });
        setListing(next);
        setSaved(true);
      } else {
        const next = await apiFetch<OperatorListing>("/api/operator/listings", {
          method: "POST",
          headers: { ...honeypotHeaders, "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            ...operatorListingDescriptionPayload(form),
            price_minor: priceMinor,
            currency: "USD",
            destination: form.destination.trim(),
            external_key: form.externalKey.trim() || undefined,
            featured_position: form.featuredPosition ? Number(form.featuredPosition) : null,
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
      <OperatorPage>
        <OperatorLoadingState variant="section" label="Loading listing" />
      </OperatorPage>
    );
  return (
    <OperatorPage>
      <OperatorPageHeader
        eyebrow={editing ? "Catalogue listing" : "New catalogue listing"}
        title={editing ? "Edit listing" : "Create listing"}
        description="Listings are managed by Cliqero. No seller or payee is selected here."
        actions={
          <Button asChild variant="ghost">
            <Link href="/operator/catalogue">Back to catalogue</Link>
          </Button>
        }
      />
      {error && <OperatorErrorState message={error} />}
      {saved && <Toast tone="success">Listing saved.</Toast>}
      <OperatorSection
        title={editing ? "Listing details" : "New listing details"}
        description="Save catalogue fields through the existing listing workflow."
        surface
      >
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
            Short description
            <Textarea
              rows={3}
              maxLength={200}
              value={form.shortDescription}
              onChange={(event) => setForm({ ...form, shortDescription: event.target.value })}
            />
            <span className="field-help">Plain-text customer summary, up to 200 characters.</span>
          </label>
          <label>
            Long description
            <Textarea
              rows={8}
              value={form.longDescription}
              onChange={(event) => setForm({ ...form, longDescription: event.target.value })}
            />
            <span className="field-help">Detailed listing content; Markdown is supported.</span>
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
          <label>
            Featured home position (optional)
            <Input
              type="number"
              min="1"
              value={form.featuredPosition}
              onChange={(event) => setForm({ ...form, featuredPosition: event.target.value })}
            />
            <span className="field-help">
              Published listings with a position appear on Home in ascending order.
            </span>
          </label>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create listing"}
          </Button>
          <HoneypotField />
        </form>
      </OperatorSection>
      {editing && listing && (
        <>
          <CatalogueMedia listing={listing} onChange={setListing} />
          <CatalogueIntegrations listingId={listing.id} />
        </>
      )}
    </OperatorPage>
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
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<IntegrationCredential>(
        `/api/operator/listings/${listingId}/integrations`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
          },
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
    <OperatorSection
      title="Listing credentials"
      description="Credentials let an external destination verify an entitled buyer. Secrets are shown once."
      surface
    >
      {error && <OperatorErrorState message={error} />}
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
        <HoneypotField />
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
        <OperatorEmptyState
          title="No access credentials"
          description="Create one when this listing needs an external access verifier."
        />
      )}
    </OperatorSection>
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
    const formData = new FormData(form);
    const honeypot = String(formData.get(HONEYPOT_FIELD_NAME) ?? "");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const media = await apiFetch<ListingMedia>(`/api/operator/listings/${listing.id}/media`, {
        method: "POST",
        headers: honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : undefined,
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
    <OperatorSection title="Listing images" surface>
      {error && <OperatorErrorState message={error} />}
      <form className="media-upload-form" onSubmit={(event) => void upload(event)}>
        <Input name="file" type="file" accept="image/*" required />
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? "Uploading…" : "Add image"}
        </Button>
        <HoneypotField />
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
        <OperatorEmptyState
          title="No media yet"
          description="Add a browser-renderable image to improve the public listing."
        />
      )}
    </OperatorSection>
  );
}
