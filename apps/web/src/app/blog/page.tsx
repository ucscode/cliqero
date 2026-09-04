import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getBlogService } from "@/modules/blog/application/blog-service";
import { siteConfig } from "@/config/site";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: `${siteConfig.name} Blog`,
  description: `Guides and updates from ${siteConfig.name}.`,
  alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
};
type BlogIndexProps = { category?: string; tag?: string; cursor?: string };
export function BlogIndex({ category, tag, cursor }: BlogIndexProps = {}) {
  const page = getBlogService().list({ publishedOnly: true, category, tag, cursor, limit: 12 });
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              {siteConfig.name} Blog
            </p>
            <h1 className="mt-2 text-4xl font-semibold text-slate-900">
              Ideas for buying, access and referrals
            </h1>
          </div>
          <Link className="text-sm text-emerald-700 underline" href="/blog/rss.xml">
            Subscribe via RSS
          </Link>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {page.items.length ? (
            page.items.map((post) => (
              <article className="rounded-xl border bg-white p-6 shadow-sm" key={post.id}>
                <div className="flex flex-wrap gap-2">
                  {post.category && (
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      {post.category.name}
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>
                <p className="mt-3 text-slate-600">{post.excerpt}</p>
                <p className="mt-5 text-sm text-slate-500">
                  {post.publishedAt?.toLocaleDateString("en-US")}
                </p>
              </article>
            ))
          ) : (
            <p className="text-slate-600">No published posts yet.</p>
          )}
        </div>
        {page.nextCursor && (
          <nav className="mt-8 flex justify-end" aria-label="Blog pagination">
            <Link
              className="rounded-md border px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              href={`${category ? `/blog/category/${category}` : tag ? `/blog/tag/${tag}` : "/blog"}?cursor=${encodeURIComponent(page.nextCursor)}`}
            >
              Older posts
            </Link>
          </nav>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams?: Promise<{ cursor?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return <BlogIndex cursor={params.cursor} />;
}
