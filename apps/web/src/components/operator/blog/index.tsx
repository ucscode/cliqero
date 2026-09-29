"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { BlogEditor } from "../../blog/editor";
import { apiFetch } from "@/lib/api-client";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select } from "../../ui/select";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
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
  async function bulk(posts: readonly BlogPost[]) {
    if (!window.confirm(`Delete ${posts.length} selected articles?`)) return false;
    setActionError(null);
    try {
      const { results } = await apiFetch<{ results: Array<{ success: boolean }> }>(
        "/api/operator/blog/bulk",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "delete", ids: posts.map((post) => post.id) }),
        },
      );
      if (results.some((result) => !result.success))
        setActionError("Some selected articles could not be deleted.");
      await collection.retry();
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Unable to delete selected articles.",
      );
      return false;
    }
  }
  const bulkActions: readonly CrudBulkAction<BlogPost>[] = [
    { label: "Delete", destructive: true, onSelect: bulk },
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
      maxRows={collection.maxRows}
      columns={columns}
      getRowKey={(post) => post.id}
      selection={{ labelForItem: (post) => `article ${post.title}`, bulkActions }}
      actions={(post) => [
        { type: "link", label: "View / edit", href: `/operator/blog/${post.id}` },
        { type: "action", label: "Delete", destructive: true, onSelect: () => void remove(post) },
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
  const [categoryIds, setCategoryIds] = useState<string[]>(
    initial?.categories.map((c) => c.id) ?? [],
  );
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState(initial?.tags.map((t) => t.name).join(", ") ?? "");
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [featuredImageUrl, setFeaturedImageUrl] = useState(initial?.featuredImageUrl ?? "");
  const [status, setStatus] = useState<"draft" | "published">(initial?.status ?? "draft");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<BlogPost | null>(initial ?? null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
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
  async function clearPreview() {
    if (previewId) {
      try {
        await apiFetch(`/api/operator/blog/preview/${previewId}`, { method: "DELETE" });
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
      setSlug(post.slug);
      setStatus(post.status);
      setCategoryIds(post.categories.map((c) => c.id));
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
    await saveCurrent(honeypot);
  }
  async function remove() {
    if (!saved || !window.confirm("Delete this blog post?")) return;
    try {
      await apiFetch(`/api/blog/posts/${saved.id}`, { method: "DELETE" });
      router.push("/operator/blog");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete post.");
    }
  }
  async function preview() {
    if (previewing || saving) return;
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      setError("Allow pop-ups to open the private preview.");
      return;
    }
    tab.opener = null;
    setPreviewing(true);
    setError(null);
    try {
      const result = await apiFetch<{ previewId: string; url: string }>(
        "/api/operator/blog/preview",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...requestBody(), preview_id: previewId }),
        },
      );
      setPreviewId(result.previewId);
      tab.location.href = result.url;
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
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="blog-categories">Categories</Label>
            <Select
              id="blog-categories"
              multiple
              value={categoryIds}
              className="h-36"
              onChange={(event) =>
                setCategoryIds(
                  Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                )
              }
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-sm text-slate-600">
              Select one or more existing categories. Use Ctrl/Cmd to change several.
            </p>
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
