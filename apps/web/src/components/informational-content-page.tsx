import type { InformationalPageMetadata } from "@/content/informational-pages";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function InformationalContentPage({
  page,
  children,
}: {
  page: InformationalPageMetadata;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">{page.title}</h1>
        {page.description && <p className="mt-4 text-lg text-slate-600">{page.description}</p>}
        {page.updated && <p className="mt-4 text-sm text-slate-500">Updated {page.updated}</p>}
        <article className="prose-content mt-10 max-w-prose">{children}</article>
      </main>
      <SiteFooter />
    </>
  );
}
