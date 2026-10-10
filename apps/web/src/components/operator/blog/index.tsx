"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BlogEditor } from "../../blog/editor";
import { apiFetch } from "@/lib/api-client";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select } from "../../ui/select";
import { Label, RequiredLabel } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { MultiSelect } from "../../ui/multi-select";
import type { BlogPost, BlogCategory } from "@/modules/blog/domain/blog";
import { HoneypotField } from "../../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { OperatorPrimaryCell, OperatorStatusCell } from "../ui/data-cells";
import { OperatorFilterField } from "../ui/toolbar";
import { CrudIndex } from "@/components/crud/index-page";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudColumn } from "@/components/crud/table";
import { CrudEdit } from "@/components/crud/edit";
import type { CrudBulkAction } from "@/components/crud/bulk-actions";
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";
import { useOperatorConfirmation } from "../ui/confirmation";
import { OperatorErrorState } from "../ui/error-state";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "../ui/bulk-outcome";
import { useToast } from "@/components/toast/provider";
import { CrudSortSelect } from "@/components/crud/sort-select";
import { openOperatorPreviewWindow, operatorPreviewWindowName } from "../ui/preview-window";

export function OperatorBlogList({ canDelete = false }: { canDelete?: boolean }) {
  const confirm = useOperatorConfirmation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [sort, direction] = sortChoice.split(":") as ["created" | "title", "asc" | "desc"];
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  const collection = useCrudCollection(
    async (
      filters: { search: string; status: string; sort: string; direction: string },
      cursor,
      pageSize,
    ) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (filters.search) params.set("search", filters.search);
      params.set("status", filters.status || "all");
      params.set("sort", filters.sort);
      params.set("direction", filters.direction);
      if (cursor) params.set("cursor", cursor);
      const result = await apiFetch<{ items: BlogPost[]; nextCursor: string | null }>(
        `/api/blog/posts?${params}`,
      );
      return { items: result.items, nextCursor: result.nextCursor };
    },
    { search: "", status: "", sort: "created", direction: "desc" },
  );
  async function remove(post: BlogPost) {
    if (
      !(await confirm({
        title: "Delete post?",
        description: `Delete “${post.title}”?`,
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return;
    setActionError(null);
    setBulkOutcome(null);
    try {
      const result = await runOperatorBulkAction({
        resource: "blog-posts",
        action: "delete",
        ids: [post.id],
      });
      if (result.failed.length) throw new Error(result.failed[0]!.message);
      await collection.retry();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to delete post.");
    }
  }
  async function bulk(posts: readonly BlogPost[]) {
    if (
      !(await confirm({
        title: "Delete posts?",
        description: `Delete ${posts.length} selected articles?`,
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return false;
    setActionError(null);
    setBulkOutcome(null);
    try {
      const results = await runOperatorBulkAction({
        resource: "blog-posts",
        action: "delete",
        ids: posts.map((post) => post.id),
      });
      const failures = results.failed;
      if (failures.length)
        setBulkOutcome({
          resource: "blog posts",
          selectedCount: posts.length,
          failures: failures.map(({ id, message }) => ({
            id,
            label: posts.find((post) => post.id === id)?.title ?? id,
            message,
          })),
        });
      await collection.retry();
      return failures.length === 0;
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Unable to delete selected articles.",
      );
      return false;
    }
  }
  const bulkActions: readonly CrudBulkAction<BlogPost>[] = canDelete
    ? [{ value: "delete", label: "Delete", destructive: true, onSelect: bulk }]
    : [];
  const columns: readonly CrudColumn<BlogPost>[] = [
    {
      key: "article",
      label: "Article",
      primary: true,
      render: (post) => (
        <OperatorPrimaryCell
          title={<Link href={`/operator/blog/${post.id}`}>{post.title}</Link>}
          subtitle={`/${post.slug}`}
        />
      ),
    },
    {
      key: "categories",
      label: "Categories",
      render: (post) => post.categories.map((item) => item.name).join(", ") || "—",
    },
    {
      key: "status",
      label: "Status",
      render: (post) => (
        <OperatorStatusCell
          status={post.status}
          label={post.status === "published" ? "Published" : "Draft"}
        />
      ),
    },
    {
      key: "updated",
      label: "Updated",
      render: (post) => new Date(post.updatedAt).toLocaleString(),
    },
  ];
  return (
    <CrudIndex
      eyebrow="Content operations"
      title="Blog"
      description="Manage Markdown drafts and published articles."
      createAction={{ label: "New article", href: "/operator/blog/new" }}
      filters={
        <>
          <OperatorFilterField label="Search" htmlFor="blog-search">
            <Input
              id="blog-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, excerpt, or slug"
            />
          </OperatorFilterField>
          <OperatorFilterField label="Status" htmlFor="blog-status">
            <Select id="blog-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All articles</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </Select>
          </OperatorFilterField>
        </>
      }
      sort={
        <CrudSortSelect
          value={sortChoice}
          onChange={setSortChoice}
          options={[
            { value: "created:desc", label: "Newest", sort: "created", direction: "desc" },
            { value: "created:asc", label: "Oldest", sort: "created", direction: "asc" },
            { value: "title:asc", label: "Title A–Z", sort: "title", direction: "asc" },
            { value: "title:desc", label: "Title Z–A", sort: "title", direction: "desc" },
          ]}
        />
      }
      onFiltersSubmit={async (event) => {
        event.preventDefault();
        setActionError(null);
        setBulkOutcome(null);
        return collection.apply({ search: search.trim(), status, sort, direction });
      }}
      onFiltersReset={async () => {
        const ok = await collection.apply({
          search: "",
          status: "",
          sort: "created",
          direction: "desc",
        });
        if (ok) {
          setSearch("");
          setStatus("");
          setSortChoice("created:desc");
        }
        return ok;
      }}
      filtersDirty={Boolean(search.trim() || status || sortChoice !== "created:desc")}
      toolbarActions={
        <Button type="submit" variant="action" disabled={collection.loading}>
          Apply
        </Button>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(post) => post.id}
      selection={canDelete ? { labelForItem: (post) => `article ${post.title}` } : undefined}
      bulkActions={bulkActions}
      actions={(post) => [
        { type: "link", label: "Edit", href: `/operator/blog/${post.id}` },
        ...(canDelete
          ? [
              {
                type: "action" as const,
                label: "Delete",
                destructive: true,
                onSelect: () => void remove(post),
              },
            ]
          : []),
      ]}
      actionLabel={(post) => `Actions for article ${post.title}`}
      loading={collection.loading}
      beforeTable={
        <div className="grid gap-3">
          {actionError && <OperatorErrorState message={actionError} />}
          {bulkOutcome && <OperatorBulkOutcome outcome={bulkOutcome} />}
        </div>
      }
      error={collection.error}
      onRetry={() => {
        setActionError(null);
        void collection.retry();
      }}
      emptyTitle="No articles found"
      emptyDescription="Try another filter or create the first article."
      pagination={{
        hasPrevious: collection.hasPrevious,
        hasNext: collection.hasNext,
        onPrevious: () => void collection.previous(),
        onNext: () => void collection.next(),
      }}
      sectionTitle="Articles"
    />
  );
}

export function OperatorBlogEditor({ initial }: { initial?: BlogPost }) {
  const confirm = useOperatorConfirmation();
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(
    initial?.categories.map((c) => c.id) ?? [],
  );
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState(initial?.tags.map((t) => t.name).join(", ") ?? "");
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const initialBlogMediaId = initial?.featuredImageUrl
    ? (/^\/media\/blog\/([0-9a-f-]{36})$/i.exec(
        new URL(initial.featuredImageUrl, "http://cliqero.local").pathname,
      )?.[1] ?? null)
    : null;
  const [imageSource, setImageSource] = useState<"uploaded" | "external">(
    initialBlogMediaId ? "uploaded" : "external",
  );
  const [uploadedImageUrl, setUploadedImageUrl] = useState(
    initialBlogMediaId ? (initial?.featuredImageUrl ?? "") : "",
  );
  const [externalImageUrl, setExternalImageUrl] = useState(
    initialBlogMediaId ? "" : (initial?.featuredImageUrl ?? ""),
  );
  const [featuredImageAssetId, setFeaturedImageAssetId] = useState<string | null>(
    initialBlogMediaId,
  );
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "published">(initial?.status ?? "draft");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<BlogPost | null>(initial ?? null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewWindowName = useRef<string | null>(null);
  const stagedImageId = useRef<string | null>(null);
  const featuredImageUrl = imageSource === "uploaded" ? uploadedImageUrl : externalImageUrl;
  useEffect(() => {
    stagedImageId.current = featuredImageAssetId;
  }, [featuredImageAssetId]);
  useEffect(
    () => () => {
      const id = stagedImageId.current;
      if (id)
        void fetch(`/internal/blog/media/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "same-origin",
          keepalive: true,
        });
    },
    [],
  );
  useEffect(() => {
    let active = true;
    void apiFetch<{ items: BlogCategory[] }>("/api/blog/categories")
      .then(({ items }) => {
        if (active) setCategories(items);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load categories.");
      });
    return () => {
      active = false;
    };
  }, []);
  const normalizedTags = tags
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  function requestBody() {
    return {
      title,
      slug: slug || undefined,
      excerpt,
      content,
      status,
      category_ids: categoryIds,
      tags: normalizedTags,
      seo_title: seoTitle || undefined,
      seo_description: seoDescription || undefined,
      featured_image_url: featuredImageUrl || undefined,
    };
  }
  async function uploadFeaturedImage(file: File | undefined) {
    if (!file) return;
    setImageUploading(true);
    setImageError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const result = await apiFetch<{ id: string; url: string }>("/internal/blog/media", {
        method: "POST",
        body,
      });
      const replacedId = stagedImageId.current;
      setFeaturedImageAssetId(result.id);
      stagedImageId.current = result.id;
      setUploadedImageUrl(result.url);
      setImageSource("uploaded");
      if (replacedId && replacedId !== result.id)
        void fetch(`/internal/blog/media/${encodeURIComponent(replacedId)}`, {
          method: "DELETE",
          credentials: "same-origin",
          keepalive: true,
        });
    } catch (cause) {
      setImageError(cause instanceof Error ? cause.message : "Unable to upload featured image.");
    } finally {
      setImageUploading(false);
    }
  }
  async function clearPreview() {
    if (previewId) {
      try {
        await apiFetch(`/internal/blog/previews/${previewId}`, { method: "DELETE" });
      } catch {
        /* Expiry cleanup is the safe fallback. */
      } finally {
        setPreviewId(null);
      }
    }
  }
  async function saveCurrent(honeypot = ""): Promise<BlogPost | null> {
    const honeypotHeaders: Record<string, string> = honeypot
      ? { [HONEYPOT_HEADER_NAME]: honeypot }
      : {};
    setSaving(true);
    setError(null);
    try {
      const body = requestBody();
      const post = saved
        ? await apiFetch<BlogPost>(`/api/blog/posts/${saved.id}`, {
            method: "PATCH",
            headers: { ...honeypotHeaders, "content-type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetch<BlogPost>("/api/blog/posts", {
            method: "POST",
            headers: {
              ...honeypotHeaders,
              "content-type": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify(body),
          });
      setSaved(post);
      if (imageSource === "uploaded" && featuredImageAssetId) stagedImageId.current = null;
      setSlug(post.slug);
      setStatus(post.status);
      setCategoryIds(post.categories.map((c) => c.id));
      if (imageSource === "external" && stagedImageId.current) {
        const unusedUploadId = stagedImageId.current;
        stagedImageId.current = null;
        setFeaturedImageAssetId(null);
        void fetch(`/internal/blog/media/${encodeURIComponent(unusedUploadId)}`, {
          method: "DELETE",
          credentials: "same-origin",
          keepalive: true,
        });
      }
      if (previewId) await clearPreview();
      return post;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save post.");
      return null;
    } finally {
      setSaving(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    const post = await saveCurrent(honeypot);
    if (post) toast.success(initial ? "Post saved." : "Post created.");
  }
  async function remove() {
    if (
      !saved ||
      !(await confirm({
        title: "Delete blog post?",
        description: "This post will be permanently deleted.",
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return;
    try {
      await apiFetch("/api/blog/posts", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [saved.id] }),
      });
      toast.success("Post deleted.");
      router.push("/operator/blog");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete post.");
    }
  }
  async function preview() {
    if (previewing || saving) return;
    previewWindowName.current ??= operatorPreviewWindowName(
      "blog",
      saved?.id ?? crypto.randomUUID(),
    );
    const tab = openOperatorPreviewWindow("about:blank", previewWindowName.current);
    if (!tab) {
      setError("Allow pop-ups to open the private preview.");
      return;
    }
    setPreviewing(true);
    setError(null);
    try {
      const result = await apiFetch<{ previewId: string; url: string }>("/internal/blog/previews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...requestBody(), preview_id: previewId }),
      });
      setPreviewId(result.previewId);
      tab.location.href = `${result.url}${result.url.includes("?") ? "&" : "?"}revision=${Date.now()}`;
    } catch (cause) {
      tab.close();
      setError(cause instanceof Error ? cause.message : "Unable to open preview.");
    } finally {
      setPreviewing(false);
    }
  }
  return (
    <CrudEdit
      mode={saved ? "edit" : "create"}
      backHref="/operator/blog"
      eyebrow="Content operations"
      title={saved ? "Edit article" : "New article"}
      description="Markdown is rendered safely on the public blog."
      saving={saving}
      onSubmit={submit}
      error={error}
      submitLabel="Save"
      savingLabel="Saving…"
      sectionTitle="Article content"
      widthClassName="max-w-5xl"
      headerActions={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={saving || previewing}
            onClick={() => void preview()}
          >
            {previewing ? "Preparing preview…" : "Preview"}
          </Button>
          {saved && (
            <Button type="button" variant="destructive" onClick={() => void remove()}>
              Delete
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4">
        <div>
          <RequiredLabel htmlFor="blog-title">Title</RequiredLabel>
          <Input
            id="blog-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="blog-slug">Slug (optional)</Label>
          <Input
            id="blog-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="generated-from-title"
          />
        </div>
        <div>
          <Label htmlFor="blog-excerpt">Excerpt</Label>
          <Textarea
            id="blog-excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
          />
        </div>
        <div>
          <Label>Content</Label>
          <div className="mt-2 overflow-hidden rounded-md border">
            <BlogEditor markdown={content} onChange={setContent} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="blog-categories">Categories</Label>
            <MultiSelect
              label="Categories"
              inputId="blog-categories"
              options={categories.map((category) => ({ value: category.id, label: category.name }))}
              value={categoryIds}
              onChange={setCategoryIds}
            />
          </div>
          <div>
            <Label htmlFor="blog-tags">Tags (comma separated)</Label>
            <Input id="blog-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="blog-status">Status</Label>
          <Select
            id="blog-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "published")}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </Select>
          <p className="mt-1 text-sm text-slate-600">
            Saving applies the selected status and content to the canonical article.
          </p>
        </div>
        <div className="grid gap-3">
          <Label htmlFor="blog-image-source">Featured image source</Label>
          <Select
            id="blog-image-source"
            value={imageSource}
            onChange={(event) => {
              const nextSource = event.target.value as "uploaded" | "external";
              setImageSource(nextSource);
            }}
          >
            <option value="uploaded">Uploaded image (Cliqero storage)</option>
            <option value="external">External image URL</option>
          </Select>
          {imageSource === "uploaded" && featuredImageAssetId ? (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <p className="break-all text-sm text-slate-600">
                Uploaded image is ready for Cliqero storage.
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={imageUploading}
                onClick={() => {
                  const stagedId = stagedImageId.current;
                  if (stagedId) {
                    stagedImageId.current = null;
                    void fetch(`/internal/blog/media/${encodeURIComponent(stagedId)}`, {
                      method: "DELETE",
                      credentials: "same-origin",
                      keepalive: true,
                    });
                  }
                  setFeaturedImageAssetId(null);
                  setUploadedImageUrl("");
                }}
              >
                Remove image
              </Button>
            </div>
          ) : imageSource === "uploaded" ? (
            <>
              <Label htmlFor="blog-image-upload">Choose uploaded image</Label>
              <Input
                id="blog-image-upload"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                disabled={imageUploading}
                onChange={(event) => void uploadFeaturedImage(event.target.files?.[0])}
              />
            </>
          ) : (
            <>
              <Label htmlFor="blog-image-url">External image URL</Label>
              <Input
                id="blog-image-url"
                type="url"
                maxLength={2000}
                value={externalImageUrl}
                onChange={(event) => setExternalImageUrl(event.target.value)}
              />
            </>
          )}
          {imageUploading && <p role="status">Uploading featured image…</p>}
          {imageError && (
            <p className="text-sm text-red-700" role="alert">
              {imageError}
            </p>
          )}
          <p className="text-xs text-slate-500">
            Uploaded images are validated and stored through the configured Cliqero media provider.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="blog-seo-title">SEO title</Label>
            <Input
              id="blog-seo-title"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="blog-seo-description">SEO description</Label>
            <Textarea
              id="blog-seo-description"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
            />
          </div>
        </div>
      </div>
      <HoneypotField />
    </CrudEdit>
  );
}
