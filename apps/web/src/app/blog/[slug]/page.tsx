import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BlogMarkdown } from "@/components/blog-markdown";
import { getBlogService } from "@/modules/blog/application/blog-service";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogService().get(slug, true);
  if (!post) return { title: "Post not found | Cliqero" };
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
        <Link href="/blog" className="text-sm text-emerald-700 underline">
          ← Back to blog
        </Link>
        <p className="mt-8 text-sm text-slate-500">
          {post.publishedAt?.toLocaleDateString("en-US")}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{post.title}</h1>
        <p className="mt-4 text-xl text-slate-600">{post.excerpt}</p>
        <article className="mt-10">
          <BlogMarkdown content={post.content} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
