import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BlogArticle } from "@/components/blog/article";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { getContainer } from "@/infrastructure/container";
import { hasCapability } from "@/modules/identity/capabilities";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { robots: { index: false, follow: false, noarchive: true } };

export default async function BlogPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, requestHeaders] = await Promise.all([params, headers()]);
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
  const preview = container.blog.getPreview(id, principal.account.id);
  if (!preview) notFound();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-8">
        <p className="mb-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Private preview of current editor content. It expires automatically and is not indexed or
          cached.
        </p>
        <BlogArticle post={preview.payload} />
      </main>
      <SiteFooter />
    </>
  );
}
