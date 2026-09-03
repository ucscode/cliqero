import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

export function PublicPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Cliqero</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-4 text-lg text-slate-600">{intro}</p>
        <div className="mt-10 space-y-8 text-slate-700">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
