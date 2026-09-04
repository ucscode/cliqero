/* eslint-disable @next/next/no-img-element -- featured image URLs are runtime-configured. */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BlogMarkdown } from "@/components/blog-markdown";
import { getBlogService } from "@/modules/blog/application/blog-service";
import { siteConfig } from "@/config/site";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogService().get(slug, true);
  if (!post) return { title: `Post not found | ${siteConfig.name}` };
  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
    alternates: { canonical: post.canonicalUrl ?? `/blog/${post.slug}` },
    openGraph: {
      title: post.seoTitle ?? post.title,
      description: post.seoDescription ?? post.excerpt,
      images: post.featuredImageUrl ? [post.featuredImageUrl] : undefined,
      type: "article",
    },
  };
}
export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogService().get(slug, true);
  if (!post) notFound();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1 text-sm text-emerald-700 underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to blog
        </Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {post.category?.name ?? "Cliqero Journal"}
          {post.publishedAt && ` · ${post.publishedAt.toLocaleDateString("en-US")}`}
        </p>
        <h1 className="mt-3 !text-4xl !leading-tight !tracking-tight text-slate-900 sm:!text-5xl">
          {post.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">{post.excerpt}</p>
        {post.featuredImageUrl && (
          <img
            src={post.featuredImageUrl}
            alt=""
            className="mt-8 max-h-[30rem] w-full rounded-xl object-cover"
          />
        )}
        <article className="mt-10">
          <BlogMarkdown content={post.content} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
