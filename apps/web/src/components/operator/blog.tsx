"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { BlogEditor } from "../blog/editor";
import { apiFetch } from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import type { BlogPost } from "@/modules/blog/domain/blog";
import type { BlogCategory } from "@/modules/blog/domain/blog";
import { HoneypotField } from "../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { OperatorPrimaryCell, OperatorStatusCell } from "./ui/data-cells";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "./crud/index-page";
import { useCrudCollection } from "./crud/use-collection";
import type { CrudColumn } from "./crud/table";
import { CrudEdit } from "./crud/edit";
import type { CrudBulkAction } from "./crud/bulk-actions";

export function OperatorBlogList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const collection = useCrudCollection(
    async (filters: { search: string; status: string }, cursor, pageSize) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (cursor) params.set("cursor", cursor);
      const result = await apiFetch<{ items: BlogPost[]; nextCursor: string | null }>(
        `/api/operator/blog?${params}`,
      );
      return { items: result.items, nextCursor: result.nextCursor };
    },
    { search: "", status: "" },
  );
  async function publication(post: BlogPost, desired: "publish" | "unpublish") {
    setActionError(null);
    try {
      await apiFetch(`/api/blog/posts/${post.id}/${desired}`, { method: "POST" });
      await collection.retry();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to update publication.");
    }
  }
  async function remove(post: BlogPost) {
    if (!window.confirm(`Delete “${post.title}”?`)) return;
    setActionError(null);
    try {
      await apiFetch(`/api/blog/posts/${post.id}`, { method: "DELETE" });
      await collection.retry();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to delete post.");
    }
  }
  async function bulk(action: "publish" | "unpublish" | "delete", posts: readonly BlogPost[]) {
    if (action === "delete" && !window.confirm(`Delete ${posts.length} selected articles?`))
      return false;
    setActionError(null);
    try {
      const { results } = await apiFetch<{
        results: Array<{ id: string; success: boolean; error?: string }>;
      }>("/api/operator/blog/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ids: posts.map((post) => post.id) }),
      });
      const failures = results.filter((result) => !result.success);
      if (failures.length)
        setActionError(
          `${failures.length} article${failures.length === 1 ? "" : "s"} could not be updated.`,
        );
      await collection.retry();
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Unable to update selected articles.",
      );
      return false;
    }
  }
  const bulkActions: readonly CrudBulkAction<BlogPost>[] = [
    { label: "Publish", onSelect: (posts) => bulk("publish", posts) },
    { label: "Unpublish", onSelect: (posts) => bulk("unpublish", posts) },
    { label: "Delete", destructive: true, onSelect: (posts) => bulk("delete", posts) },
  ];
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
    { key: "category", label: "Category", render: (post) => post.category?.name ?? "—" },
    {
      key: "status",
      label: "Status",
      render: (post) => (
        <OperatorStatusCell
          status={
            post.publicationStatus === "published" && post.hasWorkingRevision
              ? "published-pending"
              : post.publicationStatus
          }
          label={
            post.publicationStatus === "published" && post.hasWorkingRevision
              ? "Published · pending changes"
              : post.publicationStatus === "published"
                ? "Published"
                : "Draft"
          }
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
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title, excerpt, or slug"
            />
          </OperatorFilterField>
          <OperatorFilterField label="Status" htmlFor="blog-status">
            <Select
              id="blog-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All articles</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </Select>
          </OperatorFilterField>
        </>
      }
      onFiltersSubmit={(event) => {
        event.preventDefault();
        setActionError(null);
        void collection.apply({ search: search.trim(), status });
      }}
      onFiltersReset={async () => {
        const ok = await collection.apply({ search: "", status: "" });
        if (ok) {
          setSearch("");
          setStatus("");
        }
        return ok;
      }}
      filtersDirty={Boolean(search.trim() || status)}
      toolbarActions={
        <Button type="submit" variant="secondary" disabled={collection.loading}>
          Apply
        </Button>
      }
      items={collection.items}
      pageSize={collection.pageSizeControl}
      columns={columns}
      getRowKey={(post) => post.id}
      selection={
        collection.maxBulkSelection
          ? {
              enabled: true,
              max: collection.maxBulkSelection,
              labelForItem: (post) => `Select article ${post.title}`,
              bulkActions,
            }
          : undefined
      }
      actions={(post) => [
        { type: "link", label: "View / edit", href: `/operator/blog/${post.id}` },
        ...(post.hasWorkingRevision
          ? [
              {
                type: "action" as const,
                label: post.publicationStatus === "published" ? "Publish changes" : "Publish",
                onSelect: () => void publication(post, "publish"),
              },
            ]
          : []),
        ...(post.publicationStatus === "published"
          ? [
              {
                type: "action" as const,
                label: "Unpublish",
                onSelect: () => void publication(post, "unpublish"),
              },
            ]
          : []),
        {
          type: "action",
          label: "Delete",
          destructive: true,
          separatorBefore: true,
          onSelect: () => void remove(post),
        },
      ]}
      actionLabel={(post) => `Actions for article ${post.title}`}
      loading={collection.loading}
      error={actionError ?? collection.error}
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
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category?.id ?? "");
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState(initial?.tags.map((t) => t.name).join(", ") ?? "");
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [featuredImageUrl, setFeaturedImageUrl] = useState(initial?.featuredImageUrl ?? "");
  const [desiredStatus, setDesiredStatus] = useState(initial?.desiredStatus ?? "draft");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<BlogPost | null>(initial ?? null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    let active = true;
    void apiFetch<{ items: BlogCategory[] }>("/api/operator/blog/categories")
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
  const dirty =
    !saved ||
    Boolean(
      title !== saved.title ||
      slug !== saved.slug ||
      excerpt !== saved.excerpt ||
      content !== saved.content ||
      categoryId !== (saved.category?.id ?? "") ||
      tags !== saved.tags.map((tag) => tag.name).join(", ") ||
      seoTitle !== (saved.seoTitle ?? "") ||
      seoDescription !== (saved.seoDescription ?? "") ||
      featuredImageUrl !== (saved.featuredImageUrl ?? "") ||
      desiredStatus !== saved.desiredStatus,
    );

  async function saveCurrent(honeypot = ""): Promise<BlogPost | null> {
    const honeypotHeaders: Record<string, string> = honeypot
      ? { [HONEYPOT_HEADER_NAME]: honeypot }
      : {};
    setSaving(true);
    setError(null);
    try {
      const body = {
        title,
        slug: slug || undefined,
        excerpt,
        content,
        desired_status: desiredStatus,
        category_id: categoryId || null,
        tags: tags
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        seo_title: seoTitle || undefined,
        seo_description: seoDescription || undefined,
        featured_image_url: featuredImageUrl || undefined,
      };
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
      setSlug(post.slug);
      setDesiredStatus(post.desiredStatus);
      return post;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save post.");
      return null;
    } finally {
      setSaving(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    await saveCurrent(honeypot);
  }
  async function setPublication() {
    if (!saved) return;
    try {
      const post = await apiFetch<BlogPost>(
        `/api/blog/posts/${saved.id}/${desiredStatus === "published" ? "publish" : "unpublish"}`,
        { method: "POST" },
      );
      setSaved(post);
      setDesiredStatus(post.desiredStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update publication.");
    }
  }
  async function remove() {
    if (!saved || !window.confirm("Delete this blog post?")) return;
    try {
      await apiFetch(`/api/blog/posts/${saved.id}`, { method: "DELETE" });
      router.push("/operator/blog");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete post.");
    }
  }
  async function preview() {
    if (previewing || saving || (saved && !saved.hasWorkingRevision && !dirty)) return;
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      setError("Allow pop-ups to open the private draft preview.");
      return;
    }
    tab.opener = null;
    setPreviewing(true);
    setError(null);
    try {
      const workingPost = dirty ? await saveCurrent() : saved;
      if (!workingPost) {
        tab.close();
        return;
      }
      const result = await apiFetch<{ url: string; revisionId: string }>(
        `/api/operator/blog/posts/${workingPost.id}/preview`,
        { method: "POST" },
      );
      tab.location.href = result.url;
    } catch (cause) {
      tab.close();
      setError(cause instanceof Error ? cause.message : "Unable to open draft preview.");
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
          {saved &&
            (saved.publicationStatus !== desiredStatus ||
              (saved.hasWorkingRevision && desiredStatus === "published")) && (
              <Button
                type="button"
                variant="secondary"
                disabled={saving || dirty}
                onClick={() => void setPublication()}
              >
                {desiredStatus === "published"
                  ? saved.publicationStatus === "published"
                    ? "Publish changes"
                    : "Publish"
                  : "Apply status"}
              </Button>
            )}
          {(dirty || saved?.hasWorkingRevision) && (
            <Button
              type="button"
              variant="secondary"
              disabled={saving || previewing}
              onClick={() => void preview()}
            >
              {previewing ? "Preparing preview…" : dirty ? "Save & Preview" : "Preview"}
            </Button>
          )}
          <Button asChild type="button" variant="outline">
            <Link href="/operator/blog/categories">Manage categories</Link>
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
          <Label htmlFor="blog-title">Title</Label>
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
          {saved && !saved.hasWorkingRevision && !dirty && (
            <p className="mt-2 text-sm text-slate-600">
              Save changes to create a private preview revision.
            </p>
          )}
          {dirty && saved?.hasWorkingRevision && (
            <p className="mt-2 text-sm text-slate-600">
              Preview will save your changes as a new working revision first.
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="blog-category">Category</Label>
            <Select
              id="blog-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">No category</option>
              {categories.map((categoryOption) => (
                <option key={categoryOption.id} value={categoryOption.id}>
                  {categoryOption.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="blog-tags">Tags (comma separated)</Label>
            <Input id="blog-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <div>
            <Label htmlFor="blog-desired-status">Working revision status</Label>
            <Select
              id="blog-desired-status"
              value={desiredStatus}
              onChange={(event) => setDesiredStatus(event.target.value as "draft" | "published")}
            >
              <option value="draft">Draft / unpublished</option>
              <option value="published">Published when applied</option>
            </Select>
          </div>
          {saved && (
            <p className="text-sm text-slate-600">
              Current publication: {saved.publicationStatus === "published" ? "Published" : "Draft"}
              {saved.hasWorkingRevision ? " · unpublished changes saved" : ""}. Saving never changes
              the public article.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="blog-image">Featured image URL</Label>
          <Input
            id="blog-image"
            type="url"
            value={featuredImageUrl}
            onChange={(e) => setFeaturedImageUrl(e.target.value)}
          />
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
