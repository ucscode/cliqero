import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { BlogArticle } from "@/components/blog/article";
import { getBlogService } from "@/infrastructure/blog/service";
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
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1 text-sm text-emerald-700 underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to blog
        </Link>
        <BlogArticle post={post} />
      </main>
      <SiteFooter />
    </>
  );
}
