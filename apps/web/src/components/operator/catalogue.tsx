"use client";

/* Public media URLs are resolved by the configured storage provider at runtime. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiClientError,
  apiFetch,
  formatMinorUsd,
  minorToUsdInput,
  parseUsdMinor,
  presentFormApiError,
  type ListingMedia,
  type Listing,
  type Integration,
  type IntegrationCredential,
  type OperatorListing,
  type OperatorListingPage,
} from "@/lib/api-client";
import type { ListingCategory } from "@/modules/listing/category/category";
import {
  externalListingImageUrl,
  listingImageSource,
  updateListingImageMetadata,
  type ListingImageSource,
} from "@/modules/listing/external-image";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { HoneypotField } from "../honeypot-field";
import { Textarea } from "../ui/textarea";
import { Label, RequiredLabel } from "../ui/label";
import { Alert } from "../ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { useToast } from "../toast/provider";
import { MultiSelect } from "../ui/multi-select";
import { MarkdownEditor } from "../ui/markdown-editor";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { OperatorFilterField } from "./ui/toolbar";
import { OperatorPrimaryCell, OperatorStatusCell, OperatorValueCell } from "./ui/data-cells";
import { CrudIndex } from "@/components/crud/index-page";
import { CrudSortSelect } from "@/components/crud/sort-select";
import { CrudEdit } from "@/components/crud/edit";
import { CrudDetail } from "@/components/crud/detail";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudColumn } from "@/components/crud/table";
import type { CrudBulkAction } from "@/components/crud/bulk-actions";
import type { OperatorAction } from "./ui/actions-menu";
import { hasCapability, type Capability } from "@/modules/identity/capabilities";
import { OperatorResourceLink } from "./ui/resource-link";
import { OperatorEmptyState } from "./ui/empty-state";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorSection } from "./ui/section";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "./ui/bulk-outcome";
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";
import { useOperatorConfirmation } from "./ui/confirmation";
import { openResolvedWindow } from "./ui/async-window";
import { ListingDetail } from "../listing/detail";
import { openOperatorPreviewWindow, operatorPreviewWindowName } from "./ui/preview-window";
import {
  discardCataloguePreviewDraft,
  readCataloguePreviewDraft,
  saveCataloguePreviewDraft,
} from "./catalogue/preview-storage";
import { ExternalImagePreview } from "./catalogue/external-image-preview";
import { FieldError } from "../form/feedback";

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

export function createCatalogueImagePreview(file: File) {
  const previewUrl = URL.createObjectURL(file);
  return {
    file,
    previewUrl,
    dispose: () => URL.revokeObjectURL(previewUrl),
  };
}

export function newListingExternalKey() {
  return `listing-${crypto.randomUUID().replaceAll("-", "")}`;
}

export function operatorCatalogueRowActions(
  listing: OperatorListing,
  canDelete: boolean,
  handlers: {
    changeState: (listing: OperatorListing, action: "publish" | "restore" | "archive") => void;
    deleteListing: (listing: OperatorListing) => void;
    openListing: (listing: OperatorListing) => void;
  },
): readonly OperatorAction[] {
  return [
    {
      type: "link",
      label: "Edit",
      href: `/operator/catalogue/${listing.id}`,
      requiredCapability: "catalogue.manage",
    },
    {
      type: "link",
      label: "View reviews",
      href: `/operator/reviews?listing=${listing.id}`,
      requiredCapability: "reviews.moderate",
    },
    {
      type: "link",
      label: "View purchases",
      href: `/operator/purchases?listing=${listing.id}`,
      requiredCapability: "finance.read",
    },
    {
      type: "action",
      label: "Open listing",
      requiredCapability: "catalogue.manage",
      onSelect: () => handlers.openListing(listing),
    },
    ...(listing.state === "draft"
      ? [
          {
            type: "action" as const,
            label: "Publish",
            requiredCapability: "catalogue.manage" as const,
            onSelect: () => handlers.changeState(listing, "publish"),
          },
        ]
      : []),
    ...(listing.state === "published"
      ? [
          {
            type: "action" as const,
            label: "Archive",
            requiredCapability: "catalogue.manage" as const,
            destructive: true,
            onSelect: () => handlers.changeState(listing, "archive"),
          },
        ]
      : []),
    ...(listing.state === "archived"
      ? [
          {
            type: "action" as const,
            label: "Restore",
            requiredCapability: "catalogue.manage" as const,
            onSelect: () => handlers.changeState(listing, "restore"),
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            type: "action" as const,
            label: "Delete",
            requiredCapability: "catalogue.manage" as const,
            destructive: true,
            onSelect: () => handlers.deleteListing(listing),
          },
        ]
      : []),
  ];
}

export function OperatorCatalogueList({
  capabilities = [],
}: {
  capabilities?: readonly Capability[];
}) {
  const canManage = hasCapability(capabilities, "catalogue.manage");
  const canDelete = canManage;
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [visibility, setVisibility] = useState("");
  const [sort, setSort] = useState<"date" | "price" | "title" | "rating">("date");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const sortChoice = `${sort}:${direction}`;
  const [transferOpen, setTransferOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useOperatorConfirmation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  const collection = useCrudCollection(
    async (
      filters: {
        search: string;
        state: string;
        visibility: string;
        sort: string;
        direction: string;
      },
      cursor,
      pageSize,
    ) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (filters.search) params.set("search", filters.search);
      params.set("state", filters.state || "all");
      if (filters.visibility) params.set("visibility", filters.visibility);
      params.set("sort", filters.sort);
      params.set("direction", filters.direction);
      if (cursor) params.set("cursor", cursor);
      const page = await apiFetch<OperatorListingPage>(`/api/listings?${params}`);
      return { items: page.items, nextCursor: page.next_cursor };
    },
    { search: "", state: "", visibility: "", sort: "date", direction: "desc" },
  );

  async function changeState(listing: OperatorListing, action: "publish" | "restore" | "archive") {
    if (
      action === "archive" &&
      !(await confirm({
        title: "Archive listing?",
        description: `Archive “${listing.title}”?`,
        confirmLabel: "Archive",
        destructive: true,
      }))
    )
      return;
    setActionError(null);
    setBulkOutcome(null);
    try {
      await apiFetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: action === "publish" ? "published" : action === "archive" ? "archived" : "draft",
        }),
      });
      toast.success(
        `Listing ${action === "publish" ? "published" : action === "archive" ? "archived" : "restored"}.`,
      );
      await collection.retry();
    } catch (cause) {
      // The list reader owns persistent query failures; mutations retain transient feedback here.
      setActionError(errorMessage(cause));
    }
  }

  async function deleteListing(listing: OperatorListing) {
    if (
      !(await confirm({
        title: "Delete listing?",
        description: `Permanently delete “${listing.title}”? Listings with purchase, payment, entitlement, review, or referral history cannot be deleted.`,
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return;
    try {
      const result = await runOperatorBulkAction({
        resource: "listings",
        action: "delete",
        ids: [listing.id],
      });
      if (result.failed.length) throw new Error(result.failed[0]!.message);
      toast.success("Listing deleted.");
      await collection.retry();
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }

  async function bulkState(
    listings: readonly OperatorListing[],
    action: "publish" | "archive" | "restore",
  ) {
    if (
      action === "archive" &&
      !(await confirm({
        title: "Archive listings?",
        description: `Archive ${listings.length} selected listing${listings.length === 1 ? "" : "s"}?`,
        confirmLabel: "Archive",
        destructive: true,
      }))
    )
      return false;
    setActionError(null);
    setBulkOutcome(null);
    try {
      const results = await runOperatorBulkAction({
        resource: "listings",
        action: "update",
        state: action === "publish" ? "published" : action === "archive" ? "archived" : "draft",
        ids: listings.map((listing) => listing.id),
      });
      const failures = results.failed;
      if (failures.length)
        setBulkOutcome({
          resource: "listings",
          selectedCount: listings.length,
          failures: failures.map(({ id, message }) => ({
            id,
            label: listings.find((listing) => listing.id === id)?.title ?? id,
            message,
          })),
        });
      await collection.retry();
      if (!failures.length)
        toast.success(`${listings.length} listing${listings.length === 1 ? "" : "s"} updated.`);
      return failures.length === 0;
    } catch (cause) {
      setActionError(errorMessage(cause));
      return false;
    }
  }

  async function bulkDelete(listings: readonly OperatorListing[]) {
    if (
      !(await confirm({
        title: "Delete listings?",
        description: `Permanently delete ${listings.length} selected listing${listings.length === 1 ? "" : "s"}? Listings with purchase, payment, entitlement, review, or referral history cannot be deleted.`,
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return false;
    setActionError(null);
    setBulkOutcome(null);
    try {
      const results = await runOperatorBulkAction({
        resource: "listings",
        action: "delete",
        ids: listings.map((listing) => listing.id),
      });
      if (results.failed.length)
        setBulkOutcome({
          resource: "listings",
          selectedCount: listings.length,
          failures: results.failed.map(({ id, message }) => ({
            id,
            label: listings.find((listing) => listing.id === id)?.title ?? id,
            message,
          })),
        });
      await collection.retry();
      if (!results.failed.length)
        toast.success(`${listings.length} listing${listings.length === 1 ? "" : "s"} deleted.`);
      return results.failed.length === 0;
    } catch (cause) {
      setActionError(errorMessage(cause));
      return false;
    }
  }

  const bulkActions: readonly CrudBulkAction<OperatorListing>[] = canManage
    ? [
        { value: "publish", label: "Publish", onSelect: (items) => bulkState(items, "publish") },
        {
          value: "archive",
          label: "Archive",
          destructive: true,
          onSelect: (items) => bulkState(items, "archive"),
        },
        { value: "restore", label: "Restore", onSelect: (items) => bulkState(items, "restore") },
        ...(canDelete
          ? [
              {
                value: "delete",
                label: "Delete",
                destructive: true,
                onSelect: (items: readonly OperatorListing[]) => bulkDelete(items),
              },
            ]
          : []),
      ]
    : [];

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
        `/api/listings/import?format=${encodeURIComponent(format)}&mode=${encodeURIComponent(mode)}`,
        {
          method: "POST",
          headers: {
            "content-type": "text/plain",
            ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
          },
          body,
        },
      );
      toast.success(
        `Import completed. ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed.`,
      );
      setTransferOpen(false);
      setImportMessage(null);
      form.reset();
      await collection.retry();
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setImporting(false);
    }
  }

  const columns: readonly CrudColumn<OperatorListing>[] = [
    {
      key: "listing",
      label: "Listing",
      primary: true,
      render: (listing) => (
        <OperatorPrimaryCell
          title={<Link href={`/operator/catalogue/${listing.id}`}>{listing.title}</Link>}
          subtitle={listing.short_description || "No short description"}
        />
      ),
    },
    {
      key: "destination",
      label: "Destination / key",
      render: (listing) => (
        <OperatorPrimaryCell
          title={listing.destination}
          subtitle={listing.external_key ?? undefined}
        />
      ),
    },
    {
      key: "categories",
      label: "Categories",
      render: (listing) => (
        <OperatorValueCell>
          {listing.categories.map((category) => category.name).join(" · ") || "—"}
        </OperatorValueCell>
      ),
    },
    {
      key: "visibility",
      label: "Visibility",
      render: (listing) => (
        <OperatorValueCell>
          {listing.visibility === "authenticated" ? "Members only" : "Public"}
        </OperatorValueCell>
      ),
    },
    {
      key: "state",
      label: "State",
      render: (listing) => <OperatorStatusCell status={listing.state ?? "draft"} />,
    },
    {
      key: "reviews",
      label: "Reviews",
      render: (listing) => (
        <OperatorResourceLink
          capabilities={capabilities}
          requiredCapability="reviews.moderate"
          href={`/operator/reviews?listing=${encodeURIComponent(listing.id)}`}
        >
          {listing.review_count}
        </OperatorResourceLink>
      ),
    },
    {
      key: "purchases",
      label: "Purchases",
      render: (listing) => (
        <OperatorResourceLink
          capabilities={capabilities}
          requiredCapability="finance.read"
          href={`/operator/purchases?listing=${encodeURIComponent(listing.id)}`}
        >
          {listing.purchase_count}
        </OperatorResourceLink>
      ),
    },
    {
      key: "price",
      label: "Price",
      render: (listing) => (
        <OperatorValueCell>
          {listing.compare_at_price
            ? `${formatMinorUsd(listing.compare_at_price.minor_amount)} → `
            : ""}
          {formatMinorUsd(listing.price.minor_amount)}
        </OperatorValueCell>
      ),
    },
  ];
  const actions = (listing: OperatorListing) =>
    operatorCatalogueRowActions(listing, canDelete, {
      changeState: (item, action) => void changeState(item, action),
      deleteListing: (item) => void deleteListing(item),
      openListing: (item) =>
        void openResolvedWindow(async () => {
          if (item.state === "published") return `/listings/${item.id}`;
          return (await apiFetch<{ url: string }>(`/internal/listings/${item.id}/preview-token`))
            .url;
        }),
    });

  return (
    <>
      <CrudIndex
        capabilities={capabilities}
        eyebrow="Platform catalogue"
        title="Listings"
        description="Create and curate the listings Cliqero makes available to customers."
        headerActions={
          canManage ? (
            <Button type="button" variant="secondary" onClick={() => setTransferOpen(true)}>
              Transfer
            </Button>
          ) : undefined
        }
        createAction={
          canManage ? { label: "New listing", href: "/operator/catalogue/new" } : undefined
        }
        filters={
          <>
            <OperatorFilterField label="Search" htmlFor="catalogue-search">
              <Input
                id="catalogue-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Title or description"
              />
            </OperatorFilterField>
            <OperatorFilterField label="Visibility" htmlFor="catalogue-visibility">
              <Select
                id="catalogue-visibility"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value)}
              >
                <option value="">All visibility</option>
                <option value="public">Public</option>
                <option value="authenticated">Members only</option>
              </Select>
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
          </>
        }
        sort={
          <CrudSortSelect
            value={sortChoice}
            onChange={(value) => {
              const [nextSort, nextDirection] = value.split(":") as [typeof sort, typeof direction];
              setSort(nextSort);
              setDirection(nextDirection);
            }}
            options={[
              { value: "date:desc", label: "Newest", sort: "date", direction: "desc" },
              { value: "date:asc", label: "Oldest", sort: "date", direction: "asc" },
              { value: "title:asc", label: "Title A–Z", sort: "title", direction: "asc" },
              { value: "title:desc", label: "Title Z–A", sort: "title", direction: "desc" },
              { value: "price:desc", label: "Highest price", sort: "price", direction: "desc" },
              { value: "price:asc", label: "Lowest price", sort: "price", direction: "asc" },
              { value: "rating:desc", label: "Highest rated", sort: "rating", direction: "desc" },
              { value: "rating:asc", label: "Lowest rated", sort: "rating", direction: "asc" },
            ]}
          />
        }
        onFiltersSubmit={async (event) => {
          event.preventDefault();
          return collection.apply({ search: search.trim(), state, visibility, sort, direction });
        }}
        onFiltersReset={async () => {
          const ok = await collection.apply({
            search: "",
            state: "",
            visibility: "",
            sort: "date",
            direction: "desc",
          });
          if (ok) {
            setSearch("");
            setState("");
            setVisibility("");
            setSort("date");
            setDirection("desc");
          }
          return ok;
        }}
        filtersDirty={Boolean(
          search.trim() || state || visibility || sort !== "date" || direction !== "desc",
        )}
        toolbarActions={
          <Button type="submit" variant="action" disabled={collection.loading}>
            Apply filters
          </Button>
        }
        beforeTable={
          <div className="grid gap-3">
            {actionError && <OperatorErrorState message={actionError} />}
            {bulkOutcome && <OperatorBulkOutcome outcome={bulkOutcome} />}
          </div>
        }
        items={collection.items}
        columns={columns}
        getRowKey={(listing) => listing.id}
        selection={
          canManage ? { labelForItem: (listing) => `listing ${listing.title}` } : undefined
        }
        bulkActions={bulkActions}
        actions={actions}
        actionLabel={(listing) => `Actions for ${listing.title}`}
        loading={collection.loading}
        error={collection.error}
        onRetry={() => void collection.retry()}
        emptyTitle="No listings found"
        emptyDescription="Try another filter or create the first catalogue listing."
        emptyAction={
          canManage ? (
            <Button asChild>
              <Link href="/operator/catalogue/new">New listing</Link>
            </Button>
          ) : undefined
        }
        pagination={{
          hasPrevious: collection.hasPrevious,
          hasNext: collection.hasNext,
          onPrevious: () => void collection.previous(),
          onNext: () => void collection.next(),
        }}
        sectionTitle="Catalogue"
        sectionDescription="Catalogue managers can permanently delete listings only when no purchase, payment, entitlement, review, or referral history depends on them."
      />
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Catalogue transfer</DialogTitle>
          </DialogHeader>
          <section
            className="grid gap-3 border-b border-slate-200 pb-5"
            aria-labelledby="export-listings-heading"
          >
            <h3 id="export-listings-heading" className="font-semibold">
              Export listings
            </h3>
            <div className="flex flex-wrap gap-2">
              {(["json", "csv", "yaml"] as const).map((format) => (
                <Button key={format} asChild variant="secondary" size="sm">
                  <a href={`/api/listings/export?format=${format}`}>{format.toUpperCase()}</a>
                </Button>
              ))}
            </div>
          </section>
          <section className="grid gap-3" aria-labelledby="import-listings-heading">
            <h3 id="import-listings-heading" className="font-semibold">
              Import listings
            </h3>
            <form
              className="grid gap-3 sm:grid-cols-2"
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
              <div className="flex items-center justify-end">
                <Button type="submit" variant="action" disabled={importing}>
                  {importing ? "Importing…" : "Import"}
                </Button>
              </div>
              <HoneypotField />
            </form>
            {importMessage && <Alert>{importMessage}</Alert>}
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OperatorCatalogueEditor({ listingId }: { listingId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(listingId);
  const [listing, setListing] = useState<OperatorListing | null>(null);
  const [form, setForm] = useState({
    title: "",
    shortDescription: "",
    longDescription: "",
    price: "",
    destination: "",
    externalKey: "",
    imageSource: "uploaded" as ListingImageSource,
    externalImageUrl: "",
    featuredPosition: "",
    compareAtPrice: "",
    visibility: "public" as "public" | "authenticated",
    state: "draft" as "draft" | "published" | "archived",
    categoryIds: [] as string[],
  });
  const [categories, setCategories] = useState<ListingCategory[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | ApiClientError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [stagedMedia, setStagedMedia] = useState<ReturnType<typeof createCatalogueImagePreview>[]>(
    [],
  );
  const [clearExternalImage, setClearExternalImage] = useState(false);
  const externalKeyTouched = useRef(false);
  const previewIdentity = useRef<string | null>(null);
  const stagedMediaRef = useRef(stagedMedia);

  useEffect(() => {
    stagedMediaRef.current = stagedMedia;
  }, [stagedMedia]);

  useEffect(() => {
    if (editing || externalKeyTouched.current) return;
    // Generate only after hydration to keep the server and client render identical.
    setForm((current) =>
      current.externalKey ? current : { ...current, externalKey: newListingExternalKey() },
    );
  }, [editing]);

  useEffect(() => () => stagedMediaRef.current.forEach((item) => item.dispose()), []);

  useEffect(() => {
    void apiFetch<{ items: ListingCategory[] }>("/api/catalogue/categories")
      .then((result) => {
        setCategories(result.items);
        setCategoriesLoaded(true);
      })
      .catch((cause) =>
        setError(
          cause instanceof ApiClientError
            ? cause
            : "We couldn't load catalogue categories. Reload the page and try again.",
        ),
      );
  }, []);

  useEffect(() => {
    if (!listingId) return;
    void apiFetch<OperatorListing>(`/api/listings/${listingId}`)
      .then((value) => {
        setListing(value);
        setForm({
          title: value.title,
          ...operatorListingDescriptionForm(value),
          price: minorToUsdInput(value.price.minor_amount),
          destination: value.destination,
          externalKey: value.external_key ?? "",
          imageSource: listingImageSource(value.metadata, value.media.length > 0),
          externalImageUrl: externalListingImageUrl(value.metadata) ?? "",
          featuredPosition: value.featured_position?.toString() ?? "",
          compareAtPrice: value.compare_at_price
            ? minorToUsdInput(value.compare_at_price.minor_amount)
            : "",
          visibility: value.visibility,
          state: value.state ?? "draft",
          categoryIds: value.categories.map((category) => category.id),
        });
      })
      .catch((cause) =>
        setError(
          cause instanceof ApiClientError ? cause : "We couldn't load this listing. Try again.",
        ),
      )
      .finally(() => setLoading(false));
  }, [listingId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoriesLoaded) {
      setError("Categories could not be loaded. Reload the page before saving.");
      return;
    }
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    const honeypotHeaders: Record<string, string> = honeypot
      ? { [HONEYPOT_HEADER_NAME]: honeypot }
      : {};
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const uploadedCount = (listing?.media.length ?? 0) + stagedMedia.length;
      if (form.imageSource === "uploaded" && uploadedCount === 0) {
        throw new ApiClientError(
          "Please correct the highlighted fields.",
          422,
          "validation_error",
          { image_source: "Choose an uploaded image or select another image source." },
        );
      }
      if (
        form.imageSource === "external" &&
        !externalListingImageUrl({ external_image_url: form.externalImageUrl.trim() })
      ) {
        throw new ApiClientError(
          "Please correct the highlighted fields.",
          422,
          "validation_error",
          { external_image_url: "Enter a valid HTTP or HTTPS image URL." },
        );
      }
      const metadata = updateListingImageMetadata(
        listing?.metadata ?? {},
        form.imageSource,
        form.externalImageUrl,
      );
      if (clearExternalImage) delete metadata.external_image_url;
      let priceMinor: string;
      try {
        priceMinor = parseUsdMinor(form.price, { allowZero: true });
      } catch (cause) {
        throw new ApiClientError(
          "Please correct the highlighted fields.",
          422,
          "validation_error",
          {
            price_minor:
              cause instanceof Error ? cause.message : "Enter a valid USD listing price.",
          },
        );
      }
      let compareAtMinor: string | null;
      try {
        compareAtMinor = form.compareAtPrice.trim() ? parseUsdMinor(form.compareAtPrice) : null;
      } catch (cause) {
        throw new ApiClientError(
          "Please correct the highlighted fields.",
          422,
          "validation_error",
          {
            compare_at_price_minor:
              cause instanceof Error ? cause.message : "Enter a valid USD compare-at price.",
          },
        );
      }
      if (compareAtMinor !== null && BigInt(compareAtMinor) <= BigInt(priceMinor)) {
        throw new ApiClientError(
          "Please correct the highlighted fields.",
          422,
          "validation_error",
          { compare_at_price_minor: "Compare-at price must be greater than the listing price." },
        );
      }
      if (editing) {
        await uploadStagedMedia(listingId!, honeypotHeaders);
        const next = await apiFetch<OperatorListing>(`/api/listings/${listingId}`, {
          method: "PATCH",
          headers: { ...honeypotHeaders, "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            ...operatorListingDescriptionPayload(form),
            price_minor: priceMinor,
            currency: "USD",
            destination: form.destination.trim(),
            featured_position: form.featuredPosition ? Number(form.featuredPosition) : null,
            compare_at_price_minor: compareAtMinor,
            visibility: form.visibility,
            state: form.state,
            metadata,
            category_ids: form.categoryIds,
          }),
        });
        setListing(next);
        toast.success("Listing saved.");
      } else {
        const next = await apiFetch<OperatorListing>("/api/listings", {
          method: "POST",
          headers: { ...honeypotHeaders, "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            ...operatorListingDescriptionPayload(form),
            price_minor: priceMinor,
            currency: "USD",
            destination: form.destination.trim(),
            metadata,
            external_key: form.externalKey.trim() || undefined,
            featured_position: form.featuredPosition ? Number(form.featuredPosition) : null,
            compare_at_price_minor: compareAtMinor,
            visibility: form.visibility,
            state: form.state,
            category_ids: form.categoryIds,
          }),
        });
        await uploadStagedMedia(next.id, honeypotHeaders);
        toast.success("Listing created.");
        router.replace(`/operator/catalogue/${next.id}`);
      }
      setFieldErrors({});
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        const presented = presentFormApiError(cause, [
          "title",
          "short_description",
          "long_description",
          "price_minor",
          "compare_at_price_minor",
          "destination",
          "image_source",
          "external_image_url",
        ]);
        setFieldErrors(presented.fields);
        setError(cause);
      } else {
        setError("We couldn't save the listing. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  function clearFieldErrors(...fields: string[]) {
    setFieldErrors((current) => {
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
    setError((current) => {
      if (!(current instanceof ApiClientError)) return null;
      const remaining = { ...(current.fields ?? {}) };
      for (const field of fields) delete remaining[field];
      return Object.keys(remaining).length
        ? new ApiClientError(
            "Please correct the highlighted fields.",
            current.status,
            current.code,
            remaining,
            current.requestId,
          )
        : null;
    });
  }

  async function uploadStagedMedia(targetListingId: string, uploadHeaders: Record<string, string>) {
    for (const item of [...stagedMediaRef.current]) {
      const data = new FormData();
      data.set("file", item.file);
      const uploaded = await apiFetch<ListingMedia>(`/api/listings/${targetListingId}/media`, {
        method: "POST",
        headers: Object.keys(uploadHeaders).length ? uploadHeaders : undefined,
        body: data,
      });
      setListing((current) =>
        current
          ? {
              ...current,
              media: [...current.media, uploaded].sort(
                (left, right) => left.position - right.position,
              ),
            }
          : current,
      );
      item.dispose();
      setStagedMedia((current) => current.filter((candidate) => candidate !== item));
    }
  }

  function openDraftPreview() {
    try {
      if (!form.title.trim() || !form.shortDescription.trim() || !form.destination.trim()) {
        setError("Enter a title, short description, and access URL before previewing.");
        return;
      }
      if (
        form.imageSource === "uploaded" &&
        (listing?.media.length ?? 0) + stagedMedia.length === 0
      ) {
        setError("Choose an uploaded listing image or select another image source.");
        return;
      }
      if (
        form.imageSource === "external" &&
        !externalListingImageUrl({ external_image_url: form.externalImageUrl.trim() })
      ) {
        setError("Enter a valid HTTP or HTTPS image URL before previewing.");
        return;
      }
      previewIdentity.current ??= `editor-${crypto.randomUUID()}`;
      const previewListing: Listing = {
        id: `preview-${previewIdentity.current}`,
        title: form.title.trim(),
        short_description: form.shortDescription,
        long_description: form.longDescription,
        test_only: null,
        price: { minor_amount: parseUsdMinor(form.price, { allowZero: true }), currency: "USD" },
        compare_at_price: form.compareAtPrice.trim()
          ? { minor_amount: parseUsdMinor(form.compareAtPrice), currency: "USD" }
          : null,
        visibility: form.visibility,
        categories: categories
          .filter((category) => form.categoryIds.includes(category.id))
          .map(({ id, name, slug }) => ({ id, name, slug })),
        metadata: (() => {
          const metadata = updateListingImageMetadata(
            listing?.metadata ?? {},
            form.imageSource,
            form.externalImageUrl,
          );
          if (clearExternalImage) delete metadata.external_image_url;
          return metadata;
        })(),
        state: form.state,
        featured_position: form.featuredPosition ? Number(form.featuredPosition) : null,
        rating: null,
        media: [
          ...(listing?.media ?? []),
          ...stagedMedia.map(({ file, previewUrl }, position) => ({
            id: `preview-media-${position}`,
            url: previewUrl,
            mime_type: file.type,
            width: null,
            height: null,
            position,
            alt_text: file.name,
          })),
        ],
      };
      saveCataloguePreviewDraft(previewIdentity.current, previewListing);
      const url = `/operator/catalogue/preview?session=${encodeURIComponent(previewIdentity.current)}&revision=${Date.now()}`;
      const tab = openOperatorPreviewWindow(
        url,
        operatorPreviewWindowName("catalogue", previewIdentity.current),
      );
      if (!tab) {
        discardCataloguePreviewDraft(previewIdentity.current);
        setError("Allow pop-ups to open the private preview.");
        return;
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <CrudEdit
      mode={editing ? "edit" : "create"}
      eyebrow={editing ? "Catalogue listing" : "New catalogue listing"}
      title={editing ? "Edit listing" : "Create listing"}
      description="Listings are managed by Cliqero. No seller or payee is selected here."
      backHref="/operator/catalogue"
      backLabel="Back to catalogue"
      formId="catalogue-editor-form"
      submitLabel={editing ? "Save changes" : "Create listing"}
      savingLabel="Saving…"
      saving={saving}
      loading={loading}
      loadingLabel="Loading listing"
      error={error}
      errorFields={[
        "title",
        "short_description",
        "long_description",
        "price_minor",
        "compare_at_price_minor",
        "destination",
        "image_source",
        "external_image_url",
      ]}
      sectionTitle={editing ? "Listing details" : "New listing details"}
      sectionDescription="Save catalogue fields through the existing listing workflow."
      headerActions={
        <>
          <Button type="button" variant="secondary" size="xs" onClick={openDraftPreview}>
            Preview
          </Button>
          {listing && (
            <Button asChild type="button" variant="outline" size="xs">
              <Link
                href={listing.state === "published" ? `/listings/${listing.id}` : "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  if (listing.state === "published") return;
                  event.preventDefault();
                  void openResolvedWindow(
                    async () =>
                      (
                        await apiFetch<{ url: string }>(
                          `/internal/listings/${listing.id}/preview-token`,
                        )
                      ).url,
                  );
                }}
              >
                Open listing
              </Link>
            </Button>
          )}
        </>
      }
      onSubmit={save}
      afterFields={editing && listing ? <CatalogueIntegrations listingId={listing.id} /> : null}
    >
      <div className="grid gap-2">
        <RequiredLabel htmlFor="listing-title">Title</RequiredLabel>
        <Input
          id="listing-title"
          name="title"
          required
          value={form.title}
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={fieldErrors.title ? "listing-title-error" : undefined}
          onChange={(event) => {
            clearFieldErrors("title");
            setForm({ ...form, title: event.target.value });
          }}
        />
        <FieldError id="listing-title-error" message={fieldErrors.title} />
      </div>
      <div className="grid gap-2">
        <RequiredLabel htmlFor="listing-short-description">Short description</RequiredLabel>
        <Textarea
          id="listing-short-description"
          name="short_description"
          rows={3}
          maxLength={200}
          required
          value={form.shortDescription}
          aria-invalid={Boolean(fieldErrors.short_description)}
          aria-describedby={
            fieldErrors.short_description ? "listing-short-description-error" : undefined
          }
          onChange={(event) => {
            clearFieldErrors("short_description");
            setForm({ ...form, shortDescription: event.target.value });
          }}
        />
        <FieldError id="listing-short-description-error" message={fieldErrors.short_description} />
        <p className="text-xs leading-5 text-slate-500">
          Plain-text customer summary, up to 200 characters.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="listing-long-description">Long description</Label>
        <MarkdownEditor
          markdown={form.longDescription}
          fieldName="long_description"
          onChange={(longDescription) => {
            clearFieldErrors("long_description");
            setForm({ ...form, longDescription });
          }}
        />
        <FieldError id="listing-long-description-error" message={fieldErrors.long_description} />
        <p className="text-xs leading-5 text-slate-500">
          Detailed listing content saved as Markdown.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <RequiredLabel htmlFor="listing-price">Price (USD)</RequiredLabel>
          <Input
            id="listing-price"
            name="price_minor"
            aria-invalid={Boolean(fieldErrors.price_minor)}
            aria-describedby={fieldErrors.price_minor ? "listing-price-error" : undefined}
            required
            inputMode="decimal"
            placeholder="10.00"
            value={form.price}
            onChange={(event) => {
              clearFieldErrors("price_minor", "compare_at_price_minor");
              setForm({ ...form, price: event.target.value });
            }}
          />
          <FieldError id="listing-price-error" message={fieldErrors.price_minor} />
          <p className="text-xs leading-5 text-slate-500">
            Set 0.00 for a free listing. Amounts are stored in exact USD minor units.
          </p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="listing-compare-price">Compare-at price (USD, optional)</Label>
          <Input
            id="listing-compare-price"
            name="compare_at_price_minor"
            aria-invalid={Boolean(fieldErrors.compare_at_price_minor)}
            aria-describedby={
              fieldErrors.compare_at_price_minor ? "listing-compare-price-error" : undefined
            }
            inputMode="decimal"
            placeholder="40.00"
            value={form.compareAtPrice}
            onChange={(event) => {
              clearFieldErrors("compare_at_price_minor");
              setForm({ ...form, compareAtPrice: event.target.value });
            }}
          />
          <FieldError
            id="listing-compare-price-error"
            message={fieldErrors.compare_at_price_minor}
          />
          <p className="text-xs leading-5 text-slate-500">
            Previous/reference price shown crossed out; must exceed the listing price.
          </p>
        </div>
        <div className="grid content-start gap-2">
          <RequiredLabel htmlFor="listing-access-url">Access URL</RequiredLabel>
          <Input
            id="listing-access-url"
            name="destination"
            required
            type="url"
            value={form.destination}
            aria-invalid={Boolean(fieldErrors.destination)}
            aria-describedby={fieldErrors.destination ? "listing-access-url-error" : undefined}
            onChange={(event) => {
              clearFieldErrors("destination");
              setForm({ ...form, destination: event.target.value });
            }}
          />
          <FieldError id="listing-access-url-error" message={fieldErrors.destination} />
          <p className="text-xs leading-5 text-slate-500">
            Customer delivery/access destination provided after purchase; not the public listing
            page.
          </p>
        </div>
      </div>
      <section className="grid gap-2" aria-label="Listing image">
        <Label htmlFor="listing-image-source">Image source</Label>
        <Select
          id="listing-image-source"
          value={form.imageSource}
          onChange={(event) => {
            clearFieldErrors("image_source", "external_image_url");
            setForm({ ...form, imageSource: event.target.value as ListingImageSource });
          }}
        >
          <option value="none">None</option>
          <option value="uploaded">Uploaded image</option>
          <option value="external">External image URL</option>
        </Select>
        <Label htmlFor="listing-image">Listing image</Label>
        {form.imageSource === "external" ? (
          <>
            <Input
              id="listing-image"
              name="external_image_url"
              type="url"
              maxLength={2000}
              required
              placeholder="https://example.test/image.webp"
              value={form.externalImageUrl}
              aria-invalid={Boolean(fieldErrors.external_image_url)}
              aria-describedby={
                fieldErrors.external_image_url ? "listing-external-image-error" : undefined
              }
              onChange={(event) => {
                clearFieldErrors("external_image_url");
                setClearExternalImage(false);
                setForm({ ...form, externalImageUrl: event.target.value });
              }}
            />
            <ExternalImagePreview value={form.externalImageUrl} />
            <FieldError
              id="listing-external-image-error"
              message={fieldErrors.external_image_url}
            />
          </>
        ) : form.imageSource === "uploaded" ? (
          <>
            <Input
              id="listing-image"
              name="image_source"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              required={!listing?.media.length && !stagedMedia.length}
              aria-invalid={Boolean(fieldErrors.image_source)}
              aria-describedby={fieldErrors.image_source ? "listing-image-error" : undefined}
              onChange={(event) => {
                clearFieldErrors("image_source");
                const files = [...(event.target.files ?? [])];
                setStagedMedia((current) => [
                  ...current,
                  ...files.map(createCatalogueImagePreview),
                ]);
                event.target.value = "";
              }}
            />
            <p className="text-xs text-slate-500">
              Existing uploaded images are preserved until you explicitly remove them.
            </p>
            {(() => {
              const staged = stagedMedia[0];
              const uploaded = listing?.media[0];
              const coverUrl = staged?.previewUrl ?? uploaded?.url;
              if (!coverUrl) return null;
              return (
                <figure className="grid gap-1">
                  <img
                    src={coverUrl}
                    alt={staged?.file.name ?? uploaded?.alt_text ?? "Listing image"}
                    className="h-40 w-full rounded-md border border-slate-200 bg-slate-50 object-contain sm:h-48"
                  />
                  <figcaption className="text-xs text-slate-500">Uploaded listing image</figcaption>
                </figure>
              );
            })()}
            {stagedMedia.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {stagedMedia.map((media, index) => (
                  <div key={`${media.file.name}-${index}`} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                      {media.file.name}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() =>
                        setStagedMedia((current) => {
                          current[index]?.dispose();
                          return current.filter((_, position) => position !== index);
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <FieldError id="listing-image-error" message={fieldErrors.image_source} />
          </>
        ) : (
          <p className="text-sm text-slate-500">No cover image will be shown.</p>
        )}
        {editing && externalListingImageUrl(listing?.metadata ?? {}) && !clearExternalImage && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setClearExternalImage(true);
              setForm({ ...form, externalImageUrl: "" });
            }}
          >
            Clear saved external URL
          </Button>
        )}
        {editing && listing && <CatalogueMedia listing={listing} onChange={setListing} />}
      </section>
      <div className="grid gap-2">
        <Label htmlFor="listing-visibility">Visibility</Label>
        <Select
          id="listing-visibility"
          value={form.visibility}
          onChange={(event) =>
            setForm({ ...form, visibility: event.target.value as "public" | "authenticated" })
          }
        >
          <option value="public">Public</option>
          <option value="authenticated">Members only</option>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="listing-state">State</Label>
        <Select
          id="listing-state"
          value={form.state}
          onChange={(event) =>
            setForm({ ...form, state: event.target.value as "draft" | "published" | "archived" })
          }
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </Select>
        <p className="text-xs leading-5 text-slate-500">
          Published listings require a short description.
        </p>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-slate-800">Categories</legend>
        <MultiSelect
          label="Categories"
          inputId="listing-categories"
          options={categories.map((category) => ({ value: category.id, label: category.name }))}
          value={form.categoryIds}
          onChange={(categoryIds) => setForm({ ...form, categoryIds })}
        />
        {categories.length === 0 && (
          <p className="text-xs leading-5 text-slate-500">
            No categories yet. Create them from Catalogue → Categories.
          </p>
        )}
      </fieldset>
      {!editing && (
        <div className="grid gap-2">
          <Label htmlFor="listing-external-key">External key (optional)</Label>
          <div className="flex gap-2">
            <Input
              id="listing-external-key"
              value={form.externalKey}
              onChange={(event) => {
                externalKeyTouched.current = true;
                setForm({ ...form, externalKey: event.target.value });
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                externalKeyTouched.current = true;
                setForm({ ...form, externalKey: newListingExternalKey() });
              }}
            >
              Regenerate
            </Button>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Useful for deterministic imports and reconciliation.
          </p>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="listing-featured-position">Featured home position (optional)</Label>
        <Input
          id="listing-featured-position"
          type="number"
          min="1"
          value={form.featuredPosition}
          onChange={(event) => setForm({ ...form, featuredPosition: event.target.value })}
        />
        <p className="text-xs leading-5 text-slate-500">
          Published listings with a position appear on Home in ascending order.
        </p>
      </div>
      <HoneypotField />
    </CrudEdit>
  );
}

export function OperatorCatalogueDraftPreview() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  useEffect(() => {
    let active = true;
    // Defer browser-only storage access until after the initial loading render.
    void Promise.resolve()
      .then(() => {
        const session = new URLSearchParams(window.location.search).get("session");
        if (!session || !/^(?:listing|editor)-[A-Za-z0-9-]+$/.test(session)) {
          if (active) setState("unavailable");
          return;
        }
        const draft = readCataloguePreviewDraft(session);
        if (active) {
          setListing(draft);
          setState(draft ? "ready" : "unavailable");
        }
      })
      .catch(() => {
        if (active) {
          setListing(null);
          setState("unavailable");
        }
      });
    return () => {
      active = false;
    };
  }, []);
  if (state === "loading")
    return (
      <CrudDetail
        eyebrow="Private preview"
        title="Loading preview"
        description="Opening the saved editor draft…"
      />
    );
  if (state === "unavailable" || !listing)
    return (
      <CrudDetail
        eyebrow="Private preview"
        title="Preview unavailable"
        description="Return to the listing form and open Preview again."
      />
    );
  return (
    <ListingDetail id={listing.id} initialListing={listing} privatePreview reviewsVisible={false} />
  );
}

function CatalogueIntegrations({ listingId }: { listingId: string }) {
  const [items, setItems] = useState<Integration[]>([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useOperatorConfirmation();

  async function load() {
    try {
      const result = await apiFetch<{ items: Integration[] }>(
        `/api/listings/${listingId}/integrations`,
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
        `/api/listings/${listingId}/integrations`,
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
    if (
      !(await confirm({
        title: "Rotate credential?",
        description: `Rotate the credential for “${item.name}”? The old credential will stop working.`,
        confirmLabel: "Rotate",
        destructive: true,
      }))
    )
      return;
    try {
      const result = await apiFetch<IntegrationCredential>(
        `/api/listings/${listingId}/integrations/${item.id}/rotate`,
        { method: "POST" },
      );
      setSecret(result.credential);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function revoke(item: Integration) {
    if (
      !(await confirm({
        title: "Revoke credential?",
        description: `Revoke “${item.name}”? Existing credentials will stop working.`,
        confirmLabel: "Revoke",
        destructive: true,
      }))
    )
      return;
    try {
      await apiFetch(`/api/listings/${listingId}/integrations`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [item.id] }),
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <OperatorSection
      title="Access credentials"
      description="Use a listing-scoped bearer credential on your external destination to verify a buyer’s entitlement through Cliqero’s access API. The secret is shown only when created or rotated; store it securely."
      surface
    >
      {error && <OperatorErrorState message={error} />}
      {secret && (
        <Alert>
          <strong>Copy this credential now:</strong>
          <code className="catalogue-secret">{secret}</code>
          <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(secret)}>
            Copy credential
          </Button>
          <Button variant="ghost" onClick={() => setSecret(null)}>
            Dismiss
          </Button>
        </Alert>
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
  const [error, setError] = useState<string | null>(null);
  const confirm = useOperatorConfirmation();
  async function remove(media: ListingMedia) {
    if (
      !(await confirm({
        title: "Remove listing media?",
        description: "Remove this media from the listing?",
        confirmLabel: "Remove",
        destructive: true,
      }))
    )
      return;
    try {
      await apiFetch(`/api/listings/${listing.id}/media`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [media.id] }),
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
        await apiFetch(`/api/listings/${listing.id}/media/${item.id}`, {
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
      {listing.media.length ? (
        <div className="catalogue-media-grid">
          {listing.media.map((media, index) => (
            <div className="catalogue-media-item" key={media.id}>
              <img
                src={media.url}
                alt={media.alt_text || "Listing image"}
                className="h-32 w-full rounded-md bg-slate-50 object-contain"
              />
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
