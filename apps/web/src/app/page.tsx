import { SiteHeader } from "@/components/site-header";
import { Storefront } from "@/components/storefront";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-8">
        <section className="py-12">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Discover and access
          </p>
          <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900">
            Find something useful, fund your wallet, and get access.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Browse the Cliqero catalogue. Members can also promote listings and earn qualifying
            referral commissions.
          </p>
        </section>
        <Storefront />
      </main>
      <SiteFooter />
    </>
  );
}
