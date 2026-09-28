"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { BlogEditor } from "../blog/editor";
import { BlogMarkdown } from "../blog/markdown";
import { apiFetch } from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import type { BlogPost } from "@/modules/blog/domain/blog";
import { HoneypotField } from "../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { OperatorPrimaryCell, OperatorStatusCell } from "./ui/data-cells";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "./crud/index-page";
import { useCrudCollection } from "./crud/use-collection";
import type { CrudColumn } from "./crud/table";
import { CrudEdit } from "./crud/edit";

export function OperatorBlogList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const collection = useCrudCollection(
    async (filters: { search: string; status: string }, cursor) => {
      const params = new URLSearchParams({ limit: "25" });
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
  useEffect(() => {
    void collection.apply({ search: "", status: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function publication(post: BlogPost) {
    setActionError(null);
    try {
      await apiFetch(
        `/api/blog/posts/${post.id}/${post.status === "published" ? "unpublish" : "publish"}`,
        { method: "POST" },
      );
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
      render: (post) => <OperatorStatusCell status={post.status} />,
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
      toolbarActions={
        <Button type="submit" variant="secondary" disabled={collection.loading}>
          Apply
        </Button>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(post) => post.id}
      actions={(post) => [
        { type: "link", label: "View / edit", href: `/operator/blog/${post.id}` },
        {
          type: "action",
          label: post.status === "published" ? "Unpublish" : "Publish",
          onSelect: () => void publication(post),
        },
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
  const [content, setContent] = useState(initial?.content ?? "# New article\n\n");
  const [category, setCategory] = useState(initial?.category?.name ?? "");
  const [tags, setTags] = useState(initial?.tags.map((t) => t.name).join(", ") ?? "");
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [featuredImageUrl, setFeaturedImageUrl] = useState(initial?.featuredImageUrl ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<BlogPost | null>(initial ?? null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
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
        status: status as "draft" | "published",
        category: category || undefined,
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
      setStatus(post.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save post.");
    } finally {
      setSaving(false);
    }
  }
  async function setPublication(next: boolean) {
    if (!saved) return;
    try {
      const post = await apiFetch<BlogPost>(
        `/api/blog/posts/${saved.id}/${next ? "publish" : "unpublish"}`,
        { method: "POST" },
      );
      setSaved(post);
      setStatus(post.status);
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
      submitLabel="Save draft"
      savingLabel="Saving…"
      sectionTitle="Article content"
      widthClassName="max-w-5xl"
      headerActions={
        <>
          {saved && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void setPublication(status !== "published")}
            >
              {status === "published" ? "Unpublish" : "Publish"}
            </Button>
          )}
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
          <details className="mt-3 rounded-md border p-4">
            <summary className="cursor-pointer font-medium">Preview</summary>
            <div className="mt-4">
              <BlogMarkdown content={content} />
            </div>
          </details>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="blog-category">Category</Label>
            <Input
              id="blog-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="blog-tags">Tags (comma separated)</Label>
            <Input id="blog-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
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
