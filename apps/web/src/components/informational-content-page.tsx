import type { ContentMetadata } from "@/content/loader";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function InformationalContentPage({
  meta,
  children,
}: {
  meta: ContentMetadata;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-8">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">{meta.title}</h1>
        {meta.description && <p className="mt-4 text-lg text-slate-600">{meta.description}</p>}
        {meta.updated && <p className="mt-4 text-sm text-slate-500">Updated {meta.updated}</p>}
        <article className="prose-content mt-10">{children}</article>
      </main>
      <SiteFooter />
    </>
  );
}
