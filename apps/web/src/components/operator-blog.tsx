"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { BlogEditor } from "./blog-editor";
import { BlogMarkdown } from "./blog-markdown";
import { apiFetch } from "@/lib/api-client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Alert } from "./ui/alert";
import type { BlogPost } from "@/modules/blog/domain/blog";
import { HoneypotField } from "./honeypot-field";

export function OperatorBlogList() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void apiFetch<{ items: BlogPost[] }>("/api/operator/blog?limit=50")
      .then((p) => setPosts(p.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Unable to load blog posts."))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Blog</h2>
          <p className="text-sm text-slate-600">Manage drafts and published articles.</p>
        </div>
        <Button asChild>
          <Link href="/operator/blog/new">New post</Link>
        </Button>
      </div>
      {error && <Alert className="border-red-200 bg-red-50 text-red-800">{error}</Alert>}
      {loading ? (
        <p>Loading posts…</p>
      ) : posts.length ? (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="p-3">Title</th>
                <th className="p-3">Status</th>
                <th className="p-3">Updated</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr className="border-b last:border-0" key={post.id}>
                  <td className="p-3">
                    <Link
                      className="font-medium text-emerald-700 underline"
                      href={`/operator/blog/${post.id}`}
                    >
                      {post.title}
                    </Link>
                    <p className="text-xs text-slate-500">/{post.slug}</p>
                  </td>
                  <td className="p-3">
                    <Badge variant={post.status === "published" ? "default" : "secondary"}>
                      {post.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-slate-600">
                    {new Date(post.updatedAt).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/operator/blog/${post.id}`}>Edit</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card className="p-6">
          <p className="text-slate-600">No posts yet.</p>
        </Card>
      )}
    </div>
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
  async function submit(event: FormEvent) {
    event.preventDefault();
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
            body: JSON.stringify(body),
          })
        : await apiFetch<BlogPost>("/api/blog/posts", {
            method: "POST",
            headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
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
    <form onSubmit={submit} className="space-y-6">
      <HoneypotField />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            {saved ? "Edit post" : "New post"}
          </h2>
          <p className="text-sm text-slate-600">Markdown is rendered safely on the public blog.</p>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
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
        </div>
      </div>
      {error && <Alert className="border-red-200 bg-red-50 text-red-800">{error}</Alert>}
      <Card className="space-y-4 p-6">
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
      </Card>
    </form>
  );
}
