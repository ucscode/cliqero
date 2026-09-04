/* eslint-disable @next/next/no-img-element -- featured image URLs are runtime-configured. */

import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getBlogService } from "@/modules/blog/application/blog-service";
import { siteConfig } from "@/config/site";
import { Separator } from "@/components/ui/separator";
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
            <h1 className="mt-2 !text-5xl !leading-tight !tracking-tight text-slate-900 sm:!text-6xl">
              Ideas for buying, access and referrals
            </h1>
          </div>
          <Link className="text-sm text-emerald-700 underline" href="/blog/rss.xml">
            Subscribe via RSS
          </Link>
        </div>
        <div className="mt-10 divide-y divide-slate-200">
          {page.items.length ? (
            page.items.map((post) => (
              <article
                className="grid gap-4 py-8 first:pt-0 sm:grid-cols-[minmax(0,1fr)_220px]"
                key={post.id}
              >
                {post.featuredImageUrl ? (
                  <img
                    src={post.featuredImageUrl}
                    alt=""
                    className="order-2 aspect-[16/10] w-full rounded-lg object-cover sm:order-none"
                  />
                ) : null}
                <div className={post.featuredImageUrl ? "sm:col-start-1 sm:row-start-1" : ""}>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {post.category && (
                      <span className="text-emerald-700">{post.category.name}</span>
                    )}
                    {post.category && post.publishedAt && <span aria-hidden="true">·</span>}
                    {post.publishedAt && (
                      <time>{post.publishedAt.toLocaleDateString("en-US")}</time>
                    )}
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold leading-tight text-slate-900">
                    <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                  </h2>
                  <p className="mt-3 max-w-2xl leading-relaxed text-slate-600">{post.excerpt}</p>
                  <Link
                    className="mt-1 inline-flex text-sm font-semibold text-emerald-700 underline"
                    href={`/blog/${post.slug}`}
                  >
                    Read article
                  </Link>
                </div>
                {post.featuredImageUrl && <Separator className="sm:hidden" />}
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
