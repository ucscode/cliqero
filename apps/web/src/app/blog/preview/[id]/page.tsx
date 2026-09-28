import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BlogArticle } from "@/components/blog/article";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { getContainer } from "@/infrastructure/container";
import { hasCapability } from "@/modules/identity/capabilities";
import { verifyBlogPreviewToken } from "@/security/blog-preview";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false, noarchive: true } };

export default async function BlogDraftPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ id }, { token }, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  if (!token) notFound();
  const container = getContainer();
  const principal = await container.principalResolver.resolve(
    new Request(`http://localhost/blog/preview/${encodeURIComponent(id)}`, {
      headers: new Headers(requestHeaders),
    }),
  );
  if (
    !principal ||
    principal.kind !== "user_session" ||
    !hasCapability(principal.capabilities, "content.manage")
  )
    notFound();
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || !verifyBlogPreviewToken(token, id, principal.account.id, secret)) notFound();
  const post = container.blog.get(id);
  if (!post || post.status !== "draft") notFound();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-8">
        <p className="mb-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Private draft preview. This page is not publicly indexed or cached.
        </p>
        <BlogArticle post={post} />
      </main>
      <SiteFooter />
    </>
  );
}
