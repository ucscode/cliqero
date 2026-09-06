import { siteConfig } from "@/config/site";
import type { InformationalPage } from "@/content/informational-pages";
import { BlogMarkdown } from "./blog-markdown";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function InformationalContentPage({ page }: { page: InformationalPage }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          {siteConfig.name}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{page.title}</h1>
        {page.description && <p className="mt-4 text-lg text-slate-600">{page.description}</p>}
        {page.updated && <p className="mt-4 text-sm text-slate-500">Updated {page.updated}</p>}
        <article className="mt-10">
          <BlogMarkdown content={page.content} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
